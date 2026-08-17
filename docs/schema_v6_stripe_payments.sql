-- Project Flow — Stripe payments schema (v6)
-- Simple architecture: one Stripe account (Nick's own), configured only via
-- the STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET edge function secrets — no
-- per-user Stripe settings table needed for a single-business setup.

alter table invoices add column if not exists pay_token uuid not null default gen_random_uuid();
alter table invoices add column if not exists sent_at timestamptz;
alter table invoices add column if not exists amount_paid_cents integer not null default 0;
create unique index if not exists invoices_pay_token_idx on invoices (pay_token);

-- Every successful Stripe payment against an invoice — supports partial
-- payments/deposits, since one invoice can have several of these.
create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount_cents integer not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'succeeded',
  created_at timestamptz not null default now()
);

alter table invoice_payments enable row level security;

-- Read-only for the owner (via the parent invoice); only the stripe-webhook
-- edge function (service role) ever writes to this table.
create policy "invoice_payments: owner read" on invoice_payments
  for select using (
    exists (select 1 from invoices where invoices.id = invoice_payments.invoice_id and invoices.owner_id = auth.uid())
  );

create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);

-- NOTE: invoices stays owner-only under RLS (see docs/schema.sql). The
-- public /pay/:token page never talks to Postgres directly — it only calls
-- the invoice-pay-info and create-invoice-checkout edge functions, which
-- use the service-role key to read/write the one invoice matching the
-- token in the URL. Do not add a public SELECT policy on invoices.
