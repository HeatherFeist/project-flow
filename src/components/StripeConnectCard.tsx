import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTeam } from "@/contexts/TeamContext";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ConnectAccount {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export function StripeConnectCard() {
  const { ownerId, isAdmin } = useTeam();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { data: account } = useQuery({
    queryKey: ["stripe_connect", ownerId],
    enabled: !!ownerId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
        .eq("owner_id", ownerId!)
        .maybeSingle();
      if (error) throw error;
      return data as ConnectAccount | null;
    },
  });

  const connect = useMutation({
    mutationFn: async (action: "start" | "refresh") => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ url?: string; charges_enabled?: boolean; error?: string }>(
        "stripe-connect",
        {
          body: { action },
          headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        },
      );
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stripe_connect", ownerId] });
      if (data?.url) window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not reach Stripe");
    },
  });

  useEffect(() => {
    const flag = params.get("connect");
    if (flag === "return" || flag === "refresh") {
      connect.mutate("refresh");
    }
    // Only once when Stripe sends the browser back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!isAdmin) return null;

  const ready = account?.charges_enabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Connect</CardTitle>
        <CardDescription>
          Card and bank (ACH) payments from the client hub go into your own Stripe account. This uses Stripe’s test
          mode until you switch keys later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-6 text-sm">
        <p className="text-muted-foreground">
          {ready
            ? "Charges are enabled. Clients can pay invoices and deposits into your Stripe account."
            : account
              ? "Stripe account started. Finish the Stripe form so charges can be turned on."
              : "Not connected yet."}
        </p>
        <Button onClick={() => connect.mutate("start")} disabled={connect.isPending}>
          {connect.isPending ? "Opening Stripe…" : ready ? "Update Stripe account" : "Connect Stripe"}
        </Button>
      </CardContent>
    </Card>
  );
}
