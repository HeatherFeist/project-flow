-- Project Flow — client properties and automatic review requests (v44)
--
-- A client can have more than one address. Completing a job can text or
-- email a Google review link when the business turns that on. The link
-- itself already lives on profiles.google_review_link.
--
-- Safe to run more than once. Needs the team-accounts script (v29).

create table if not exists client_properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  label text not null,
  address text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table client_properties enable row level security;

drop policy if exists "client_properties: team read/write" on client_properties;
create policy "client_properties: team read/write" on client_properties
  for all using (is_team_member(owner_id)) with check (is_team_member(owner_id));

create index if not exists client_properties_client_id_idx on client_properties (client_id);

alter table profiles add column if not exists auto_review_request boolean not null default false;
alter table jobs add column if not exists review_requested_at timestamptz;
