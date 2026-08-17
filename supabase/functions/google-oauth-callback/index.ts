// GET ?code=...&state=...  (Google redirects the browser here directly)
// No auth header — the one-time `state` row is the credential, same pattern
// as the /q/:token public quote flow. Exchanges the code for tokens, saves
// the connection, and redirects the browser back into the app.

import { exchangeGoogleCode, getGoogleUserEmail, serviceClient } from "../_shared/google.ts";

const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutes

function redirectTo(path: string): Response {
  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  return new Response(null, { status: 302, headers: { Location: `${siteUrl}${path}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectTo(`/settings?google=error&message=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return redirectTo(`/settings?google=error&message=${encodeURIComponent("Missing code or state")}`);
  }

  const supabase = serviceClient();

  try {
    const { data: stateRow, error: stateError } = await supabase
      .from("google_oauth_states")
      .select("*")
      .eq("id", state)
      .single();

    // One-time use: delete immediately whether or not it's valid.
    if (stateRow) {
      await supabase.from("google_oauth_states").delete().eq("id", state);
    }

    if (stateError || !stateRow) {
      return redirectTo(`/settings?google=error&message=${encodeURIComponent("This connection link expired — try again.")}`);
    }

    const age = Date.now() - new Date(stateRow.created_at).getTime();
    if (age > MAX_STATE_AGE_MS) {
      return redirectTo(`/settings?google=error&message=${encodeURIComponent("This connection link expired — try again.")}`);
    }

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;
    const tokens = await exchangeGoogleCode({ code, redirectUri });

    if (!tokens.refresh_token) {
      return redirectTo(
        `/settings?google=error&message=${encodeURIComponent(
          "Google didn't return offline access. Remove this app at myaccount.google.com/permissions and try again.",
        )}`,
      );
    }

    const email = await getGoogleUserEmail(tokens.access_token);

    const { error: upsertError } = await supabase.from("google_connections").upsert({
      user_id: stateRow.user_id,
      google_email: email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: "calendar gmail.send userinfo.email",
      updated_at: new Date().toISOString(),
    });

    if (upsertError) throw upsertError;

    return redirectTo("/settings?google=connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return redirectTo(`/settings?google=error&message=${encodeURIComponent(message)}`);
  }
});
