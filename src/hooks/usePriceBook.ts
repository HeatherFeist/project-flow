import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PriceBookItem } from "@/types/domain";
import type { PriceHistoryGroup } from "@/lib/csv";

export function usePriceBook(userId: string | undefined) {
  return useQuery({
    queryKey: ["price_book", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_book_items")
        .select("*")
        .eq("owner_id", userId)
        .order("category")
        .order("item_name");
      if (error) throw error;
      return data as PriceBookItem[];
    },
  });
}

export function useCreatePriceBookItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<PriceBookItem, "category" | "item_name" | "unit" | "low_cents" | "high_cents" | "notes"> & {
        owner_id: string;
      },
    ) => {
      const { error } = await supabase.from("price_book_items").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["price_book", variables.owner_id] });
    },
  });
}

export function useUpdatePriceBookItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, owner_id: _owner_id, ...updates }: Partial<PriceBookItem> & { id: string }) => {
      const { error } = await supabase.from("price_book_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price_book"] });
    },
  });
}

export function useDeletePriceBookItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_book_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price_book"] });
    },
  });
}

// Reasonable starting ranges for common handyman/home-service jobs, from
// general industry knowledge — not sourced from any proprietary database.
// Meant as a starting point to edit, not a finished price list.
export const STARTER_PRICE_BOOK: {
  category: string;
  item_name: string;
  unit: PriceBookItem["unit"];
  low_cents: number;
  high_cents: number;
}[] = [
  { category: "General labor", item_name: "General handyman labor", unit: "per hour", low_cents: 6000, high_cents: 9500 },
  { category: "Doors & Windows", item_name: "Interior door installation", unit: "flat", low_cents: 15000, high_cents: 30000 },
  { category: "Doors & Windows", item_name: "Door lock/hardware replacement", unit: "flat", low_cents: 8000, high_cents: 15000 },
  { category: "Doors & Windows", item_name: "Window screen repair", unit: "flat", low_cents: 6000, high_cents: 12000 },
  { category: "Plumbing", item_name: "Faucet replacement", unit: "flat", low_cents: 15000, high_cents: 30000 },
  { category: "Plumbing", item_name: "Toilet installation", unit: "flat", low_cents: 20000, high_cents: 40000 },
  { category: "Plumbing", item_name: "Fix running toilet / minor leak", unit: "flat", low_cents: 10000, high_cents: 20000 },
  { category: "Drywall & Paint", item_name: "Drywall patch (small hole)", unit: "flat", low_cents: 15000, high_cents: 30000 },
  { category: "Drywall & Paint", item_name: "Interior room painting", unit: "flat", low_cents: 30000, high_cents: 70000 },
  { category: "Carpentry", item_name: "Deck board repair", unit: "flat", low_cents: 20000, high_cents: 50000 },
  { category: "Carpentry", item_name: "Shelving installation", unit: "flat", low_cents: 10000, high_cents: 25000 },
  { category: "Electrical (basic)", item_name: "Light fixture replacement", unit: "flat", low_cents: 12000, high_cents: 25000 },
  { category: "Electrical (basic)", item_name: "Outlet/switch replacement", unit: "flat", low_cents: 8000, high_cents: 15000 },
  { category: "Assembly & Mounting", item_name: "TV wall mounting", unit: "flat", low_cents: 10000, high_cents: 20000 },
  { category: "Assembly & Mounting", item_name: "Furniture assembly", unit: "per hour", low_cents: 6000, high_cents: 9500 },
  { category: "Flooring", item_name: "Tile repair (small area)", unit: "flat", low_cents: 25000, high_cents: 50000 },
  { category: "Gutters & Exterior", item_name: "Gutter cleaning", unit: "flat", low_cents: 15000, high_cents: 30000 },
  { category: "Gutters & Exterior", item_name: "Caulking / weatherproofing", unit: "flat", low_cents: 15000, high_cents: 35000 },
];

export function useSeedStarterPriceBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ownerId: string) => {
      const rows = STARTER_PRICE_BOOK.map((item) => ({ ...item, owner_id: ownerId, notes: null }));
      const { error } = await supabase.from("price_book_items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (_data, ownerId) => {
      queryClient.invalidateQueries({ queryKey: ["price_book", ownerId] });
    },
  });
}

// Imports real historical pricing (from a Jobber/other-tool invoice export,
// already grouped by groupPriceHistory) as price book rows — the low/high
// range reflects what was *actually* charged, not a generic estimate.
export function useImportPriceHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, groups }: { ownerId: string; groups: PriceHistoryGroup[] }) => {
      const rows = groups.map((g) => ({
        owner_id: ownerId,
        category: g.category,
        item_name: g.itemName,
        unit: "flat" as const,
        low_cents: g.lowCents,
        high_cents: g.highCents,
        notes: g.occurrences > 1 ? `From ${g.occurrences} past invoices` : "From 1 past invoice (range estimated)",
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("price_book_items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["price_book", variables.ownerId] });
    },
  });
}

// Imports service line items read off a photographed past invoice (see
// extract-invoice-items) — a single exact price per item, unlike the CSV
// price-history import above which groups repeated charges into a
// low/high range. Stored as low_cents === high_cents so it's still a
// valid range, just a zero-width one until edited.
export function useImportScannedPriceBookItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ownerId,
      items,
    }: {
      ownerId: string;
      items: { category: string; itemName: string; unit: PriceBookItem["unit"]; priceCents: number }[];
    }) => {
      const rows = items.map((item) => ({
        owner_id: ownerId,
        category: item.category,
        item_name: item.itemName,
        unit: item.unit,
        low_cents: item.priceCents,
        high_cents: item.priceCents,
        notes: "From a scanned past invoice",
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("price_book_items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["price_book", variables.ownerId] });
    },
  });
}
