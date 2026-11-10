-- Project Flow — quote follow-ups, overdue invoices, reminder log (v42)
--
-- Visit texts already run from send-scheduled-reminders. This adds
-- per-business on/off switches and templates for quote follow-ups,
-- overdue invoice reminders, and visit email, plus a log of what was sent.
-- Safe to run more than once. Needs the team-accounts script (v29).

alter table quotes add column if not exists followup_sent_at timestamptz;
alter table invoices add column if not exists overdue_reminder_sent_at timestamptz;

create table if not exists reminder_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  quote_followup_enabled boolean not null default false,
  quote_followup_days integer not null default 3,
  quote_followup_email boolean not null default true,
  quote_followup_sms boolean not null default false,
  quote_followup_template text not null default 'Hi {client_name}, just checking in on your quote from {business_name}. You can review it here: {link}',
  invoice_reminder_enabled boolean not null default false,
  invoice_reminder_days integer not null default 1,
  invoice_reminder_email boolean not null default true,
  invoice_reminder_sms boolean not null default false,
  invoice_reminder_template text not null default 'Hi {client_name}, your invoice from {business_name} for {amount} is past due. You can pay here: {link}',
  visit_email_enabled boolean not null default false,
  visit_sms_enabled boolean not null default true,
  visit_template text not null default 'Reminder from {business_name}: "{job}" is scheduled for {when}. Reply if you need to reschedule.',
  updated_at timestamptz not null default now()
);

create table if not exists reminder_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  kind text not null check (kind in ('quote_followup', 'invoice_overdue', 'visit')),
  channel text not null check (channel in ('email', 'sms')),
  body text not null,
  related_id uuid,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

alter table reminder_settings enable row level security;
alter table reminder_log enable row level security;

drop policy if exists "reminder_settings: admin read/write" on reminder_settings;
create policy "reminder_settings: admin read/write" on reminder_settings
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "reminder_log: admin read" on reminder_log;
create policy "reminder_log: admin read" on reminder_log
  for select using (is_team_admin(owner_id));

create index if not exists reminder_log_owner_created_idx on reminder_log (owner_id, created_at desc);
