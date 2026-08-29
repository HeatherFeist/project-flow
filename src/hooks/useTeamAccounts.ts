import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";

export type TeamRole = "admin" | "field_tech";
export type TeamMemberStatus = "invited" | "active" | "removed";

export interface TeamMember {
  id: string;
  owner_id: string;
  user_id: string | null;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  created_at: string;
  accepted_at: string | null;
}

export function useTeamMembers(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["team_members", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("owner_id", ownerId)
        .neq("status", "removed")
        .order("created_at");
      if (error) throw error;
      return data as TeamMember[];
    },
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: TeamRole }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ inviteLink: string }>("invite-team-member", {
        body: { email, role },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to send invite");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").update({ status: "removed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
  });
}

export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: TeamRole }) => {
      const { error } = await supabase.from("team_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
  });
}

export function useAcceptTeamInvite() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ ok: true }>("accept-team-invite", {
        body: { token },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to accept invite");
      }
      return data;
    },
  });
}
