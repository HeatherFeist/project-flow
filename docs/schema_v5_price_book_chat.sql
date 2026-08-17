-- Project Flow — Price Book + estimate chatbot schema (v5)
-- Run after docs/schema.sql, schema_v2_scheduling.sql, schema_v3_twilio.sql.

-- Homewyse has no public API or licensed data feed for third-party apps,
-- so this is a business-owned reference table instead: typical job types
-- and rough price ranges the estimate chatbot draws from when a customer
-- describes their job. Nick (or whoever) maintains these to match his
-- actual rates — Project Flow seeds reasonable starting values, but they're
-- not sourced from Homewyse's proprietary data.
create table if not exists price_book_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  item_name text not null,
  unit text not null default 'flat', -- 'flat' | 'per hour' | 'per sq ft' | 'per linear ft'
  low_cents integer not null,
  high_cents integer not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table price_book_items enable row level security;

create policy "price_book_items: owner read/write" on price_book_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists price_book_items_owner_id_idx on price_book_items (owner_id);

-- The estimate-chat edge function is public (no login) and stateless — the
-- browser holds the running conversation and resends it each turn, so no
-- table is needed to store chat transcripts for v1.
