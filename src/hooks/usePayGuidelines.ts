import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PayGuidelines } from "@/types/domain";

const DEFAULT_GUIDELINES: Omit<PayGuidelines, "owner_id" | "updated_at"> = {
  materials_multiplier: 4,
  materials_pct: 25,
  overhead_pct: 25,
  gc_labor_share_pct: 50,
};

export function usePayGuidelines(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["pay_guidelines", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_guidelines")
        .select("*")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) throw error;
      return (data as PayGuidelines | null) ?? { owner_id: ownerId!, ...DEFAULT_GUIDELINES, updated_at: "" };
    },
  });
}

export function useSavePayGuidelines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (guidelines: Omit<PayGuidelines, "updated_at">) => {
      const { error } = await supabase
        .from("pay_guidelines")
        .upsert({ ...guidelines, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pay_guidelines", variables.owner_id] });
    },
  });
}

export interface PayGuidelineResult {
  totalCents: number;
  materialsCents: number;
  overheadCents: number;
  gcCents: number;
  subCents: number;
}

/**
 * A reference number, not an enforced rule — see the schema file's
 * header comment for the worked example. materialCostCents is whatever
 * the GC enters for this specific scope of work (their own materials
 * catalog cost, an estimate, whatever); everything else follows from
 * the owner's own guideline settings.
 */
export function calculatePayGuideline(guidelines: PayGuidelines, materialCostCents: number): PayGuidelineResult {
  const totalCents = Math.round(materialCostCents * guidelines.materials_multiplier);
  const materialsCents = Math.round(totalCents * (guidelines.materials_pct / 100));
  const overheadCents = Math.round(totalCents * (guidelines.overhead_pct / 100));
  const laborPoolCents = totalCents - materialsCents - overheadCents;
  const gcCents = Math.round(laborPoolCents * (guidelines.gc_labor_share_pct / 100));
  const subCents = laborPoolCents - gcCents;
  return { totalCents, materialsCents, overheadCents, gcCents, subCents };
}
