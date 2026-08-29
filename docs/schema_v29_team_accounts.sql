-- Project Flow — team accounts (v29)
--
-- Up through v28, Project Flow was strictly one login per business —
-- every table's RLS was "auth.uid() = owner_id", full stop. That's the
-- single biggest ceiling on a growing business: no way to add a helper
-- or a second crew member without handing them the owner's own login
-- and password.
--
-- This adds team_members and swaps every owner-scoped RLS policy for a
-- helper-function check instead of a raw auth.uid() = owner_id
-- comparison. For a solo owner with no team, behavior is IDENTICAL —
-- the helper functions return true for auth.uid() = owner_id exactly
-- like before. Nothing changes for Nick until he actually invites
-- someone.
--
-- Two roles, kept deliberately simple for v1:
--   'admin'      — everything the owner can do (quotes, invoices,
--                   payments, settings, materials/price book, the
--                   works). Effectively a second owner.
--   'field_tech' — the field-facing surface only: clients, jobs, job
--                   photos, job checklists. Not quotes, invoices,
--                   payments, materials cost data, expenses, any
--                   Settings page, or team management itself (Twilio/
--                   Stripe/PayPal keys, Google connection, scheduling,
--                   inviting/removing people). This split can be
--                   loosened per-table later if a business wants field
--                   techs seeing more.
--
-- Billing (subscriptions) and the support inbox escalation
-- (support_tickets) are deliberately NOT extended to team members here
-- — those stay tied to the original account holder only.

create type team_role as enum ('admin', 'field_tech');
create type team_member_status as enum ('invited', 'active', 'removed');

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade, -- null until the invite is accepted
  email text not null,
  role team_role not null default 'field_tech',
  status team_member_status not null default 'invited',
  invite_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table team_members enable row level security;

create index if not exists team_members_owner_id_idx on team_members (owner_id);
create index if not exists team_members_user_id_idx on team_members (user_id) where user_id is not null;
create unique index if not exists team_members_invite_token_idx on team_members (invite_token);

-- True for the account holder themselves, or an ACTIVE team member of
-- theirs (any role). Used on tables the whole team touches day to day.
-- security definer so its own internal lookup against team_members
-- doesn't get tangled in team_members' own RLS below.
create or replace function is_team_member(target_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = target_owner or exists (
    select 1 from team_members
    where owner_id = target_owner and user_id = auth.uid() and status = 'active'
  );
$$;

-- True for the account holder themselves, or an active team member with
-- the 'admin' role. Used on quotes/invoices/payments/settings/etc, and
-- on team_members itself — an admin manages the team same as the owner.
create or replace function is_team_admin(target_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = target_owner or exists (
    select 1 from team_members
    where owner_id = target_owner and user_id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- The owner or an admin team member manages the team (invite/remove/
-- change role); a field_tech doesn't get to add more people.
create policy "team_members: owner/admin manages the team" on team_members
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

create policy "team_members: a member can see their own membership row" on team_members
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Field-facing tables: any active team member (admin or field_tech).
-- ---------------------------------------------------------------------

drop policy if exists "clients: owner read/write" on clients;
create policy "clients: team read/write" on clients
  for all using (is_team_member(owner_id)) with check (is_team_member(owner_id));

drop policy if exists "jobs: owner read/write" on jobs;
create policy "jobs: team read/write" on jobs
  for all using (is_team_member(owner_id)) with check (is_team_member(owner_id));

drop policy if exists "job_photos: owner read/write" on job_photos;
create policy "job_photos: team read/write" on job_photos
  for all using (is_team_member(owner_id)) with check (is_team_member(owner_id));

drop policy if exists "job_checklist_items: owner read/write" on job_checklist_items;
create policy "job_checklist_items: team read/write" on job_checklist_items
  for all using (is_team_member(owner_id)) with check (is_team_member(owner_id));

-- job_notes has no owner_id of its own (scoped via its parent job) — the
-- original policy already goes through jobs, which now covers the team
-- automatically via the policy above. No change needed there.

-- ---------------------------------------------------------------------
-- Business/financial/settings tables: admin (or the owner) only.
-- ---------------------------------------------------------------------

drop policy if exists "quotes: owner read/write" on quotes;
create policy "quotes: admin read/write" on quotes
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "invoices: owner read/write" on invoices;
create policy "invoices: admin read/write" on invoices
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "invoice_milestones: owner read/write" on invoice_milestones;
create policy "invoice_milestones: admin read/write" on invoice_milestones
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "service_requests: owner read/write" on service_requests;
create policy "service_requests: admin read/write" on service_requests
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "client_messages: owner read/write" on client_messages;
create policy "client_messages: admin read/write" on client_messages
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "materials: owner read/write" on materials;
create policy "materials: admin read/write" on materials
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "price_book_items: owner read/write" on price_book_items;
create policy "price_book_items: admin read/write" on price_book_items
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "quote_visualizations: owner read/write" on quote_visualizations;
create policy "quote_visualizations: admin read/write" on quote_visualizations
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "payment_settings: owner read/write" on payment_settings;
create policy "payment_settings: admin read/write" on payment_settings
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "expenses: owner read/write" on expenses;
create policy "expenses: admin read/write" on expenses
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

drop policy if exists "google_connections: owner read/write" on google_connections;
create policy "google_connections: admin read/write" on google_connections
  for all using (is_team_admin(user_id)) with check (is_team_admin(user_id));

drop policy if exists "scheduling_settings: owner read/write" on scheduling_settings;
create policy "scheduling_settings: admin read/write" on scheduling_settings
  for all using (is_team_admin(user_id)) with check (is_team_admin(user_id));

drop policy if exists "twilio_settings: owner read/write" on twilio_settings;
create policy "twilio_settings: admin read/write" on twilio_settings
  for all using (is_team_admin(user_id)) with check (is_team_admin(user_id));
