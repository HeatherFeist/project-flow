-- Project Flow — job checklists, job costing, and expense tracking (v24)
--
-- Three features, two new tables (job costing and expense tracking share
-- one ledger — see below):
--
-- job_checklist_items — a simple ordered checkbox list per job. Separate
-- from the existing freeform job_notes, since a checklist needs
-- done/not-done state per line, not just a timestamped log.
--
-- expenses — one ledger for both "what did this job cost me" and
-- "what did the business spend this month." A line optionally points at
-- a job (job_id) — set it and the line counts toward that job's costing;
-- leave it null for general overhead (insurance, office supplies, a tool
-- that isn't tied to one job). A line can also optionally point at a
-- Materials catalog item (material_id) so its cost stays connected to
-- your Materials records, but it's not required — plenty of expenses
-- (fuel, permits, labor) aren't materials at all.
--
-- Job costing itself isn't a new table — the "Job Costing" card on a job
-- just sums this job's expenses.amount_cents against that job's linked
-- invoice(s)/quote total, computed in the app rather than stored.

create table if not exists job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table job_checklist_items enable row level security;

create policy "job_checklist_items: owner read/write" on job_checklist_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists job_checklist_items_job_id_idx on job_checklist_items (job_id, position);

create type expense_category as enum (
  'material', 'labor', 'fuel', 'tools_equipment', 'permits_fees', 'vehicle', 'insurance', 'office', 'other'
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  material_id uuid references materials (id) on delete set null,
  category expense_category not null default 'other',
  description text not null,
  quantity numeric not null default 1,
  amount_cents integer not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "expenses: owner read/write" on expenses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists expenses_owner_id_idx on expenses (owner_id, expense_date desc);
create index if not exists expenses_job_id_idx on expenses (job_id);
