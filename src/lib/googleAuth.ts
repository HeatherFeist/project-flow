import { supabase } from "@/lib/supabase";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "email",
].join(" ");

// Set right before redirecting to Google, so AuthContext can tell "we just
// came back from a Connect Google attempt" apart from any other session
// change (token refresh, sign-in elsewhere, etc.) and always report an
// outcome instead of silently doing nothing.
const PENDING_KEY = "pf_google_connect_pending";

/**
 * Links a Google identity to the *currently signed-in* user (rather than
 * signing in as whatever account that Google login belongs to), requesting
 * Calendar + Gmail-send access. Requires "Manual linking" to be turned on
 * for this Supabase project — see the README's Google setup section.
 * Redirects away from the app; on return, `handleGoogleConnectReturn`
 * (wired into onAuthStateChange in AuthContext) persists the tokens.
 */
export async function connectGoogle() {
  sessionStorage.setItem(PENDING_KEY, "1");
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
  if (error) {
    sessionStorage.removeItem(PENDING_KEY);
    throw error;
  }
}

interface GoogleReturnSession {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
  user: { id: string; email?: string | null };
}

/**
 * Call this from AuthContext's onAuthStateChange on every session change.
 * Returns null (do nothing, show nothing) unless this session change is the
 * redirect back from `connectGoogle()` — detected via the sessionStorage
 * flag, since a provider_refresh_token can be legitimately absent even on a
 * real connect attempt (Google only issues one on first consent), and that
 * case still needs to be reported, not swallowed.
 */
export async function handleGoogleConnectReturn(
  session: GoogleReturnSession,
): Promise<{ saved: boolean; error: string | null } | null> {
  const wasPending = sessionStorage.getItem(PENDING_KEY);
  if (!wasPending) return null;
  sessionStorage.removeItem(PENDING_KEY);

  if (!session.provider_refresh_token) {
    return {
      saved: false,
      error:
        "Google didn't grant offline access, so we can't save this connection. This usually means " +
        "Google skipped the consent screen because it was already granted once before — go to " +
        "myaccount.google.com/permissions, remove this app's access, then try Connect Google again.",
    };
  }

  const { error } = await supabase.from("google_connections").upsert({
    user_id: session.user.id,
    google_email: session.user.email ?? null,
    refresh_token: session.provider_refresh_token,
    access_token: session.provider_token ?? null,
    access_token_expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    scope: GOOGLE_SCOPES,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to save Google connection:", error);
    return { saved: false, error: error.message };
  }
  return { saved: true, error: null };
}
