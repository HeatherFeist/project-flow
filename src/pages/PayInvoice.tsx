import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Loader2, Sparkles } from "lucide-react";
import { createInvoiceCheckout, fetchInvoicePayInfo } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type InvoiceData = Awaited<ReturnType<typeof fetchInvoicePayInfo>>;

export default function PayInvoice() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get("paid") === "1";

  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);

  async function load() {
    if (!token) return;
    try {
      const result = await fetchInvoicePayInfo(token);
      setData(result);
      const remaining = (result.invoice.total_cents - result.invoice.amount_paid_cents) / 100;
      setAmount(remaining > 0 ? remaining.toFixed(2) : "0.00");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Poll briefly after returning from Stripe, in case the webhook hasn't landed yet.
    if (justPaid) {
      const interval = setInterval(load, 2000);
      const timeout = setTimeout(() => clearInterval(interval), 10000);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, justPaid]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const result = await createInvoiceCheckout(token, amountCents);
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (error && !data) {
    return (
      <Centered>
        <p className="text-muted-foreground">{error}</p>
      </Centered>
    );
  }

  if (!data) return null;

  const { invoice, business } = data;
  const businessName = business?.business_name || "your contractor";
  const remainingCents = invoice.total_cents - invoice.amount_paid_cents;
  const fullyPaid = remainingCents <= 0;

  return (
    <Centered wide>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Sparkles className="mb-1 size-6 text-primary" />
          <CardTitle>Invoice from {businessName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pb-6">
          <div>
            <p className="text-sm text-muted-foreground">Hi {invoice.client.name},</p>
            <div className="mt-3 divide-y rounded-md border">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {item.description} <span className="text-muted-foreground">×{item.quantity}</span>
                  </span>
                  <span>{formatCurrency(item.quantity * item.unit_price_cents)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1 text-right text-sm">
              <p>Total: {formatCurrency(invoice.total_cents)}</p>
              {invoice.amount_paid_cents > 0 && (
                <p className="text-success">Paid so far: {formatCurrency(invoice.amount_paid_cents)}</p>
              )}
              <p className="text-lg font-semibold">Balance due: {formatCurrency(Math.max(remainingCents, 0))}</p>
            </div>
          </div>

          {fullyPaid ? (
            <div className="rounded-md border bg-secondary/50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 size-6 text-success" />
              <p className="font-medium">Paid in full — thank you!</p>
            </div>
          ) : (
            <form onSubmit={handlePay} className="space-y-3">
              {justPaid && (
                <p className="text-center text-sm text-muted-foreground">
                  Finishing up your payment — this updates automatically in a few seconds.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount to pay</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  max={remainingCents / 100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  You can pay the full balance or a partial amount / deposit, by card or Cash App.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={paying}>
                <CreditCard /> {paying ? "Redirecting to checkout…" : "Continue to payment"}
              </Button>
            </form>
          )}

          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className={wide ? "w-full max-w-lg" : undefined}>{children}</div>
    </div>
  );
}
