-- Project Flow — automatic appointment reminders (v23)
--
-- The existing "Text reminder" button on a job (send-job-reminder) was
-- always a manual send. This adds a real automatic version: an hourly
-- scheduled job (send-scheduled-reminders) texts a client X hours before
-- their appointment, where X is each owner's own
-- scheduling_settings.reminder_hours_before (0 = automatic reminders
-- off, which is the effective default until an owner turns it on in
-- Settings → Scheduling).
--
-- jobs.reminder_sent_at makes this idempotent — the hourly run only ever
-- sends one automatic reminder per job.
--
-- No new tables for "Leads & Requests" or the Quotes pipeline view — both
-- reuse clients.source and the already-existing (but previously
-- unused-in-the-UI) service_requests table, and quotes.status,
-- respectively.

alter table scheduling_settings add column if not exists reminder_hours_before int not null default 24;
alter table jobs add column if not exists reminder_sent_at timestamptz;

create index if not exists jobs_pending_reminder_idx on jobs (owner_id, scheduled_at)
  where reminder_sent_at is null and status = 'scheduled';

-- One-time setup: schedule the hourly reminder run. Requires the
-- pg_cron and pg_net extensions (Database -> Extensions in the Supabase
-- dashboard, or the two `create extension` lines below if you have
-- permission to run them from the SQL editor).
--
-- Replace the two placeholders before running:
--   <PROJECT_REF>      your Supabase project ref, e.g. gkzddhskefldotphilif
--   <SERVICE_ROLE_KEY>  Settings -> API -> service_role secret key
--                        (NOT the anon/public key — this needs full access)
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'send-scheduled-reminders-hourly',
--   '0 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-scheduled-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
