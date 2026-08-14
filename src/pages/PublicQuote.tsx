import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { bookSlot, fetchAvailableSlots, fetchQuote, respondToQuote } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type QuoteData = Awaited<ReturnType<typeof fetchQuote>>;

export default function PublicQuote() {
  const { token, action } = useParams<{ token: string; action?: string }>();
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [slots, setSlots] = useState<{ start: string; end: string }[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await fetchQuote(token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // A click straight from the email (/q/:token/accept or /decline) applies
  // automatically once the quote is loaded, if it hasn't been answered yet.
  useEffect(() => {
    if (!token || !data || data.quote.status !== "sent") return;
    if (action === "accept" || action === "decline") {
      handleRespond(action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, action]);

  useEffect(() => {
    if (data?.quote.status === "accepted" && !data.job && !slots) {
      loadSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function handleRespond(nextAction: "accept" | "decline") {
    if (!token) return;
    setResponding(true);
    try {
      await respondToQuote(token, nextAction);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResponding(false);
    }
  }

  async function loadSlots() {
    if (!token) return;
    setSlotsLoading(true);
    try {
      const result = await fetchAvailableSlots(token);
      setSlots(result.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load open times");
    } finally {
      setSlotsLoading(false);
    }
  }

  async function handleBook(slot: { start: string; end: string }) {
    if (!token) return;
    setBooking(slot.start);
    try {
      await bookSlot(token, slot.start, slot.end);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book that time");
    } finally {
      setBooking(null);
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

  const { quote, business, job } = data;
  const businessName = business?.business_name || "your contractor";

  return (
    <Centered wide>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Sparkles className="mb-1 size-6 text-primary" />
          <CardTitle>Quote from {businessName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pb-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Hi {quote.client.name}, here{"'"}s your quote{quote.notes ? `: ${quote.notes}` : "."}
            </p>
            <div className="mt-3 divide-y rounded-md border">
              {quote.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {item.description} <span className="text-muted-foreground">×{item.quantity}</span>
                  </span>
                  <span>{formatCurrency(item.quantity * item.unit_price_cents)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-lg font-semibold">{formatCurrency(quote.total_cents)}</p>
          </div>

          {quote.status === "sent" || quote.status === "draft" ? (
            <div className="flex justify-center gap-3">
              <Button onClick={() => handleRespond("accept")} disabled={responding}>
                <CheckCircle2 /> Accept quote
              </Button>
              <Button variant="outline" onClick={() => handleRespond("decline")} disabled={responding}>
                <XCircle /> Decline
              </Button>
            </div>
          ) : null}

          {quote.status === "declined" && (
            <p className="text-center text-sm text-muted-foreground">
              You{"'"}ve declined this quote. Reach out to {businessName} if that changes.
            </p>
          )}

          {quote.status === "accepted" && job && (
            <div className="rounded-md border bg-secondary/50 p-4 text-center">
              <p className="font-medium">You{"'"}re scheduled!</p>
              <p className="text-sm text-muted-foreground">
                {new Date(job.scheduled_at).toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {job.address && <p className="text-sm text-muted-foreground">{job.address}</p>}
            </div>
          )}

          {quote.status === "accepted" && !job && (
            <div>
              <p className="mb-3 text-center text-sm font-medium">Pick a time that works for you</p>
              {slotsLoading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!slotsLoading && slots && slots.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  No open times found — please contact {businessName} directly to schedule.
                </p>
              )}
              {!slotsLoading && slots && slots.length > 0 && (
                <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {slots.map((slot) => (
                    <Button
                      key={slot.start}
                      variant="outline"
                      size="sm"
                      disabled={booking !== null}
                      onClick={() => handleBook(slot)}
                    >
                      {booking === slot.start ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        new Date(slot.start).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      )}
                    </Button>
                  ))}
                </div>
              )}
            </div>
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
