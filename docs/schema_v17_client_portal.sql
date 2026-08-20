-- Project Flow — client portal (v17)
-- A persistent, signed-in-feeling dashboard for clients — see all their
-- jobs/quotes/invoices in one place, approve a quote, pay a milestone,
-- and ask for additional work — instead of only ever getting one-off
-- links (/q/:token, /pay/:token) that go stale once used.
--
-- Clients are NOT Supabase Auth users (no passwords, no new auth
-- provider) — this is a lightweight email magic-link flow: request a
-- login link, click it, get a long-lived session token stored in the
-- browser. Both tables below are service-role-only (no RLS policies —
-- same pattern as google_oauth_states), since only the portal edge
-- functions ever touch them.

create table if not exists client_portal_login_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table client_portal_login_tokens enable row level security;

create table if not exists client_portal_sessions (
  token uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table client_portal_sessions enable row level security;

-- Requests a client submits from the portal ("I'd also like...") — shows
-- up for the owner to review, doesn't create a Quote/Job automatically
-- since that needs a human judgment call on scope/pricing.
create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  message text not null,
  status text not null default 'new', -- 'new' | 'reviewed'
  created_at timestamptz not null default now()
);

alter table service_requests enable row level security;

create policy "service_requests: owner read/write" on service_requests
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists client_portal_login_tokens_client_id_idx on client_portal_login_tokens (client_id);
create index if not exists client_portal_sessions_client_id_idx on client_portal_sessions (client_id);
create index if not exists service_requests_owner_id_idx on service_requests (owner_id, status);
