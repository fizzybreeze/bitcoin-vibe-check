-- Let the browser put a WHERE clause on its own rules update.
--
-- 20260808150000 built the rules sync around an *unfiltered* UPDATE, scoped
-- entirely by RLS: the policy matches only the row whose `secret_hash` equals
-- the hash of the request's `x-push-secret` header, so "update everything" and
-- "update mine" are the same statement. The security reasoning was right and
-- still stands. **The transport does not allow it.**
--
--   PATCH /rest/v1/push_subscriptions   (no filter)
--   → 400  {"code":"21000","message":"UPDATE requires a WHERE clause"}
--
-- PostgREST refuses an unfiltered UPDATE before Postgres ever sees it, so no
-- policy of ours was ever consulted. That was measurable from the start and was
-- not measured: v1.7.8 verified this path with `set role anon` in SQL, where
-- there is no PostgREST, and reported "an unfiltered update presenting one
-- browser's secret affected 1 row, not 2" — true, and about a code path the
-- browser cannot reach. The result was a subscription with rules that were
-- always `[]`, and therefore a sender with nothing to send, which nothing on
-- screen revealed because `syncRules` returned `!error` into a void.
--
-- A filter needs SELECT privilege on the column it names — PostgREST says so
-- outright: "Grant the required privileges to the current role with: GRANT
-- SELECT ON public.push_subscriptions TO anon". Granting that on the *table* is
-- exactly what 20260808100000 refused to do, and still refuses: `endpoint` is a
-- capability and a durable browser identifier, and a readable endpoint column
-- is an enumeration oracle for every subscriber.
--
-- So the grant is **column-level, on `secret_hash` alone**. What that permits:
--
--   * naming `secret_hash` in a WHERE clause, which is all PostgREST wants;
--   * nothing else. `endpoint`, `p256dh` and `auth` stay unreadable.
--
-- What it does not permit, and why this is not a hole:
--
--   * **Reading anybody's hash.** There is still no SELECT *policy*, so
--     `GET /push_subscriptions?select=secret_hash` returns `[]` — the grant is
--     the verb gate, RLS is the row gate, and only one of them has moved. The
--     v1.7.6 lesson, applied in the direction it was learned.
--   * **Guessing a row.** Filtering on a hash requires knowing the hash, which
--     requires the 256-bit secret it is the SHA-256 of. That is the same work
--     as guessing the secret, which is the thing the design already rests on.
--   * **Widening the write.** The UPDATE policy is unchanged and still demands
--     a matching `x-push-secret` header, so the filter is belt to the policy's
--     braces: a request naming somebody else's hash without their secret
--     matches zero rows, and one presenting a secret without the matching
--     filter now simply fails at the transport. Both gates must agree.
--
-- The column grant from 20260808150000 (`grant update (rules)`) is untouched:
-- writing is still confined to that one column.

grant select (secret_hash) on public.push_subscriptions to anon, authenticated;

-- The grant alone is not enough, and the reason is the part of RLS that is easy
-- to forget: **an UPDATE with a WHERE clause has to read the rows it filters**,
-- so SELECT *policies* apply to it as well as UPDATE policies. With none, the
-- filter matched nothing and the write silently affected zero rows — measured,
-- not assumed: `PATCH ...?secret_hash=eq.<correct>` with the correct
-- `x-push-secret` header returned `204` with `content-range: */0`.
--
-- That is the same trap as v1.7.6 seen from a third side. Grants decide which
-- verbs, policies decide which rows, and a statement that both reads and writes
-- needs the pair to agree on *both* counts.
--
-- So: a SELECT policy scoped to exactly the row the caller can already prove it
-- owns. This is deliberately not the general SELECT policy 20260808100000
-- refused — that one would have exposed every subscriber's endpoint to anyone
-- holding the anon key. This one returns at most one row, to a caller who
-- presented the 256-bit secret for it, and the column grant above means the
-- only field they can read is the hash they just computed themselves.
--
-- Without a valid header, `request_push_secret_hash()` is NULL, which compares
-- equal to nothing — so an anonymous reader still sees an empty array, and
-- there is still no way to confirm a guessed endpoint.
create policy "browser reads only the subscription it holds the secret for"
  on public.push_subscriptions for select to public
  using (
    secret_hash is not null
    and secret_hash = public.request_push_secret_hash()
  );
