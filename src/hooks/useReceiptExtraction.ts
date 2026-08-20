import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";

export interface ExtractedReceiptItem {
  name: string;
  price: number;
  sku?: string;
}

export interface ExtractedReceipt {
  store: string | null;
  items: ExtractedReceiptItem[];
}

export function useExtractReceiptItems() {
  return useMutation({
    mutationFn: async ({ imageBase64, mediaType }: { imageBase64: string; mediaType: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<ExtractedReceipt>("extract-receipt-items", {
        body: { imageBase64, mediaType },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to read receipt");
      }
      return data;
    },
  });
}
