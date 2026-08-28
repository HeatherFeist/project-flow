import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, LogOut, Loader2, Send, Sparkles } from "lucide-react";
import { fetchPortalDashboard, requestAdditionalService, type PortalDashboardData } from "@/lib/functions";
import { portalSessionKey } from "@/lib/portalSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const JOB_STATUS_VARIANT: Record<string, "secondary" | "success" | "warning" | "outline"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "outline",
};
const QUOTE_STATUS_VARIANT: Record<string, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "success",
  declined: "outline",
};
const INVOICE_STATUS_VARIANT: Record<string, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  partially_paid: "warning",
  paid: "success",
  overdue: "warning",
};

export default function PortalDashboard() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [data, setData] = useState<PortalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  const sessionToken = ownerId ? localStorage.getItem(portalSessionKey(ownerId)) : null;

  useEffect(() => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    fetchPortalDashboard(sessionToken)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        if (ownerId) localStorage.removeItem(portalSessionKey(ownerId));
      })
      .finally(() => setLoading(false));
  }, [sessionToken, ownerId]);

  if (!ownerId) return null;
  if (!sessionToken) return <Navigate to={`/portal/${ownerId}/login`} replace />;

  function signOut() {
    localStorage.removeItem(portalSessionKey(ownerId!));
    window.location.href = `/portal/${ownerId}/login`;
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !sessionToken) return;
    setSendingMessage(true);
    try {
      await requestAdditionalService(sessionToken, message.trim());
      setMessage("");
      setMessageSent(true);
      toast.success("Request sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSendingMessage(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-muted-foreground">{error ?? "Something went wrong."}</p>
        <a href={`/portal/${ownerId}/login`} className="text-sm underline">
          Sign in again
        </a>
      </div>
    );
  }

  const businessName = data.business?.business_name || "your contractor";

  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.business?.logo_url ? (
              <img src={data.business.logo_url} alt={businessName} className="max-h-9 max-w-24 object-contain" />
            ) : (
              <Sparkles className="size-5 text-primary" />
            )}
            <div>
              <p className="font-semibold">{businessName}</p>
              <p className="text-xs text-muted-foreground">Hi {data.client.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {data.jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
            {data.jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(job.scheduled_at)}
                    {job.address ? ` · ${job.address}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={JOB_STATUS_VARIANT[job.status] ?? "outline"}>{job.status.replace("_", " ")}</Badge>
                  <a
                    href={`/job-gallery/${job.photo_share_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="View photos"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quotes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {data.quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
            {data.quotes.map((quote) => (
              <a
                key={quote.id}
                href={`/q/${quote.accept_token}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
              >
                <div>
                  <p className="font-medium">{formatCurrency(quote.total_cents)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(quote.created_at)}</p>
                </div>
                <Badge variant={QUOTE_STATUS_VARIANT[quote.status] ?? "outline"}>{quote.status}</Badge>
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
            {data.invoices.map((invoice) => (
              <a
                key={invoice.id}
                href={`/pay/${invoice.pay_token}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{formatCurrency(invoice.total_cents)}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(invoice.due_date)}
                      {invoice.amount_paid_cents > 0 ? ` · Paid ${formatCurrency(invoice.amount_paid_cents)}` : ""}
                    </p>
                  </div>
                  <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "outline"}>
                    {invoice.status.replace("_", " ")}
                  </Badge>
                </div>
                {invoice.milestones.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {invoice.milestones.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{m.title}</span>
                        <span>{m.status === "paid" ? "Paid" : formatCurrency(m.amount_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Need something else?</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {messageSent ? (
              <p className="text-sm text-muted-foreground">
                Thanks — {businessName} will follow up with you soon.
              </p>
            ) : (
              <form onSubmit={handleSendMessage} className="space-y-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask for an additional service or let them know what else you need…"
                  className="min-h-20"
                />
                <Button type="submit" disabled={sendingMessage || !message.trim()}>
                  <Send className="size-4" /> {sendingMessage ? "Sending…" : "Send request"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
