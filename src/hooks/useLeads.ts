import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/types/domain";

export interface Lead extends Client {
  converted: boolean;
}

const LEAD_SOURCES = ["missed_call", "inbound_text", "chatbot"] as const;

// "Leads" are clients that came in through a capture channel (missed
// call, inbound text, the estimate chatbot) rather than being added by
// hand or via CSV import. "Converted" just means they already have at
// least one job or quote — a light signal, not a formal pipeline stage,
// so this stays a query over data that already exists rather than a new
// status field to keep in sync.
export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .in("source", LEAD_SOURCES)
        .order("created_at", { ascending: false });
      if (clientsError) throw clientsError;
      if (!clients || clients.length === 0) return [] as Lead[];

      const clientIds = clients.map((c) => c.id);
      const [{ data: jobRows, error: jobsError }, { data: quoteRows, error: quotesError }] = await Promise.all([
        supabase.from("jobs").select("client_id").in("client_id", clientIds),
        supabase.from("quotes").select("client_id").in("client_id", clientIds),
      ]);
      if (jobsError) throw jobsError;
      if (quotesError) throw quotesError;

      const convertedIds = new Set([
        ...(jobRows ?? []).map((r) => r.client_id),
        ...(quoteRows ?? []).map((r) => r.client_id),
      ]);

      return clients.map((c) => ({ ...c, converted: convertedIds.has(c.id) })) as Lead[];
    },
  });
}
