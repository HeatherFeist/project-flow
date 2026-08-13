-- Project Flow — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Every table is scoped to owner_id = auth.uid() via RLS, so each signed-in
-- user only ever sees their own business's data.

create extension if not exists "pgcrypto";

-- One row per user, holds business-facing details shown on quotes/invoices.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create type job_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  description text,
  status job_status not null default 'scheduled',
  scheduled_at timestamptz,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create type quote_status as enum ('draft', 'sent', 'accepted', 'declined');

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  status quote_status not null default 'draft',
  total_cents integer not null default 0,
  notes text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue');

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  quote_id uuid references quotes (id) on delete set null,
  status invoice_status not null default 'draft',
  total_cents integer not null default 0,
  due_date date,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Row Level Security -----------------------------------------------------

alter table profiles enable row level security;
alter table clients enable row level security;
alter table jobs enable row level security;
alter table job_notes enable row level security;
alter table quotes enable row level security;
alter table invoices enable row level security;

create policy "profiles: owner read/write" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "clients: owner read/write" on clients
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "jobs: owner read/write" on jobs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "job_notes: owner read/write" on job_notes
  for all using (
    exists (select 1 from jobs where jobs.id = job_notes.job_id and jobs.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from jobs where jobs.id = job_notes.job_id and jobs.owner_id = auth.uid())
  );

create policy "quotes: owner read/write" on quotes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "invoices: owner read/write" on invoices
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Indexes ------------------------------------------------------------------

create index if not exists clients_owner_id_idx on clients (owner_id);
create index if not exists jobs_owner_id_idx on jobs (owner_id);
create index if not exists jobs_client_id_idx on jobs (client_id);
create index if not exists job_notes_job_id_idx on job_notes (job_id);
create index if not exists quotes_owner_id_idx on quotes (owner_id);
create index if not exists invoices_owner_id_idx on invoices (owner_id);
