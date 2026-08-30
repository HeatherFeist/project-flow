-- Project Flow — subcontractor sign-off + estimate payment timeline (v32)
--
-- Two additions, both still information-only — the client still only ever
-- pays the general contractor, and Project Flow still never touches or
-- splits anyone's money:
--
-- 1. Subcontractor sign-off. Before an estimate goes to the client, the GC
--    can send each subcontractor a link to their own scope of work and
--    pay so they can agree to it by typing their name. Once every sub the
--    GC wants signed has signed, the GC sends the estimate to the client
--    with confidence everyone's already on the same page. Signing is
--    never enforced by the app (see docs/schema_v30_subcontractors.sql
--    for the same "reference, not required" philosophy) — the GC can
--    still send the estimate to the client at any time regardless of
--    sign-off status.
--
-- 2. A payment timeline on the estimate itself. Payment milestones
--    (deposit, progress payments, final) could previously only be set up
--    once an invoice already existed (post-acceptance). Now the GC can
--    lay out the same schedule — with an expected due date on each one —
--    right on the quote, so the client and subs see the full plan before
--    anyone signs anything. On acceptance, that schedule carries over
--    automatically to the invoice's real (payable) milestones.

-- --- Subcontractor sign-off -------------------------------------------

alter table subcontractors add column if not exists email text;
alter table subcontractors add column if not exists phone text;
-- The credential for a sub's own approval link (/sub/:token) — separate
-- from the client's accept_token on the quote, so a sub only ever sees
-- their own scope/pay, never the client's view or another sub's.
alter table subcontractors add column if not exists approve_token uuid not null default gen_random_uuid();
alter table subcontractors add column if not exists signed_name text;
alter table subcontractors add column if not exists signed_at timestamptz;

create unique index if not exists subcontractors_approve_token_idx on subcontractors (approve_token);

-- --- Payment timeline on the estimate -----------------------------------

create table if not exists quote_milestones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  quote_id uuid not null references quotes (id) on delete cascade,
  title text not null,
  amount_cents integer not null,
  sequence integer not null,
  due_date date,
  created_at timestamptz not null default now()
);

alter table quote_milestones enable row level security;

create policy "quote_milestones: admin read/write" on quote_milestones
  for all using (is_team_admin(owner_id)) with check (is_team_admin(owner_id));

create index if not exists quote_milestones_quote_id_idx on quote_milestones (quote_id, sequence);

-- Carries the "when is this due" question through to the real, payable
-- milestone once the quote is accepted and the invoice is created.
alter table invoice_milestones add column if not exists due_date date;
