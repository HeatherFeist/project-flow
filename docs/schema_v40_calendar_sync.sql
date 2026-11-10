-- Project Flow — Google Calendar sync status (v40)
--
-- Records whether each job made it onto the owner's Google Calendar,
-- the link to open that event, and the last error if a sync failed.
-- Safe to run more than once.

alter table jobs add column if not exists google_event_url text;
alter table jobs add column if not exists calendar_sync_error text;
alter table jobs add column if not exists calendar_sync_status text;

alter table jobs drop constraint if exists jobs_calendar_sync_status_check;
alter table jobs add constraint jobs_calendar_sync_status_check
  check (calendar_sync_status is null or calendar_sync_status in ('synced', 'failed', 'not_connected'));
