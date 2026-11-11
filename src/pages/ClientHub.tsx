import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { createInvoiceCheckout, fetchClientHub, requestWork, respondToQuote, startQuoteDeposit } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { LineItemsReport } from "@/components/LineItemsReport";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useParams } from "react-router-dom";

type HubData = Awaited<ReturnType<typeof fetchClientHub>>;

export default function ClientHub() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setData(await fetchClientHub(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function respond(acceptToken: string, quoteId: string, action: "accept" | "decline") {
    setBusyQuote(quoteId);
    try {
      await respondToQuote(acceptToken, action);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the quote");
    } finally {
      setBusyQuote(null);
    }
  }

  async function payDeposit(quoteId: string) {
    if (!token) return;
    setBusyQuote(quoteId);
    try {
      const started = await startQuoteDeposit(token, quoteId);
      const { url } = await createInvoiceCheckout(started.payToken, started.amountCents, started.milestoneId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the deposit");
      setBusyQuote(null);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !message.trim()) return;
    setSending(true);
    try {
      await requestWork(token, message.trim());
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-muted-foreground">
        {error ?? "This link is not valid."}
      </div>
    );
  }

  const businessName = data.business?.business_name || "your contractor";

  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-2">
          {data.business?.logo_url ? (
            <img src={data.business.logo_url} alt="" className="max-h-10 max-w-28 object-contain" />
          ) : (
            <Sparkles className="size-5 text-primary" />
          )}
          <div>
            <p className="font-semibold">{businessName}</p>
            <p className="text-xs text-muted-foreground">Hi {data.client.name}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quotes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            {data.quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
            {data.quotes.map((quote) => (
              <div key={quote.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{formatDate(quote.created_at)}</span>
                  <span className="font-medium">{formatCurrency(quote.total_cents)}</span>
                </div>
                <LineItemsReport items={quote.items} totalCents={quote.total_cents} />
                {quote.deposit_cents ? (
                  <p className="text-sm text-muted-foreground">Deposit due {formatCurrency(quote.deposit_cents)}</p>
                ) : null}
                {(quote.status === "sent" || quote.status === "draft") && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyQuote === quote.id} onClick={() => respond(quote.accept_token, quote.id, "accept")}>
                      <CheckCircle2 /> Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyQuote === quote.id} onClick={() => respond(quote.accept_token, quote.id, "decline")}>
                      <XCircle /> Decline
                    </Button>
                  </div>
                )}
                {quote.status === "accepted" && <p className="text-sm">Accepted.</p>}
                {quote.status === "declined" && <p className="text-sm text-muted-foreground">Declined.</p>}
                {quote.deposit_cents && quote.status !== "declined" && (
                  <Button size="sm" variant="outline" disabled={busyQuote === quote.id} onClick={() => payDeposit(quote.id)}>
                    Pay deposit
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
            {data.invoices.map((invoice) => {
              const remaining = invoice.total_cents - invoice.amount_paid_cents;
              return (
                <div key={invoice.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{formatCurrency(invoice.total_cents)}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.status.replace("_", " ")}
                      {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ""}
                    </p>
                  </div>
                  {remaining > 0 && invoice.status !== "paid" ? (
                    <a href={`/pay/${invoice.pay_token}`} className="text-primary hover:underline">
                      Pay {formatCurrency(remaining)}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Paid</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Request work</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {sent ? (
              <p className="text-sm text-muted-foreground">Sent. {businessName} will see this with their other requests.</p>
            ) : (
              <form onSubmit={submitRequest} className="space-y-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell them what you need done."
                />
                <Button type="submit" disabled={sending || !message.trim()}>
                  {sending ? "Sending…" : "Send request"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
