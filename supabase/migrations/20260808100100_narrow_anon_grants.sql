-- Take TRUNCATE (and the rest of what is unused) away from `anon` on the two
-- tables that predate `push_subscriptions`.
--
-- Found while building §4.1a's RLS and measured, not theorised: with RLS
-- enabled and no DELETE policy, `set role anon; delete from …` correctly
-- affects 0 rows — but **TRUNCATE bypasses row-level security entirely**, and
-- Supabase's default grants hand `anon` TRUNCATE on every table in `public`.
-- Against a freshly created `push_subscriptions` with RLS on, `truncate` as
-- anon emptied the table.
--
-- Neither table is reachable this way today, because PostgREST maps no HTTP
-- verb to TRUNCATE and the anon *role* is only reachable through PostgREST —
-- a direct Postgres connection needs the database password, not the anon JWT.
-- That is why this is hardening rather than an incident. It is still worth
-- doing: "the API cannot currently express it" is a property of this version
-- of PostgREST, not an access control, and the key in front of both tables is
-- public by design.
--
-- Each table keeps exactly what the app uses and nothing else. Checked against
-- the code rather than guessed:
--   donors            — SELECT (approved supporter names, SupporterTickerCard)
--                       and INSERT (DonationCard). Never updated or deleted by
--                       the client; approving a name is a service-role job.
--   metric_snapshots  — SELECT only, from `useVibeHistory` in the browser and
--                       from `api/chain-data.js`'s MVRV fallback. Every write
--                       is the service-role snapshot job.
--
-- RLS still decides *which rows*; these grants decide *which verbs*. Both
-- matter, and the TRUNCATE result is the reason to say so out loud.

revoke all on public.donors from anon, authenticated;
grant select, insert on public.donors to anon, authenticated;

revoke all on public.metric_snapshots from anon, authenticated;
grant select on public.metric_snapshots to anon, authenticated;
