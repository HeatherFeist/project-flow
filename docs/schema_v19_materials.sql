-- Project Flow — materials catalog (v19)
-- A separate list from the Price Book: the Price Book is what you charge
-- customers per job type; this is what you actually pay for supplies —
-- product name, cost, which store, and its SKU/product page link so
-- reordering the exact same item later (on homedepot.com / lowes.com) is
-- one click instead of a re-search.

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text,
  supplier text, -- e.g. 'Home Depot', 'Lowe's', 'Other'
  sku text,
  unit text not null default 'each',
  cost_cents integer not null,
  product_url text,
  notes text,
  created_at timestamptz not null default now()
);

alter table materials enable row level security;

create policy "materials: owner read/write" on materials
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists materials_owner_id_idx on materials (owner_id);
