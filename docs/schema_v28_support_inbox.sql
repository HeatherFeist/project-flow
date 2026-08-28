-- Project Flow — support chat escalation + admin inbox (v28)
--
-- Extends the existing in-app Help Assistant (app-help-chat) with an
-- escalation path: when Claude judges it can't actually resolve
-- something (an account/billing issue, a bug report, or the owner just
-- asking for a person), it creates a support ticket instead of just
-- answering as best it can. Heather/the Project Flow team then works
-- those tickets from a real inbox inside the app
-- (Settings... no, /admin/support), rather than everything just being an
-- email that's easy to lose track of.
--
-- profiles.is_admin is the platform-team flag (separate from
-- profiles.is_exempt, which is about billing) — set manually via SQL for
-- whoever should see the cross-tenant support inbox:
--   update profiles set is_admin = true where id = '<your user id>';

alter table profiles add column if not exists is_admin boolean not null default false;

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text,
  subject text not null,
  status text not null default 'open', -- 'open' | 'answered' | 'closed'
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author text not null, -- 'owner' | 'support'
  body text not null,
  created_at timestamptz not null default now()
);

alter table support_tickets enable row level security;
alter table support_ticket_replies enable row level security;

-- An owner can see their own tickets; an admin (is_admin) can see and
-- manage everyone's — this is the one legitimate cross-tenant read in
-- the whole schema, scoped tightly to this one table pair.
create policy "support_tickets: owner read own" on support_tickets
  for select using (auth.uid() = owner_id);

create policy "support_tickets: admin read/write all" on support_tickets
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "support_ticket_replies: owner read own ticket's replies" on support_ticket_replies
  for select using (exists (select 1 from support_tickets t where t.id = ticket_id and t.owner_id = auth.uid()));

create policy "support_ticket_replies: admin read/write all" on support_ticket_replies
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

create index if not exists support_tickets_owner_id_idx on support_tickets (owner_id, created_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status, created_at desc);
create index if not exists support_ticket_replies_ticket_id_idx on support_ticket_replies (ticket_id, created_at);
