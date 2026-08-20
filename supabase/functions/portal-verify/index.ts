// POST { token: string }
// Public (no auth). Exchanges a one-time login token (from the magic-link
// email) for a long-lived session token, which the browser stores and
// sends on every subsequent portal-dashboard / portal-request-service
// call. One-time: the login token is deleted immediately either way.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const LOGIN_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { token } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

    const supabase = serviceClient();

    const { data: loginToken } = await supabase
      .from("client_portal_login_tokens")
      .select("*")
      .eq("id", token)
      .maybeSingle();

    if (loginToken) {
      await supabase.from("client_portal_login_tokens").delete().eq("id", token);
    }

    if (!loginToken || loginToken.used) {
      return new Response(JSON.stringify({ error: "This link has expired or was already used." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const age = Date.now() - new Date(loginToken.created_at).getTime();
    if (age > LOGIN_TOKEN_MAX_AGE_MS) {
      return new Response(JSON.stringify({ error: "This link has expired — request a new one." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: session, error: sessionError } = await supabase
      .from("client_portal_sessions")
      .insert({
        client_id: loginToken.client_id,
        owner_id: loginToken.owner_id,
        expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("token")
      .single();
    if (sessionError || !session) throw sessionError ?? new Error("Failed to create session");

    return new Response(JSON.stringify({ sessionToken: session.token }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
