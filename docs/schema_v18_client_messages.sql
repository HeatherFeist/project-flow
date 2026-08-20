-- Project Flow — structured communications log (v18)
-- Replaces the old hack of appending inbound texts as plain-text lines
-- into clients.notes with a real, timestamped, structured log — inbound
-- and outbound, texts and calls — so a client's Communications timeline
-- actually looks and behaves like a CRM's, not a growing string blob.

create table if not exists client_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  channel text not null, -- 'sms' | 'call' | 'email'
  direction text not null, -- 'inbound' | 'outbound'
  body text not null,
  created_at timestamptz not null default now()
);

alter table client_messages enable row level security;

create policy "client_messages: owner read/write" on client_messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists client_messages_client_id_idx on client_messages (client_id, created_at);
