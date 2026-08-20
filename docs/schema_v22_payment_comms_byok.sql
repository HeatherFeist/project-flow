-- Project Flow — bring-your-own Twilio/Stripe/PayPal credentials (v22)
-- Same reasoning as Gemini (schema_v21), but more serious: Twilio, Stripe
-- (invoice payments), and PayPal were still platform-wide secrets, which
-- meant every subscriber's calls/texts and every subscriber's client
-- payments routed through the SAME account (Nick's). Fine for a
-- single-business tool; wrong for a real multi-tenant product — other
-- owners' client communications and client money have no business
-- flowing through someone else's accounts.
--
-- Each owner now enters their own credentials in Settings. Nothing here
-- forces immediate action — existing platform secrets keep working as a
-- fallback until an owner fills these in (see the shared helper comments
-- in supabase/functions/_shared/), but Nick's own account should be
-- migrated to use its own credentials here too, for consistency and so
-- the platform secrets can eventually be removed.

alter table twilio_settings add column if not exists twilio_account_sid text;
alter table twilio_settings add column if not exists twilio_auth_token text;

create table if not exists payment_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_secret_key text,
  stripe_webhook_secret text,
  paypal_client_id text,
  paypal_client_secret text,
  paypal_mode text not null default 'sandbox', -- 'sandbox' | 'live'
  updated_at timestamptz not null default now()
);

alter table payment_settings enable row level security;

create policy "payment_settings: owner read/write" on payment_settings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
