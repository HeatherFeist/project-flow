import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type TeamRole = "owner" | "admin" | "field_tech";

interface TeamContextValue {
  /** The business's data is scoped to this id — either the signed-in user's own id (an owner with no team), or the owner_id of the business they've been invited into. This is what every owner_id-scoped query/insert should use from here on, not user.id directly. */
  ownerId: string | undefined;
  role: TeamRole;
  isOwner: boolean;
  isAdmin: boolean; // owner OR admin team member — has full business access
  loading: boolean;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

// Resolves which business the signed-in user acts on behalf of
// (docs/schema_v29_team_accounts.sql). Mirrors the is_team_member/
// is_team_admin SQL helpers and supabase/functions/_shared/team.ts on
// the Edge Function side — all three need to agree on the same logic.
export function TeamProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ["team_membership", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("owner_id, role")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as { owner_id: string; role: "admin" | "field_tech" } | null;
    },
  });

  const loading = authLoading || (!!user && membershipLoading);
  const role: TeamRole = membership?.role ?? "owner";
  const ownerId = membership?.owner_id ?? user?.id;

  const value: TeamContextValue = {
    ownerId,
    role,
    isOwner: role === "owner",
    isAdmin: role === "owner" || role === "admin",
    loading,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
