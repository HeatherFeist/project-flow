-- Project Flow — client hub link, quote deposits, Stripe Connect (v41)
--
-- A client hub is a private link (no account) that shows one client's
-- quotes and invoices. Stripe Connect stores the business's own connected
-- Stripe account so card and bank payments land there. An optional deposit
-- on a quote is the amount the client can pay up front.
--
-- Safe to run more than once. Needs the team-accounts script (v29) first,
-- because the Connect table uses is_team_admin.

alter table clients add column if not exists hub_token uuid;
update clients set hub_token = gen_random_uuid() where hub_token is null;
alter table clients alter column hub_token set default gen_random_uuid();
alter table clients alter column hub_token set not null;
create unique index if not exists clients_hub_token_idx on clients (hub_token);

alter table quotes add column if not exists deposit_cents integer;

create table if not exists stripe_connect_accounts (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_account_id text not null,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table stripe_connect_accounts enable row level security;

drop policy if exists "stripe_connect_accounts: admin read" on stripe_connect_accounts;
create policy "stripe_connect_accounts: admin read" on stripe_connect_accounts
  for select using (is_team_admin(owner_id));
