import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { resolveClientIds } from "@/lib/importClientMatching";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { LineItem, Quote, QuoteStatus, QuoteVisualization } from "@/types/domain";

export interface QuoteImportRow {
  clientName: string;
  clientEmail: string | null;
  description: string | null;
  status: QuoteStatus;
  totalCents: number | null;
  notes: string | null;
  date: string | null;
}

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

export function useImportQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, rows }: { ownerId: string; rows: QuoteImportRow[] }) => {
      const clientIds = await resolveClientIds(
        ownerId,
        rows.map((r) => ({ name: r.clientName, email: r.clientEmail })),
      );

      const records = rows
        .map((row, i) => {
          const client_id = clientIds[i];
          if (!client_id) return null;
          const totalCents = row.totalCents ?? 0;
          const items: LineItem[] = [
            {
              id: crypto.randomUUID(),
              description: row.description || "Imported quote",
              quantity: 1,
              unit_price_cents: totalCents,
            },
          ];
          return {
            owner_id: ownerId,
            client_id,
            job_id: null,
            status: row.status,
            total_cents: totalCents,
            notes: row.notes,
            items,
            ...(row.date ? { created_at: row.date } : {}),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const CHUNK_SIZE = 200;
      let imported = 0;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("quotes").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
      }
      return { imported, skipped: rows.length - imported };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useQuoteVisualizations(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote_visualizations", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_visualizations")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as QuoteVisualization[];
    },
  });
}

export function useGenerateQuoteVisualization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      quoteId: string;
      prompt: string;
      baseImage: { base64: string; mimeType: string };
      referenceImages: { base64: string; mimeType: string }[];
    }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ visualization: QuoteVisualization }>(
        "generate-quote-visualization",
        {
          body: input,
          headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        },
      );
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to generate visualization");
      }
      return data.visualization;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quote_visualizations", variables.quoteId] });
    },
  });
}

export function useDeleteQuoteVisualization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (viz: QuoteVisualization) => {
      await supabase.storage.from("quote-visuals").remove([viz.result_path]);
      const { error } = await supabase.from("quote_visualizations").delete().eq("id", viz.id);
      if (error) throw error;
    },
    onSuccess: (_data, viz) => {
      queryClient.invalidateQueries({ queryKey: ["quote_visualizations", viz.quote_id] });
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
