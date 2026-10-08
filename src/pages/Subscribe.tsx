import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateSubscriptionCheckout, useRedeemTesterCode, useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  "Clients, scheduling, quotes & invoices",
  "Google Calendar + Gmail sync",
  "Missed-call text-back & inbound-text lead capture (Twilio)",
  "AI estimate chatbot with photo/video analysis, embeddable on your site",
  "Card, Cash App, and PayPal payments on invoices — with partial deposits",
];

export default function Subscribe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get("success") === "1";
  const { data, isLoading } = useSubscription(user?.id, { poll: justPaid });
  const createCheckout = useCreateSubscriptionCheckout();
  const redeemCode = useRedeemTesterCode();
  const queryClient = useQueryClient();
  const [testerCode, setTesterCode] = useState("");
  const [showTesterCode, setShowTesterCode] = useState(false);

  useEffect(() => {
    if (data?.isActive) navigate("/dashboard", { replace: true });
  }, [data?.isActive, navigate]);

  async function handleSubscribe() {
    try {
      const { url } = await createCheckout.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout");
    }
  }

  async function handleRedeemCode(e: React.FormEvent) {
    e.preventDefault();
    if (!testerCode.trim() || !user) return;
    try {
      await redeemCode.mutateAsync(testerCode.trim());
      toast.success("You're in — enjoy Project Flow!");
      queryClient.invalidateQueries({ queryKey: ["subscription", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't redeem that code");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <CardTitle className="text-2xl">Subscribe to Project Flow</CardTitle>
          <p className="text-muted-foreground">
            {data?.subscription?.stripe_subscription_id
              ? "$49/month, cancel anytime."
              : "7 days free, then $49/month — cancel anytime."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pb-6">
          {justPaid ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Setting up your account…</p>
            </div>
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubscribe}
                disabled={createCheckout.isPending || isLoading}
              >
                {createCheckout.isPending
                  ? "Redirecting to checkout…"
                  : data?.subscription?.stripe_subscription_id
                    ? "Subscribe — $49/mo"
                    : "Start 7-day free trial"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Payment is handled securely by Stripe. A card is required to start the trial, but you
                won't be charged until it ends — cancel anytime before then from Settings → Billing.
              </p>

              {showTesterCode ? (
                <form onSubmit={handleRedeemCode} className="space-y-2 border-t pt-4">
                  <div className="flex gap-2">
                    <Input
                      value={testerCode}
                      onChange={(e) => setTesterCode(e.target.value)}
                      placeholder="Tester code"
                      disabled={redeemCode.isPending}
                      autoFocus
                    />
                    <Button type="submit" variant="secondary" disabled={redeemCode.isPending || !testerCode.trim()}>
                      {redeemCode.isPending ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTesterCode(true)}
                  className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
                >
                  Have a tester code?
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
