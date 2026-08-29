// POST { token: string }
// Auth required — the invited person must already be signed in (they
// create a normal Project Flow account at /login first if they don't
// have one, then this links their account to the invite). Looks up the
// invite by its token, marks it active, and attaches the caller's own
// user id to it. The token itself is the proof of invitation — a random
// UUID, unguessable, same trust model as the client portal's login
// tokens and quote/invoice pay tokens elsewhere in this app.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }

    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing invite token" }), { status: 400, headers: jsonHeaders });
    }

    const { data: invite, error: findError } = await supabase
      .from("team_members")
      .select("id, owner_id, status")
      .eq("invite_token", token)
      .maybeSingle();

    if (findError) throw findError;
    if (!invite) {
      return new Response(JSON.stringify({ error: "That invite link isn't valid." }), { status: 404, headers: jsonHeaders });
    }
    if (invite.status !== "invited") {
      return new Response(
        JSON.stringify({ error: "That invite has already been used or removed." }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (invite.owner_id === userData.user.id) {
      return new Response(
        JSON.stringify({ error: "You can't join your own business as a team member." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { error: updateError } = await supabase
      .from("team_members")
      .update({ user_id: userData.user.id, status: "active", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
