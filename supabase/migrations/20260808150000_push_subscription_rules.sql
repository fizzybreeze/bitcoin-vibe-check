-- Alert rules on a push subscription, so §4.1b's evaluator has something to
-- evaluate. Until now rules lived only in the browser's localStorage, which is
-- exactly where a server-side sender cannot see them.
--
-- The problem this migration exists to solve is *writing* them. A browser has
-- to change its own rules whenever the visitor adds or removes an alert, and
-- there is no login to scope that to. A plain UPDATE policy cannot do it:
-- PostgREST honours an unfiltered UPDATE, so `using (true)` does not mean
-- "change your own row", it means anyone holding the anon key rewrites every
-- subscriber's alerts in one request — the same trap the missing DELETE policy
-- avoided in 20260808100000.
--
-- The answer is that the browser proves possession of a secret it generated at
-- subscribe time, and RLS itself does the scoping. An unfiltered UPDATE is then
-- harmless: the policy matches exactly the one row whose secret the caller can
-- present, so "update everything" and "update mine" are the same statement.
--
-- Deliberately NOT a SECURITY DEFINER function, which was the first attempt.
-- It worked and it measured clean, but it left two permanent WARNs on the
-- Supabase security advisors ("Public Can Execute SECURITY DEFINER Function"),
-- and this repo's rule is that the advisors stay at zero. A standing warning
-- that everyone knows to ignore is worse than no warning, and the RLS version
-- below needs no elevated privilege at all.

alter table public.push_subscriptions
  -- What the evaluator reads: an array of rules in the shape `alertRules.js`
  -- produces. Screened again on the way out, because a value stored here is a
  -- value some client chose.
  add column if not exists rules jsonb not null default '[]'::jsonb,
  -- SHA-256 of the browser's secret, hex. The secret itself never reaches the
  -- database, so a leaked dump does not let anyone rewrite rules — only the
  -- browser holding the original can.
  add column if not exists secret_hash text,
  add column if not exists rules_updated_at timestamptz;

-- Bounded, because this is reachable from a public write endpoint and an
-- unbounded jsonb column is free storage for anyone who wants it. 50 rules is
-- far more than the panel can produce; 16 kB is the backstop for one enormous
-- rule.
alter table public.push_subscriptions
  add constraint push_subscriptions_rules_bounded
  check (
    jsonb_typeof(rules) = 'array'
    and jsonb_array_length(rules) <= 50
    and pg_column_size(rules) <= 16384
  );

-- Exactly a hex SHA-256, so nothing else can be stored here and make the
-- comparison below behave oddly.
alter table public.push_subscriptions
  add constraint push_subscriptions_secret_hash_shape
  check (secret_hash is null or secret_hash ~ '^[0-9a-f]{64}$');

/**
 * The hash of the secret this request presented, or NULL if it presented none.
 *
 * SECURITY INVOKER (the default) on purpose — it reads only the request's own
 * headers and needs no privilege, which is what keeps the advisors clean.
 * NULL rather than the hash of an empty string, because NULL compares equal to
 * nothing and so a request with no header matches no row; hashing '' would
 * match any row that somehow stored that hash.
 */
create or replace function public.request_push_secret_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(
           nullif(current_setting('request.headers', true), '')::json ->> 'x-push-secret',
           ''
         ) = '' then null
    else encode(
           extensions.digest(
             current_setting('request.headers', true)::json ->> 'x-push-secret',
             'sha256'
           ),
           'hex'
         )
  end
$$;

-- `rules_updated_at` is maintained here rather than granted to the client, so
-- the column grant below can stay down to a single column and the timestamp
-- cannot be back-dated by whoever is writing.
create or replace function public.touch_push_rules_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rules_updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_rules on public.push_subscriptions;
create trigger push_subscriptions_touch_rules
  before update of rules on public.push_subscriptions
  for each row execute function public.touch_push_rules_updated_at();

-- Column-level, so an UPDATE can reach `rules` and nothing else. Without this
-- the policy would let a caller who holds one secret rewrite their own
-- endpoint, keys, or secret_hash — the last of which would let them keep the
-- row after the browser that owns it has moved on.
grant update (rules) on public.push_subscriptions to anon, authenticated;

create policy "browser updates the rules on its own subscription"
  on public.push_subscriptions for update to public
  using (
    secret_hash is not null
    and secret_hash = public.request_push_secret_hash()
  )
  with check (
    secret_hash is not null
    and secret_hash = public.request_push_secret_hash()
  );

-- Still no SELECT policy, and that is not an oversight: the browser already
-- holds the authoritative copy of its rules in localStorage, and being unable
-- to read this table back means a stolen anon key cannot be used to find out
-- what anybody is watching. It also means an UPDATE cannot return the changed
-- row, so the client must not chain `.select()` — same rule as the insert.
