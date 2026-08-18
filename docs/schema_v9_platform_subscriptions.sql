-- Project Flow — platform subscription billing (v9)
-- Turns Project Flow itself into a paid product: every business owner
-- needs an active $49/mo subscription (billed through Project Flow's own
-- Stripe account — a separate Stripe account from the one each owner
-- connects in Settings to accept their own customers' invoice payments)
-- to use the app. Run after docs/schema_v8_estimate_uploads.sql.

create table if not exists subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'incomplete', -- 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- Owners can read their own billing status; only the service role (edge
-- functions, driven by Stripe's webhook) ever writes to this table.
create policy "subscriptions: owner read" on subscriptions
  for select using (auth.uid() = owner_id);

create unique index if not exists subscriptions_stripe_customer_id_idx
  on subscriptions (stripe_customer_id) where stripe_customer_id is not null;

-- Lets you comp your own account (or anyone else's) without a real Stripe
-- subscription — e.g. `update profiles set is_exempt = true where id = '...';`
alter table profiles add column if not exists is_exempt boolean not null default false;
