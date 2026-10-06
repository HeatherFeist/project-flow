import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";

export interface StreetViewImage {
  base64: string;
  mimeType: string;
}

// Fetches a real, eye-level exterior photo for a street address from
// Google Street View — a stand-in for an in-person "before" photo when
// visualizing an exterior renovation. See
// supabase/functions/fetch-street-view-image.
export function useFetchStreetView() {
  return useMutation({
    mutationFn: async (input: { address: string; heading?: number }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<StreetViewImage>("fetch-street-view-image", {
        body: input,
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to fetch Street View photo");
      }
      return data;
    },
  });
}
