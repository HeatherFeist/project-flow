import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { QuoteMilestone } from "@/types/domain";

// The planned payment schedule shown on the estimate, before there's an
// invoice to attach real (payable) milestones to. See
// docs/schema_v32_sub_approval_and_milestones.sql.
export function useQuoteMilestones(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote_milestones", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_milestones")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sequence");
      if (error) throw error;
      return data as QuoteMilestone[];
    },
  });
}

export function useCreateQuoteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      owner_id: string;
      quote_id: string;
      title: string;
      amount_cents: number;
      sequence: number;
      due_date: string | null;
    }) => {
      const { error } = await supabase.from("quote_milestones").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quote_milestones", variables.quote_id] });
    },
  });
}

export function useUpdateQuoteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      quote_id,
      due_date,
    }: {
      id: string;
      quote_id: string;
      due_date: string | null;
    }) => {
      const { error } = await supabase.from("quote_milestones").update({ due_date }).eq("id", id);
      if (error) throw error;
      return quote_id;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quote_milestones", variables.quote_id] });
    },
  });
}

export function useDeleteQuoteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; quoteId: string }) => {
      const { error } = await supabase.from("quote_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quote_milestones", variables.quoteId] });
    },
  });
}
