import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupportTicket, SupportTicketReply, SupportTicketStatus } from "@/types/domain";

/** Whether the signed-in user has admin (support inbox) access. */
export function useIsAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ["is_admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
      if (error) throw error;
      return !!data?.is_admin;
    },
  });
}

/** The signed-in owner's own support tickets (RLS-scoped). */
export function useMyTickets(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["support_tickets", "mine", ownerId],
    enabled: !!ownerId,
    refetchInterval: 30_000, // cheap way to surface a support reply without building realtime for this
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
  });
}

/** Every ticket, across every owner — only returns anything for an admin (RLS-gated). */
export function useAllTickets() {
  return useQuery({
    queryKey: ["support_tickets", "all"],
    queryFn: async () => {
      const { data: tickets, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!tickets || tickets.length === 0) return [] as SupportTicket[];

      // No direct FK from support_tickets to profiles for PostgREST to embed
      // (owner_id references auth.users, like every other owner_id in this
      // schema) — so business names are merged in here instead.
      const ownerIds = [...new Set(tickets.map((t) => t.owner_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, business_name").in("id", ownerIds);
      const nameByOwner = new Map((profiles ?? []).map((p) => [p.id, p.business_name]));

      return tickets.map((t) => ({ ...t, owner: { business_name: nameByOwner.get(t.owner_id) ?? null } })) as SupportTicket[];
    },
  });
}

export function useTicketReplies(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["support_ticket_replies", ticketId],
    enabled: !!ticketId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_replies")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at");
      if (error) throw error;
      return data as SupportTicketReply[];
    },
  });
}

export function useAddTicketReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      author,
      body,
    }: {
      ticketId: string;
      author: "owner" | "support";
      body: string;
    }) => {
      const { error } = await supabase.from("support_ticket_replies").insert({ ticket_id: ticketId, author, body });
      if (error) throw error;
      // A support reply moves the ticket to "answered" so it's easy to
      // tell, at a glance, which open tickets still need a first response.
      if (author === "support") {
        await supabase
          .from("support_tickets")
          .update({ status: "answered", updated_at: new Date().toISOString() })
          .eq("id", ticketId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support_ticket_replies", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportTicketStatus }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
    },
  });
}
