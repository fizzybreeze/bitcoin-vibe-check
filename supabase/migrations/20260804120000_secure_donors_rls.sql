-- Lock down public.donors.
--
-- Context: a SELECT policy ("Allow public read of approved donors") already
-- existed on this table, but RLS was never enabled — so the policy was inert
-- and the table was fully readable and writable by anyone holding the anon key,
-- which ships in the client bundle by design (VITE_ prefix) on a public repo.
--
-- Enabling RLS on its own would have broken donor submissions, because no
-- INSERT policy existed while the app inserts with the anon key. Both changes
-- therefore have to land in the same migration.

-- Anyone may submit a name, but never pre-approve their own. The with-check
-- mirrors exactly what the app sends: .insert({ name, approved: false }).
create policy "public submits unapproved donors"
  on public.donors for insert to public
  with check (approved = false);

-- Enforce the client's own 2–50 character rule server-side; the client check
-- is trivially bypassable on a public write endpoint.
alter table public.donors
  add constraint donors_name_length
  check (name is not null and char_length(name) between 2 and 50);

-- With RLS on and no UPDATE/DELETE policy for anon, those operations are denied
-- outright. Approving a name requires the service role (dashboard or a trusted
-- server context), never the anon key.
alter table public.donors enable row level security;
