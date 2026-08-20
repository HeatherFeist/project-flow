-- Project Flow — payment milestones on invoices (v14)
-- Lets an invoice be split into a sequence of payments (e.g. a deposit,
-- then progress payments at set points, then a final payment) instead of
-- one lump total the client pays whenever/however much they like. When an
-- invoice has milestones, the /pay/:token page shows them in order — only
-- the next unpaid one is payable, so a client can't skip ahead.
--
-- Invoices with no milestones keep working exactly as before (the
-- free-form "pay any partial amount" flow) — this is purely additive.

create table if not exists invoice_milestones (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  amount_cents integer not null,
  sequence integer not null,
  status text not null default 'pending', -- 'pending' | 'paid'
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table invoice_milestones enable row level security;

create policy "invoice_milestones: owner read/write" on invoice_milestones
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists invoice_milestones_invoice_id_idx on invoice_milestones (invoice_id, sequence);

-- Ties a payment back to the specific milestone it settled, when the
-- invoice uses milestones (null for the free-form partial-payment flow).
alter table invoice_payments add column if not exists milestone_id uuid references invoice_milestones (id) on delete set null;
