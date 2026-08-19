import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { Subscription } from "@/types/domain";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Combines the subscriptions row with profiles.is_exempt (the manual comp
// flag — see docs/schema_v9_platform_subscriptions.sql) into one "does this
// owner currently have access" check used to gate the whole app.
export function useSubscription(userId: string | undefined, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: ["subscription", userId],
    enabled: !!userId,
    refetchInterval: options?.poll ? 3000 : false,
    queryFn: async () => {
      const [{ data: sub }, { data: profile }] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("owner_id", userId).maybeSingle(),
        supabase.from("profiles").select("is_exempt").eq("id", userId).maybeSingle(),
      ]);
      const subscription = sub as Subscription | null;
      const isExempt = !!profile?.is_exempt;
      const isActive = isExempt || (!!subscription && ACTIVE_STATUSES.has(subscription.status));
      return { subscription, isExempt, isActive };
    },
  });
}

export function useCreateSubscriptionCheckout() {
  return useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
  });
}

export function useCreateBillingPortalSession() {
  return useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
  });
}
