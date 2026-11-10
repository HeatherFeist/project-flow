-- Project Flow — recurring visits, crew assignment, clock in/out (v43)
--
-- Crew is the existing field_tech role (renamed in the app). The account
-- holder is the owner. Admins already exist. This adds a repeating
-- schedule that creates normal jobs, who a visit is assigned to, and
-- clock in/out rows for that visit.
--
-- Safe to run more than once. Needs the team-accounts script (v29).

create table if not exists job_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  description text,
  address text,
  cadence text not null check (cadence in ('weekly', 'monthly', 'custom')),
  interval_count integer not null default 1 check (interval_count > 0),
  weekdays smallint[] not null default '{}',
  day_of_month integer,
  start_date date not null,
  until_date date,
  duration_minutes integer,
  assigned_to uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table jobs add column if not exists assigned_to uuid references auth.users (id) on delete set null;
alter table jobs add column if not exists series_id uuid references job_series (id) on delete set null;
alter table jobs add column if not exists ends_at timestamptz;

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);

alter table job_series enable row level security;
alter table time_entries enable row level security;

drop policy if exists "job_series: admin read/write" on job_series;
create policy "job_series: admin read/write" on job_series
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "time_entries: team read" on time_entries;
create policy "time_entries: team read" on time_entries
  for select using (is_team_member(owner_id));

drop policy if exists "time_entries: self clock in" on time_entries;
create policy "time_entries: self clock in" on time_entries
  for insert with check (is_team_member(owner_id) and user_id = auth.uid());

drop policy if exists "time_entries: self clock out" on time_entries;
create policy "time_entries: self clock out" on time_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists jobs_assigned_to_idx on jobs (assigned_to, scheduled_at);
create index if not exists jobs_series_id_idx on jobs (series_id, scheduled_at);
create index if not exists time_entries_job_idx on time_entries (job_id, clock_in);
