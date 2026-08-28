import { Calculator } from "lucide-react";
import type { PriceBookItem } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface Row {
  label: string;
  detail: string;
  quantity: string | null;
  lowCents: number;
  highCents: number;
}

function buildRows(item: PriceBookItem): Row[] {
  const rows: Row[] = [];
  if (item.material_low_cents !== null && item.material_high_cents !== null) {
    rows.push({
      label: "Material, Fixtures",
      detail: "Typical material and product purchase quantities, including normal overage.",
      quantity: item.material_quantity_label,
      lowCents: item.material_low_cents,
      highCents: item.material_high_cents,
    });
  }
  if (item.labor_low_cents !== null && item.labor_high_cents !== null) {
    rows.push({
      label: "Project Labor",
      detail: "Setup, prep, job completion, and cleanup.",
      quantity: item.labor_quantity_label,
      lowCents: item.labor_low_cents,
      highCents: item.labor_high_cents,
    });
  }
  if (item.supplies_low_cents !== null && item.supplies_high_cents !== null) {
    rows.push({
      label: "Project Supplies",
      detail: "Equipment allowance and supplies for prep and site cleanup.",
      quantity: null,
      lowCents: item.supplies_low_cents,
      highCents: item.supplies_high_cents,
    });
  }
  return rows;
}

interface PriceBookCalculatorDialogProps {
  item: PriceBookItem;
  onClose: () => void;
  /** When provided, shows an "Insert into quote" action instead of just closing. */
  onInsert?: (item: PriceBookItem) => void;
}

// Read-only cost-calculator view of a single Price Book item's optional
// Material/Labor/Supplies breakdown — Project Flow's own version of the
// familiar "line item / quantity / lower / higher" layout, built from
// scratch with the owner's own numbers and wording (see
// docs/schema_v26_price_book_calculator.sql for why this isn't sourced
// from any third party's proprietary data).
export function PriceBookCalculatorDialog({ item, onClose, onInsert }: PriceBookCalculatorDialogProps) {
  const rows = buildRows(item);
  const totalLow = rows.reduce((sum, r) => sum + r.lowCents, 0);
  const totalHigh = rows.reduce((sum, r) => sum + r.highCents, 0);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item.item_name}</DialogTitle>
        </DialogHeader>

        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cost breakdown set up for this item yet — edit it in the Price Book to add one.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item detail</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28 text-right">Lower</TableHead>
                  <TableHead className="w-28 text-right">Higher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>
                      <p className="font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.detail}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.lowCents)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.highCents)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalLow)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalHigh)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Excludes sales tax and any fees or repairs not covered in the description above.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onInsert && (
            <Button
              onClick={() => {
                onInsert(item);
                onClose();
              }}
            >
              <Calculator /> Insert into quote
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
