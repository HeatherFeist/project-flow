import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PaymentSettings } from "@/types/domain";

export function usePaymentSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["payment_settings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("*")
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as PaymentSettings | null;
    },
  });
}

export function useSavePaymentSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      owner_id: string;
      stripe_secret_key?: string | null;
      stripe_webhook_secret?: string | null;
      paypal_client_id?: string | null;
      paypal_client_secret?: string | null;
      paypal_mode?: "sandbox" | "live";
    }) => {
      const { error } = await supabase
        .from("payment_settings")
        .upsert({ ...settings, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payment_settings", variables.owner_id] });
    },
  });
}
