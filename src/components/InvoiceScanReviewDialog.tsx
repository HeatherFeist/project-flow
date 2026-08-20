import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useImportScannedPriceBookItems } from "@/hooks/usePriceBook";
import type { ExtractedInvoice } from "@/hooks/useInvoiceScanExtraction";
import type { PriceBookItem, PriceUnit } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const UNITS: PriceUnit[] = ["flat", "per hour", "per sq ft", "per linear ft"];

interface ReviewRow {
  include: boolean;
  category: string;
  itemName: string;
  price: string;
  unit: PriceBookItem["unit"];
}

interface InvoiceScanReviewDialogProps {
  extracted: ExtractedInvoice;
  onClose: () => void;
}

// Shown right after a photographed past invoice is analyzed — nothing has
// been saved yet. Lets the owner fix any misread description/price/category
// before it lands as a real price book entry, same pattern as the receipt
// scanner's review step.
export function InvoiceScanReviewDialog({ extracted, onClose }: InvoiceScanReviewDialogProps) {
  const { user } = useAuth();
  const importScanned = useImportScannedPriceBookItems();
  const [rows, setRows] = useState<ReviewRow[]>(
    extracted.items.map((item) => ({
      include: true,
      category: item.category?.trim() || "Uncategorized",
      itemName: item.item_name,
      price: item.price.toString(),
      unit: (item.unit as PriceBookItem["unit"]) || "flat",
    })),
  );

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const includedCount = rows.filter((r) => r.include && r.itemName.trim() && Number(r.price) > 0).length;

  async function handleSave() {
    if (!user) return;
    const toImport = rows.filter((r) => r.include && r.itemName.trim() && Number(r.price) > 0);
    try {
      const imported = await importScanned.mutateAsync({
        ownerId: user.id,
        items: toImport.map((r) => ({
          category: r.category.trim() || "Uncategorized",
          itemName: r.itemName.trim(),
          unit: r.unit,
          priceCents: Math.round(Number(r.price) * 100),
        })),
      });
      toast.success(`Added ${imported} price book item${imported === 1 ? "" : "s"}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save price book items");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review items from invoice</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Double-check descriptions and prices — reading a photographed invoice isn't always perfect. Each
          item is added at the exact price shown; edit the range afterward in the Price Book if you'd
          rather it reflect a low/high spread. Uncheck anything that isn't billed labor/service (materials
          belong in the Materials catalog instead).
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No service line items were found on that invoice.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Category</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-28">Price ($)</TableHead>
                  <TableHead className="w-36">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Checkbox
                        checked={row.include}
                        onCheckedChange={(c) => updateRow(i, { include: !!c })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.category}
                        onChange={(e) => updateRow(i, { category: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.itemName}
                        onChange={(e) => updateRow(i, { itemName: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.price}
                        onChange={(e) => updateRow(i, { price: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={row.unit} onValueChange={(v) => updateRow(i, { unit: v as PriceUnit })}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importScanned.isPending}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={importScanned.isPending || includedCount === 0}>
            {importScanned.isPending
              ? "Saving…"
              : `Add ${includedCount || ""} item${includedCount === 1 ? "" : "s"} to Price Book`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
