import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Material } from "@/types/domain";

export function useMaterials(userId: string | undefined) {
  return useQuery({
    queryKey: ["materials", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("owner_id", userId)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as Material[];
    },
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<Material, "name" | "category" | "supplier" | "sku" | "unit" | "cost_cents" | "product_url" | "notes"> & {
        owner_id: string;
      },
    ) => {
      const { error } = await supabase.from("materials").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["materials", variables.owner_id] });
    },
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, owner_id: _owner_id, ...updates }: Partial<Material> & { id: string }) => {
      const { error } = await supabase.from("materials").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

export interface MaterialImportRow {
  name: string;
  category: string | null;
  supplier: string | null;
  sku: string | null;
  unit: string;
  costCents: number | null;
  productUrl: string | null;
}

export function useImportMaterials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, rows }: { ownerId: string; rows: MaterialImportRow[] }) => {
      const records = rows
        .filter((r) => r.name && r.costCents !== null)
        .map((r) => ({
          owner_id: ownerId,
          name: r.name,
          category: r.category,
          supplier: r.supplier,
          sku: r.sku,
          unit: r.unit || "each",
          cost_cents: r.costCents as number,
          product_url: r.productUrl,
        }));

      const CHUNK_SIZE = 200;
      let imported = 0;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("materials").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
      }
      return { imported, skipped: rows.length - imported };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["materials", variables.ownerId] });
    },
  });
}
