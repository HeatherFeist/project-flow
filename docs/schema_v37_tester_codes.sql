-- Project Flow — self-serve tester codes (v37)
--
-- Lets a tester comp their own account from the Subscribe page by
-- entering a code you set up, instead of you running
-- `update profiles set is_exempt = true where id = '...'` by hand every
-- time someone new needs free access (see docs/schema_v9_platform_subscriptions.sql
-- for that original comp flag).
--
-- No RLS policies are added on purpose — this table is only ever read or
-- written by the redeem-tester-code edge function's service-role client,
-- never directly from the browser, so a tester (or anyone else) can't
-- read other codes or forge a redemption client-side.

create table if not exists tester_codes (
  code text primary key,
  active boolean not null default true,
  max_redemptions integer, -- null = unlimited
  redemption_count integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table tester_codes enable row level security;

-- Example: create a code good for 10 testers —
--   insert into tester_codes (code, max_redemptions, note) values ('BETA2024', 10, 'Early tester batch');
