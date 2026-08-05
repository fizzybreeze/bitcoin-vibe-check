-- Remove the abandoned queue-based donor email design.
--
-- The pg_cron job `donor-email-worker-every-minute` POSTed to a
-- `donor-email-worker` edge function every minute. That function does not
-- exist: every row in net._http_response is a 404 ("Requested function was not
-- found"), and had been since the job was created in May — roughly 1,440 wasted
-- requests a day, ~98,000 in total.
--
-- pg_cron recorded all 95,670 of those runs as "succeeded", because
-- net.http_post reports only that it queued the request, not that the request
-- worked. The job status was therefore green the whole time it was doing
-- nothing.
--
-- public.enqueue_donor_email() belonged to the same design: it inserts into
-- public.donor_email_queue, a table that does not exist, and no trigger
-- references it.
--
-- The live donor notification path is NOT affected. That is the
-- new_donor_notification trigger on public.donors, which calls
-- supabase_functions.http_request against a Make.com webhook. It is entirely
-- independent of both objects removed here, and was verified still present
-- after this migration ran.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'donor-email-worker-every-minute') then
    perform cron.unschedule('donor-email-worker-every-minute');
  end if;
end $$;

drop function if exists public.enqueue_donor_email();
