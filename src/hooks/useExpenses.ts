import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseCategory } from "@/types/domain";

// The full ledger — every expense for the owner, job-tied or general
// overhead, newest first. Used by the Expenses page.
export function useExpenses(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["expenses", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, job:jobs(id, title)")
        .eq("owner_id", ownerId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Expense[];
    },
  });
}

// Just this job's expenses — used by the Job Costing card.
export function useJobExpenses(jobId: string | undefined) {
  return useQuery({
    queryKey: ["expenses", "job", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at");
      if (error) throw error;
      return data as Expense[];
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      owner_id: string;
      job_id: string | null;
      material_id: string | null;
      category: ExpenseCategory;
      description: string;
      quantity: number;
      amount_cents: number;
      expense_date: string;
    }) => {
      const { error } = await supabase.from("expenses").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.owner_id] });
      if (variables.job_id) queryClient.invalidateQueries({ queryKey: ["expenses", "job", variables.job_id] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; ownerId: string; jobId: string | null }) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.ownerId] });
      if (variables.jobId) queryClient.invalidateQueries({ queryKey: ["expenses", "job", variables.jobId] });
    },
  });
}

// Revenue side of job costing: what the job actually billed for. Prefers
// its invoice(s) (what was actually sent/charged) and falls back to the
// linked quote's total if no invoice exists yet (job scheduled straight
// off an accepted quote, invoice not generated/sent yet).
export function useJobRevenue(jobId: string | undefined, quoteId: string | null | undefined) {
  return useQuery({
    queryKey: ["job_revenue", jobId, quoteId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("total_cents")
        .eq("job_id", jobId);
      if (invoicesError) throw invoicesError;

      if (invoices && invoices.length > 0) {
        return {
          amountCents: invoices.reduce((sum, inv) => sum + inv.total_cents, 0),
          source: "invoice" as const,
        };
      }

      if (quoteId) {
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select("total_cents")
          .eq("id", quoteId)
          .maybeSingle();
        if (quoteError) throw quoteError;
        if (quote) return { amountCents: quote.total_cents, source: "quote" as const };
      }

      return { amountCents: 0, source: "none" as const };
    },
  });
}
