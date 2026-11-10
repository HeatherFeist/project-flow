-- Project Flow — job end time (v39)
--
-- Jobs already have a start (scheduled_at). This adds when the visit ends
-- so a job can be rescheduled with a real duration. Leave it empty when
-- the end isn't known. Existing jobs are unchanged.
--
-- Safe to run more than once.

alter table jobs add column if not exists ends_at timestamptz;
