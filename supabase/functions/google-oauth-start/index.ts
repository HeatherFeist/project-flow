// POST (no body needed)
// Auth: caller's Supabase JWT. Creates a one-time state row and returns the
// Google consent screen URL to redirect the browser to. This is a direct,
// self-contained OAuth flow (not Supabase Auth's linkIdentity, which didn't
// reliably return a refresh token for Calendar/Gmail scopes).

import { buildGoogleAuthUrl, CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: stateRow, error: insertError } = await supabase
      .from("google_oauth_states")
      .insert({ user_id: userData.user.id })
      .select("id")
      .single();

    if (insertError || !stateRow) {
      throw insertError ?? new Error("Failed to create OAuth state");
    }

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;
    const authUrl = buildGoogleAuthUrl({ redirectUri, state: stateRow.id });

    return new Response(JSON.stringify({ authUrl }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
