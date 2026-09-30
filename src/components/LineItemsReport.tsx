import type { LineItem } from "@/types/domain";
import { formatCurrency } from "@/lib/utils";

interface Props {
  items: LineItem[];
  totalCents: number;
  /** Owner-only view (Quote detail) shows labor hours per item; client-facing pages never do. */
  showHours?: boolean;
  /** A little intro line above the items, e.g. "Here's what's included:" */
  heading?: string;
  /** Invoice pay page shows its own Total/Paid/Balance block below — skip this component's own Total row there. */
  hideTotal?: boolean;
}

// A detailed, itemized breakdown — each line item gets its own block with
// the full scope of work as the headline and quantity/price as supporting
// detail, closer to a proper written estimate (in the spirit of Homewyse's
// itemized layout, not its proprietary data) than a cramped single row.
// Shared by the owner's Quote detail page and the client-facing quote and
// invoice pages so the presentation stays consistent everywhere.
export function LineItemsReport({ items, totalCents, showHours, heading, hideTotal }: Props) {
  const totalHours = items.reduce((sum, item) => sum + (item.estimated_hours ?? 0), 0);

  return (
    <div className="space-y-4">
      {heading && <p className="text-sm font-medium">{heading}</p>}
      <div className="divide-y overflow-hidden rounded-md border">
        {items.map((item) => (
          <div key={item.id} className="space-y-1.5 p-4">
            <div className="flex items-start justify-between gap-4">
              <p className="font-medium leading-snug">{item.description}</p>
              <p className="shrink-0 whitespace-nowrap font-semibold">
                {formatCurrency(item.quantity * item.unit_price_cents)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Qty {item.quantity} × {formatCurrency(item.unit_price_cents)}
              {showHours && item.estimated_hours ? ` · ~${item.estimated_hours} hrs` : ""}
            </p>
          </div>
        ))}
      </div>
      {!hideTotal && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-semibold">{formatCurrency(totalCents)}</span>
        </div>
      )}
      {showHours && totalHours > 0 && (
        <p className="text-right text-xs text-muted-foreground">
          Estimated labor: {totalHours} hrs total (internal only, not shown to the client)
        </p>
      )}
      {!showHours && totalHours > 0 && (
        <p className="text-right text-xs text-muted-foreground">Estimated time: ~{totalHours} labor hrs</p>
      )}
    </div>
  );
}
