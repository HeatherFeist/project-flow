import { supabase } from "@/lib/supabase";

/**
 * Starts a direct Google OAuth flow (Calendar + Gmail-send scopes), run
 * entirely by our own edge functions rather than Supabase Auth's
 * `linkIdentity` — that API didn't reliably return a refresh token for
 * these scopes. Redirects the browser to Google's consent screen; Google
 * redirects back to the `google-oauth-callback` edge function, which saves
 * the connection and redirects into the app at `/settings?google=connected`
 * (or `?google=error&message=...`) — see Settings.tsx for handling that.
 */
export async function connectGoogle() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const { data, error } = await supabase.functions.invoke<{ authUrl: string }>(
    "google-oauth-start",
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (error) throw error;
  if (!data?.authUrl) throw new Error("Failed to start Google connection");

  window.location.href = data.authUrl;
}
