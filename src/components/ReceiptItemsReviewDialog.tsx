import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useImportMaterials } from "@/hooks/useMaterials";
import type { ExtractedReceipt } from "@/hooks/useReceiptExtraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ReviewRow {
  include: boolean;
  name: string;
  price: string;
  sku: string;
}

interface ReceiptItemsReviewDialogProps {
  extracted: ExtractedReceipt;
  onClose: () => void;
}

// Shown right after a receipt photo is analyzed — nothing has been saved
// yet. Lets the owner fix any misread name/price/SKU, uncheck lines that
// aren't real materials (tax, discounts, whatever Claude didn't already
// filter out), before anything is written to the Materials catalog.
export function ReceiptItemsReviewDialog({ extracted, onClose }: ReceiptItemsReviewDialogProps) {
  const { user } = useAuth();
  const importMaterials = useImportMaterials();
  const [supplier, setSupplier] = useState(extracted.store ?? "");
  const [rows, setRows] = useState<ReviewRow[]>(
    extracted.items.map((item) => ({
      include: true,
      name: item.name,
      price: item.price.toString(),
      sku: item.sku ?? "",
    })),
  );

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const includedCount = rows.filter((r) => r.include && r.name.trim() && Number(r.price) > 0).length;

  async function handleSave() {
    if (!user) return;
    const toImport = rows.filter((r) => r.include && r.name.trim() && Number(r.price) > 0);
    try {
      const { imported } = await importMaterials.mutateAsync({
        ownerId: user.id,
        rows: toImport.map((r) => ({
          name: r.name.trim(),
          category: null,
          supplier: supplier.trim() || null,
          sku: r.sku.trim() || null,
          unit: "each",
          costCents: Math.round(Number(r.price) * 100),
          productUrl: null,
        })),
      });
      toast.success(`Added ${imported} material${imported === 1 ? "" : "s"}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save materials");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review items from receipt</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Double-check names and prices — receipt photos aren't always read perfectly. Uncheck anything
          that isn't a material (tax, fees, etc.) before adding to your Materials catalog.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Supplier</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Home Depot" />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No line items were found on that receipt.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Item</TableHead>
                  <TableHead className="w-28">Price ($)</TableHead>
                  <TableHead className="w-32">SKU</TableHead>
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
                        value={row.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
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
                      <Input
                        value={row.sku}
                        onChange={(e) => updateRow(i, { sku: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importMaterials.isPending}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={importMaterials.isPending || includedCount === 0}>
            {importMaterials.isPending ? "Saving…" : `Add ${includedCount || ""} item${includedCount === 1 ? "" : "s"} to Materials`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
