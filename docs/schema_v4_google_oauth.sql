-- Project Flow — direct Google OAuth schema (v4)
-- Replaces the Supabase Auth `linkIdentity` approach for connecting Google
-- (Calendar + Gmail scopes), which didn't reliably return a refresh token.
-- This is a standard, self-contained OAuth 2.0 authorization-code flow run
-- entirely by our own edge functions — see google-oauth-start and
-- google-oauth-callback.

-- Short-lived, one-time-use rows linking a Google OAuth "state" param back
-- to the app user who started the flow. Never queried by the client
-- directly (no RLS policies = inaccessible via the anon/authenticated
-- PostgREST roles; only the edge functions' service-role key can read it).
create table if not exists google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table google_oauth_states enable row level security;
