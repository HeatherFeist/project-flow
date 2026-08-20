import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { PriceUnit } from "@/types/domain";

export interface ExtractedInvoiceItem {
  category?: string;
  item_name: string;
  price: number;
  unit?: PriceUnit;
}

export interface ExtractedInvoice {
  items: ExtractedInvoiceItem[];
}

export function useExtractInvoiceItems() {
  return useMutation({
    mutationFn: async ({ imageBase64, mediaType }: { imageBase64: string; mediaType: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<ExtractedInvoice>("extract-invoice-items", {
        body: { imageBase64, mediaType },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to read invoice");
      }
      return data;
    },
  });
}
