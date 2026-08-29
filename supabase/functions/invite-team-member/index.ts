// POST { email: string, role: "admin" | "field_tech" }
// Auth required — the caller must be the account owner or an existing
// admin team member (docs/schema_v29_team_accounts.sql). Creates an
// invited (not yet active) team_members row and returns a one-time
// invite link — sending it to the invitee (text/email/however) is on
// the caller, same pattern as the client portal's shareable links,
// rather than this requiring the caller's Gmail to be connected.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { resolveOwnerId } from "../_shared/team.ts";

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

    const { email, role } = await req.json();
    if (!email || (role !== "admin" && role !== "field_tech")) {
      return new Response(JSON.stringify({ error: "Missing email or invalid role" }), { status: 400, headers: jsonHeaders });
    }

    const { ownerId, role: callerRole } = await resolveOwnerId(supabase, userData.user.id);
    if (callerRole === "field_tech") {
      return new Response(
        JSON.stringify({ error: "Only the account owner or an admin can invite team members." }),
        { status: 403, headers: jsonHeaders },
      );
    }

    const { data: invite, error: inviteError } = await supabase
      .from("team_members")
      .insert({ owner_id: ownerId, email, role, status: "invited" })
      .select("invite_token")
      .single();

    if (inviteError) throw inviteError;

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    return new Response(
      JSON.stringify({ inviteLink: `${siteUrl}/team/join/${invite.invite_token}` }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
