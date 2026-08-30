-- Project Flow — subcontractor pay guidelines (v31)
--
-- A reference calculator, not a rule the app enforces — the GC decides
-- what to actually pay a sub (subcontractors.pay_cents, docs/schema_v30),
-- this just gives a consistent, transparent starting point instead of
-- eyeballing it differently every time.
--
-- The math (using the owner's own numbers, defaults shown):
--   total_cents   = material_cost_cents * materials_multiplier   (default 4x)
--   materials     = total_cents * materials_pct        (default 25%)
--   overhead      = total_cents * overhead_pct          (default 25%)
--   labor_pool    = total_cents - materials - overhead  (default 50%)
--   gc_take       = labor_pool * gc_labor_share_pct     (default 50% of the pool)
--   suggested_sub_pay = labor_pool - gc_take

create table if not exists pay_guidelines (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  materials_multiplier numeric not null default 4,
  materials_pct numeric not null default 25,
  overhead_pct numeric not null default 25,
  gc_labor_share_pct numeric not null default 50,
  updated_at timestamptz not null default now()
);

alter table pay_guidelines enable row level security;

create policy "pay_guidelines: admin read/write" on pay_guidelines
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));
