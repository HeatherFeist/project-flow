-- Project Flow — PayPal payments schema (v7)
-- Adds PayPal as a second, independent payment option alongside Stripe on
-- the invoice pay page. Run after docs/schema_v6_stripe_payments.sql.

alter table invoice_payments add column if not exists provider text not null default 'stripe';
alter table invoice_payments add column if not exists paypal_order_id text;

create unique index if not exists invoice_payments_paypal_order_id_idx
  on invoice_payments (paypal_order_id) where paypal_order_id is not null;
