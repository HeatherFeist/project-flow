import { supabase } from "@/lib/supabase";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "email",
].join(" ");

/**
 * Links a Google identity to the *currently signed-in* user (rather than
 * signing in as whatever account that Google login belongs to), requesting
 * Calendar + Gmail-send access. Requires "Manual linking" to be turned on
 * for this Supabase project — see the README's Google setup section.
 * Redirects away from the app; on return, `captureGoogleTokensOnSignIn`
 * (wired into onAuthStateChange in AuthContext) persists the tokens.
 */
export async function connectGoogle() {
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      scopes: GOOGLE_SCOPES,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      redirectTo: `${window.location.origin}/settings`,
    },
  });
  if (error) throw error;
}

/**
 * Supabase only hands back `provider_refresh_token` on the redirect right
 * after the OAuth consent screen, so this must run from the session that
 * comes back from `connectGoogle()` — see AuthContext's onAuthStateChange.
 */
export async function captureGoogleTokensOnSignIn(session: {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
  user: { id: string; email?: string | null };
}) {
  if (!session.provider_refresh_token) return;

  await supabase.from("google_connections").upsert({
    user_id: session.user.id,
    google_email: session.user.email ?? null,
    refresh_token: session.provider_refresh_token,
    access_token: session.provider_token ?? null,
    access_token_expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    scope: GOOGLE_SCOPES,
    updated_at: new Date().toISOString(),
  });
}
