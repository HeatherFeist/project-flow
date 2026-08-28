import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";

export interface HomeDepotProduct {
  title: string;
  priceCents: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  itemId: string | null;
  modelNumber: string | null;
  rating: number | null;
}

export function useSearchHomeDepot() {
  return useMutation({
    mutationFn: async (query: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ results: HomeDepotProduct[] }>(
        "search-home-depot-products",
        { body: { query }, headers: { Authorization: `Bearer ${sessionData.session?.access_token}` } },
      );
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Search failed");
      }
      return data.results;
    },
  });
}
