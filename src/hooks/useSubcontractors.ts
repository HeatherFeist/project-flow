import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { Subcontractor } from "@/types/domain";

// GC-only — full fields, including pay and payment handles. Used on the
// Quote detail page (editing) and Invoice detail page (reference for
// paying subs after a milestone lands). Never used on a public/client
// page — those go through the separate public Edge Function payloads,
// which only ever carry name + scope_of_work.
export function useSubcontractors(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["subcontractors", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractors")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at");
      if (error) throw error;
      return data as Subcontractor[];
    },
  });
}

export function useCreateSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      owner_id: string;
      quote_id: string;
      name: string;
      scope_of_work: string;
      pay_cents: number | null;
      paypal_handle: string | null;
      cashapp_handle: string | null;
      email: string | null;
      phone: string | null;
    }) => {
      const { error } = await supabase.from("subcontractors").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subcontractors", variables.quote_id] });
    },
  });
}

// Sends the subcontractor a link to their own approval page (/sub/:token)
// via whichever of email/phone they have on file — best-effort across
// both channels, only failing if neither is configured/possible.
export function useSendSubApproval() {
  return useMutation({
    mutationFn: async (subcontractorId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-sub-approval", {
        body: { subcontractorId },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as { ok: true; sentVia: string[] };
    },
  });
}

export function useUpdateSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quote_id: _quote_id, owner_id: _owner_id, ...updates }: Partial<Subcontractor> & { id: string }) => {
      const { error } = await supabase.from("subcontractors").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcontractors"] });
    },
  });
}

export function useDeleteSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; quoteId: string }) => {
      const { error } = await supabase.from("subcontractors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subcontractors", variables.quoteId] });
    },
  });
}
