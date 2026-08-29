// Resolves which "business" a signed-in user is acting on behalf of
// (docs/schema_v29_team_accounts.sql) — their own account if they're an
// owner with no team relationship, or the owner_id of the business
// they've been invited into as an active team member. Mirrors the
// is_team_member/is_team_admin SQL functions, for the Edge Function side
// where RLS isn't in play (these run with the service role).

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type TeamRole = "owner" | "admin" | "field_tech";

export async function resolveOwnerId(
  supabase: SupabaseClient,
  callerId: string,
): Promise<{ ownerId: string; role: TeamRole }> {
  const { data } = await supabase
    .from("team_members")
    .select("owner_id, role")
    .eq("user_id", callerId)
    .eq("status", "active")
    .maybeSingle();

  if (data) return { ownerId: data.owner_id, role: data.role as TeamRole };
  return { ownerId: callerId, role: "owner" };
}
