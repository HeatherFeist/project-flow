-- Project Flow — subcontractors on a quote/invoice (v30)
--
-- The client pays the general contractor one lump sum, exactly like
-- before — Project Flow never touches or splits anyone's money. This
-- table is pure information: who's working on the job, what they're
-- responsible for, what they're being paid, and (for the GC's own eyes
-- only) how to actually pay them — their own PayPal/Cash App handle.
--
-- Visibility is split deliberately:
--   - The client (public quote page, public invoice pay page) only ever
--     sees name + scope_of_work — never pay_cents, never a payment
--     handle. Keeps the GC's arrangement with their subs private.
--   - The GC (signed in) sees everything, so after a milestone payment
--     lands they have a ready reference for who to pay and where.
--
-- Attached to the quote (not the job) since it's part of the estimate;
-- the invoice created on quote acceptance already carries quote_id, so
-- the invoice-facing views just look this table up via that.

create table if not exists subcontractors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  quote_id uuid not null references quotes (id) on delete cascade,
  name text not null,
  scope_of_work text not null,
  pay_cents integer,
  paypal_handle text, -- email or paypal.me link
  cashapp_handle text, -- $cashtag
  created_at timestamptz not null default now()
);

alter table subcontractors enable row level security;

create policy "subcontractors: admin read/write" on subcontractors
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

create index if not exists subcontractors_quote_id_idx on subcontractors (quote_id);
