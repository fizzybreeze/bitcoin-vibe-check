-- Say the closed-ness out loud, so the advisors stay at zero.
--
-- 20260809120000 created `push_evaluate_log` with every grant revoked and RLS
-- enabled and **no policy at all**, on the reasoning that an absent policy is
-- the strongest possible statement: RLS with nothing permissive in front of it
-- denies every row to every role that does not bypass it, and `service_role`
-- (the sender) plus the job's own SECURITY DEFINER function are the entire
-- intended access list.
--
-- That reasoning is sound and the outcome was still wrong for this repo,
-- because it left a standing `rls_enabled_no_policy` INFO lint on the security
-- advisors — and the rule in CLAUDE.md is that they stay at zero. The whole
-- argument for that rule is the one 20260808150000 made when it threw away a
-- working SECURITY DEFINER RPC over two permanent WARNs: a lint everybody knows
-- to ignore is worse than no lint, because the next real one arrives into a
-- list people have already learned to skim.
--
-- The fix is not to weaken anything. An explicit deny-all policy is exactly
-- what the absence already meant, written down where `pg_policies` can show it:
--
--   * `for all` — every verb, so no future migration can add one this misses.
--   * `to public` — every non-bypassing role, present and future. `anon` and
--     `authenticated` are the ones that exist today; naming them instead would
--     leave a hole the day a third is added.
--   * `using (false)` selects no existing row; `with check (false)` refuses
--     every new one. Both halves are needed — `using` alone would still permit
--     an INSERT, since there is no existing row for it to test.
--
-- Belt and braces with the revoked grants rather than a replacement for them,
-- and deliberately so: 20260808100000 established that grants and RLS are two
-- different gates, after TRUNCATE turned out to bypass RLS entirely. This
-- closes the RLS gate explicitly; the grants keep the verb gate shut.
--
-- `service_role` is unaffected — it has BYPASSRLS, which is what lets
-- api/push-evaluate.js write the log at all.

create policy "no client may read or write the evaluator log"
  on public.push_evaluate_log
  for all
  to public
  using (false)
  with check (false);
