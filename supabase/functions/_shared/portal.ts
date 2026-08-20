// Shared helper for the client portal (docs/schema_v17_client_portal.sql)
// — validates a session token from client_portal_sessions and returns
// which client/owner it belongs to. Throws a user-facing Error if the
// token is missing, unknown, or expired.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function validatePortalSession(
  supabase: SupabaseClient,
  sessionToken: string | undefined,
): Promise<{ clientId: string; ownerId: string }> {
  if (!sessionToken) throw new Error("Not signed in.");

  const { data: session } = await supabase
    .from("client_portal_sessions")
    .select("client_id, owner_id, expires_at")
    .eq("token", sessionToken)
    .maybeSingle();

  if (!session) throw new Error("Session not found — please sign in again.");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new Error("Your session has expired — please sign in again.");
  }

  return { clientId: session.client_id, ownerId: session.owner_id };
}
