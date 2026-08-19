-- Project Flow — onboarding flow (v11)
-- Tracks whether a new owner has been through the guided setup wizard
-- (business profile, importing existing data, connecting the essentials)
-- so it only shows once, right after their trial starts.

alter table profiles add column if not exists onboarding_completed boolean not null default false;

-- Don't force this on the existing account — only new signups from here
-- on out should see the wizard.
update profiles set onboarding_completed = true where onboarding_completed = false;
