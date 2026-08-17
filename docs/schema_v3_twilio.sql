-- Project Flow — Twilio calling/texting schema (v3)
-- Run this after docs/schema.sql and docs/schema_v2_scheduling.sql.

-- One Twilio number + forwarding target per user. The Twilio number is the
-- one customers call/text; forward_to_phone is the real cell (e.g. Nick's)
-- that incoming calls ring through to before falling back to an auto-text.
create table if not exists twilio_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  twilio_phone_number text not null,
  forward_to_phone text,
  missed_call_message text not null default
    'Sorry we missed your call! Reply here and let us know what you need — we''ll get back to you shortly.',
  updated_at timestamptz not null default now()
);

alter table twilio_settings enable row level security;

create policy "twilio_settings: owner read/write" on twilio_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lets the twilio-voice/twilio-sms edge functions (service role) find which
-- app user owns a given Twilio number without scanning every row.
create unique index if not exists twilio_settings_number_idx on twilio_settings (twilio_phone_number);

-- Marks clients that were auto-created from an inbound call/text rather
-- than entered by hand, so the UI can flag them as new leads to review.
alter table clients add column if not exists source text not null default 'manual';
