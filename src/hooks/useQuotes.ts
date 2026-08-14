import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LineItem, Quote, QuoteStatus } from "@/types/domain";

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, client:clients(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Quote[];
    },
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ["quotes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, client:clients(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Quote;
    },
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      owner_id: string;
      client_id: string;
      job_id: string | null;
      notes: string | null;
      items: LineItem[];
    }) => {
      const total_cents = input.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price_cents,
        0,
      );
      const { data, error } = await supabase
        .from("quotes")
        .insert({ ...input, status: "draft" as QuoteStatus, total_cents })
        .select()
        .single();
      if (error) throw error;
      return data as Quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

export function useUpdateQuoteStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
      const { data, error } = await supabase
        .from("quotes")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
