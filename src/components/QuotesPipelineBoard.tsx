import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useUpdateQuoteStatus } from "@/hooks/useQuotes";
import type { Quote, QuoteStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const COLUMNS: { status: QuoteStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "sent", label: "Sent" },
  { status: "accepted", label: "Accepted" },
  { status: "declined", label: "Declined" },
];

interface QuotesPipelineBoardProps {
  quotes: Quote[];
}

// Drag-and-drop board over the same quotes/status data as the table view
// — no new schema, just a different lens on it. Native HTML5 drag/drop,
// no extra library, since this is exactly four fixed columns.
export function QuotesPipelineBoard({ quotes }: QuotesPipelineBoardProps) {
  const updateStatus = useUpdateQuoteStatus();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<QuoteStatus | null>(null);

  async function handleDrop(status: QuoteStatus) {
    setDragOverColumn(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const quote = quotes.find((q) => q.id === id);
    if (!quote || quote.status === status) return;
    try {
      await updateStatus.mutateAsync({ id, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update quote status");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const columnQuotes = quotes.filter((q) => q.status === col.status);
        return (
          <div
            key={col.status}
            className={cn(
              "flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 transition-colors",
              dragOverColumn === col.status && "border-primary bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(col.status);
            }}
            onDragLeave={() => setDragOverColumn((c) => (c === col.status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.status);
            }}
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-medium">{col.label}</h3>
              <span className="text-xs text-muted-foreground">{columnQuotes.length}</span>
            </div>

            <div className="flex min-h-16 flex-col gap-2">
              {columnQuotes.map((quote) => (
                <Link
                  key={quote.id}
                  to={`/quotes/${quote.id}`}
                  draggable
                  onDragStart={() => setDraggingId(quote.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className={cn(
                    "block cursor-grab rounded-md border bg-background p-3 shadow-sm transition-opacity hover:border-primary/50 active:cursor-grabbing",
                    draggingId === quote.id && "opacity-40",
                  )}
                >
                  <p className="text-sm font-medium">{quote.client?.name ?? "Unknown client"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(quote.created_at)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{formatCurrency(quote.total_cents)}</span>
                    {quote.responded_at && <Badge variant="secondary">Responded</Badge>}
                  </div>
                </Link>
              ))}
              {columnQuotes.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">Drop a quote here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
