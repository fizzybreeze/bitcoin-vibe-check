-- Web Push subscriptions: one row per browser that has opted in to alerts that
-- fire with the tab closed (roadmap §4.1a).
--
-- No login means the push endpoint *is* the identity. There is no user id to
-- scope a policy to, and nothing an anon client can prove about which row is
-- its own — it holds the same key everybody else does, because that key ships
-- in the client bundle by design. That single fact decides every policy below,
-- so it is worth stating plainly rather than discovering later.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  -- The push service's URL for this browser. Unique because re-subscribing in
  -- the same browser yields the same endpoint, and two rows for one device
  -- would mean two notifications for one alert.
  endpoint   text not null unique,
  -- The two halves of the client's encryption keypair, as the Push API hands
  -- them over. Stored verbatim: the sender needs them to encrypt a payload,
  -- and neither is useful without the VAPID private key, which lives in the
  -- server environment and never touches this table.
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Enforce the shape server-side. The client checks these too, but this is a
-- public write endpoint and a client check on one is a suggestion — the
-- `donors_name_length` constraint is the precedent. Bounds are generous
-- against the real values (Chrome and Mozilla endpoints run ~200-300 chars,
-- p256dh is 87-88 base64url chars, auth is 22-24) and exist to stop the table
-- being used as free text storage, not to be exact.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https
  check (endpoint like 'https://%' and char_length(endpoint) between 20 and 2048);

alter table public.push_subscriptions
  add constraint push_subscriptions_keys_bounded
  check (char_length(p256dh) between 1 and 255 and char_length(auth) between 1 and 255);

alter table public.push_subscriptions enable row level security;

-- Narrow the table grants before writing a single policy, because RLS is not
-- the whole story: **TRUNCATE bypasses row-level security entirely**, and
-- Supabase's default grants hand `anon` TRUNCATE along with everything else.
-- Measured rather than assumed — with RLS on and only the INSERT policy below,
-- `set role anon; truncate public.push_subscriptions;` succeeded and emptied
-- the table, while every DELETE and UPDATE correctly affected 0 rows.
--
-- PostgREST maps no HTTP verb to TRUNCATE, so this was not reachable from the
-- deployed app. That is a reason it was not urgent, not a reason to leave it:
-- "the API cannot currently express it" is a property of today's PostgREST,
-- not an access control, and this table's whole threat model is that the key
-- in front of it is public.
revoke all on public.push_subscriptions from anon, authenticated;
grant insert on public.push_subscriptions to anon, authenticated;

-- Anyone may subscribe themselves. There is nothing to constrain in the
-- with-check the table constraints above do not already cover: unlike
-- `donors`, where `approved = false` stops a submitter pre-approving their own
-- name, a subscription has no privileged column to protect.
create policy "public subscribes itself"
  on public.push_subscriptions for insert to public
  with check (true);

-- Deliberately no SELECT policy.
--
-- A push endpoint is a capability: anyone holding it, plus the VAPID private
-- key, can deliver a notification to that device. It is also a durable
-- pseudonymous identifier for a browser. Neither belongs behind a key that
-- ships in the bundle, and the app has no reason to read this table — the
-- browser learns whether it is subscribed from `pushManager.getSubscription()`,
-- which is local truth and cannot be stale.
--
-- Note this also means the client must never ask PostgREST to return the
-- inserted row: supabase-js `.insert()` without `.select()` sends
-- `Prefer: return=minimal`, which needs no read. Adding `.select()` would turn
-- every successful subscribe into a 403.

-- Deliberately no DELETE policy, which is the load-bearing one.
--
-- PostgREST honours an *unfiltered* DELETE, so a `using (true)` delete policy
-- would not mean "delete your own row" — it would mean anyone holding the anon
-- key can empty the table in one request. Scoping it instead to "rows whose
-- endpoint you can name" is no better: with no SELECT policy an attacker
-- cannot discover endpoints, but a policy cannot tell a filtered request from
-- an unfiltered one, so `using (true)` is what it would have to be either way.
--
-- Unsubscribing therefore happens in the browser, where it actually belongs:
-- `subscription.unsubscribe()` invalidates the endpoint at the push service,
-- so no further notification can be delivered to it whatever this table says.
-- The row becomes garbage, and §4.1b's sender reaps it on the first 410 Gone —
-- which is the standard Web Push lifecycle and the same code path that handles
-- a browser the visitor simply uninstalled.

-- Deliberately no UPDATE policy: nothing in a subscription is meant to change.
-- A rotated keypair arrives as a new endpoint, and therefore a new row.
--
-- The sender runs as service_role, which bypasses RLS, so reaping and reading
-- need no policy here.
