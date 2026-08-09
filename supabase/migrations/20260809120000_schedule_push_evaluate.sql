-- The clock behind the sender (roadmap §4.1b).
--
-- pg_cron, not GitHub Actions and not Vercel Cron, and the roadmap measured
-- rather than assumed why: snapshot.yml asks for 06:17 UTC and its scheduled
-- runs have started at 09:10, which is fine for a daily row and disqualifying
-- for a price alert; Vercel Hobby crons fire once a day. pg_cron holds its
-- schedule to the minute, and both it and pg_net are already installed here.
--
-- Every five minutes. The arithmetic the roadmap left open: 288 ticks a day is
-- ~8.6k Vercel invocations a month, and a tick with no pending rules makes no
-- upstream request at all — the route narrows its fetches to the sources the
-- stored rules actually name. Five minutes is also about as coarse as a price
-- alert can be before the number in the notification stops matching the number
-- that caused it.

-- ─── The lesson this migration is written around ─────────────────────────────
--
-- `donor-email-worker` ran every minute for months against an edge function
-- that never existed. Every response was a 404 and pg_cron logged "succeeded"
-- on all of them, because `net.http_post` returns as soon as the request is
-- *queued* — it reports nothing about what came back. That job was removed in
-- 20260805063000, and repeating its shape here would be the same mistake with a
-- better cause.
--
-- So the request id is kept. `net._http_response` holds the real status code
-- (pg_net prunes it after a few hours), and this table is the join key plus a
-- durable record of when the tick fired. Checking whether the sender is alive
-- is then one query rather than an act of faith:
--
--   select l.fired_at, r.status_code, r.content
--   from public.push_evaluate_log l
--   left join net._http_response r on r.id = l.request_id
--   order by l.fired_at desc limit 20;
--
-- A `status_code` of null on a row older than a few minutes means the response
-- was pruned, not that nothing came back. A row of 401s means the bearer token
-- in Vault disagrees with the one in Vercel; a row of 503s means the Vercel
-- environment is missing a variable and the route is refusing to pretend
-- otherwise.

create table if not exists public.push_evaluate_log (
  id         bigint generated always as identity primary key,
  fired_at   timestamptz not null default now(),
  request_id bigint
);

create index if not exists push_evaluate_log_fired_at_idx
  on public.push_evaluate_log (fired_at desc);

-- Nothing in the browser has any business reading this, and the anon key is
-- public by design. Revoke before granting anything back — the rule
-- 20260808100100 established after TRUNCATE turned out to bypass RLS.
revoke all on public.push_evaluate_log from anon, authenticated;
revoke all on sequence public.push_evaluate_log_id_seq from anon, authenticated;

-- RLS with no policy at all: enabled so the advisors stay clean and so the
-- table is closed by default. service_role bypasses it; nothing else may reach
-- it, which is the intended access list in full.
alter table public.push_evaluate_log enable row level security;

-- Keep the log from becoming the largest thing in the database. 288 rows a day
-- is ~100k a year; a week is plenty to answer "is it running", which is the
-- only question this table exists for.
create or replace function public.trim_push_evaluate_log()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_evaluate_log where fired_at < now() - interval '7 days'
$$;

revoke all on function public.trim_push_evaluate_log() from public, anon, authenticated;

-- ─── The credentials, which are NOT in this file ─────────────────────────────
--
-- The URL is not secret; the bearer token is the only thing standing between an
-- anonymous POST and a notification to every subscriber, so it is read from
-- Vault at call time rather than baked into a job definition that shows up in
-- `cron.job` for anyone who can read it. This repo is public and the Make.com
-- webhook in the baseline migration set the precedent: capability values are
-- documented here and stored elsewhere.
--
-- Set both by hand, once, before the schedule below does anything useful:
--
--   select vault.create_secret(
--     'https://bitcoinvibecheck.com/api/push-evaluate', 'push_evaluate_url', '');
--   select vault.create_secret('<the same value as Vercel''s
--     PUSH_EVALUATE_SECRET>', 'push_evaluate_secret', '');
--
-- Rotating the token is `vault.update_secret` here and an environment variable
-- there, in either order — a few minutes of 401s in the log is the whole cost.

create or replace function public.trigger_push_evaluate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text;
  bearer     text;
  req_id     bigint;
begin
  select decrypted_secret into target_url
  from vault.decrypted_secrets where name = 'push_evaluate_url';

  select decrypted_secret into bearer
  from vault.decrypted_secrets where name = 'push_evaluate_secret';

  -- Fails soft and says so. An unconfigured job that quietly does nothing is
  -- the donor-email-worker again; an unconfigured job that raises would turn
  -- every cron tick into an error in the Postgres log until somebody set a
  -- secret. A warning is the honest middle, and it lands where the operator is
  -- already looking when they wonder why nothing arrived.
  if target_url is null or bearer is null then
    raise warning '[push-evaluate] vault secrets push_evaluate_url / push_evaluate_secret are not set; skipping tick';
    return;
  end if;

  select net.http_post(
    url     := target_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || bearer
               ),
    body    := '{}'::jsonb,
    -- Comfortably over the route's own 10s upstream timeout, so a slow push
    -- service produces a real status code here rather than a timeout that says
    -- nothing about which half was slow.
    timeout_milliseconds := 30000
  ) into req_id;

  insert into public.push_evaluate_log (request_id) values (req_id);
end;
$$;

revoke all on function public.trigger_push_evaluate() from public, anon, authenticated;

-- Unschedule first so re-running this migration re-points an existing job
-- rather than failing on the duplicate name.
select cron.unschedule('push-evaluate')
where exists (select 1 from cron.job where jobname = 'push-evaluate');

select cron.schedule(
  'push-evaluate',
  '*/5 * * * *',
  $$select public.trigger_push_evaluate()$$
);

select cron.unschedule('push-evaluate-log-trim')
where exists (select 1 from cron.job where jobname = 'push-evaluate-log-trim');

select cron.schedule(
  'push-evaluate-log-trim',
  '17 4 * * *',
  $$select public.trim_push_evaluate_log()$$
);
