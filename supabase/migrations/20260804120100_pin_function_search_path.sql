-- Pin the search_path on public.enqueue_donor_email() so it cannot be hijacked
-- by a caller-controlled schema (Supabase linter 0011_function_search_path_mutable).
--
-- Safe to apply: the function's only object reference (public.donor_email_queue)
-- is already fully qualified.
--
-- NOTE: this function is currently orphaned — public.donor_email_queue does not
-- exist, and no trigger references the function. It is a candidate for removal;
-- left in place here because dropping it is out of scope for a security fix.
alter function public.enqueue_donor_email() set search_path = '';
