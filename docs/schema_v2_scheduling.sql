-- Project Flow — scheduling & email schema (v2)
-- Run this after docs/schema.sql. Adds: Google account connections,
-- business-hours settings, quote accept/decline tokens, and the link from
-- a scheduled job back to the quote + Google Calendar event that created it.

-- One Google account per app user, used both to read Calendar free/busy and
-- to send quote emails via Gmail as that user. Populated client-side after
-- `supabase.auth.signInWithOAuth` with the calendar + gmail.send scopes —
-- see src/lib/googleAuth.ts.
create table if not exists google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table google_connections enable row level security;

create policy "google_connections: owner read/write" on google_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Business-hours / scheduling settings, one row per user (extends profiles
-- rather than bloating it, since it's only read by the scheduling functions).
create table if not exists scheduling_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'America/New_York',
  work_days smallint[] not null default '{1,2,3,4,5}', -- 0=Sun .. 6=Sat
  work_start_minutes int not null default 480,  -- 8:00am
  work_end_minutes int not null default 1020,   -- 5:00pm
  slot_duration_minutes int not null default 120,
  booking_horizon_days int not null default 14,
  updated_at timestamptz not null default now()
);

alter table scheduling_settings enable row level security;

create policy "scheduling_settings: owner read/write" on scheduling_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Quotes: token-based public accept/decline + send tracking.
alter table quotes add column if not exists accept_token uuid not null default gen_random_uuid();
alter table quotes add column if not exists sent_at timestamptz;
alter table quotes add column if not exists responded_at timestamptz;
create unique index if not exists quotes_accept_token_idx on quotes (accept_token);

-- Jobs: track the quote + Google Calendar event a scheduled job came from.
alter table jobs add column if not exists quote_id uuid references quotes (id) on delete set null;
alter table jobs add column if not exists google_event_id text;

-- NOTE: quotes stays owner-only under RLS (see docs/schema.sql). The public
-- accept/decline/scheduling page at /q/:token never talks to Postgres
-- directly — it only calls the `quote-response`, `available-slots`, and
-- `book-slot` edge functions, which use the service-role key server-side to
-- read/write the one quote matching the token in the URL. Do not add a
-- public SELECT policy on quotes; that would expose every quote to anyone.
