import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Calculator, Loader2, Pencil, Plus, ScanLine, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasPriceBookBreakdown,
  useCreatePriceBookItem,
  useDeletePriceBookItem,
  usePriceBook,
  useSeedStarterPriceBook,
  useUpdatePriceBookItem,
} from "@/hooks/usePriceBook";
import { useExtractInvoiceItems, type ExtractedInvoice } from "@/hooks/useInvoiceScanExtraction";
import { blobToBase64, fileToImageBlobs } from "@/lib/estimateMedia";
import type { PriceBookItem, PriceUnit } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ImportPriceHistoryDialog } from "@/components/ImportPriceHistoryDialog";
import { InvoiceScanReviewDialog } from "@/components/InvoiceScanReviewDialog";
import { PriceBookCalculatorDialog } from "@/components/PriceBookCalculatorDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

const UNITS: PriceUnit[] = ["flat", "per hour", "per sq ft", "per linear ft"];

const EMPTY_FORM = {
  category: "",
  item_name: "",
  unit: "flat" as PriceUnit,
  low: "",
  high: "",
  notes: "",
  description: "",
  materialLow: "",
  materialHigh: "",
  materialQty: "",
  laborLow: "",
  laborHigh: "",
  laborQty: "",
  suppliesLow: "",
  suppliesHigh: "",
};

function toCentsOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default function PriceBook() {
  const { user } = useAuth();
  const { data: items, isLoading, error } = usePriceBook(user?.id);
  const createItem = useCreatePriceBookItem();
  const updateItem = useUpdatePriceBookItem();
  const deleteItem = useDeletePriceBookItem();
  const seedStarter = useSeedStarterPriceBook();
  const extractInvoiceItems = useExtractInvoiceItems();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceBookItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState<ExtractedInvoice | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [viewingCalculator, setViewingCalculator] = useState<PriceBookItem | null>(null);

  const breakdownTotal = useMemo(() => {
    const low = (toCentsOrNull(form.materialLow) ?? 0) + (toCentsOrNull(form.laborLow) ?? 0) + (toCentsOrNull(form.suppliesLow) ?? 0);
    const high = (toCentsOrNull(form.materialHigh) ?? 0) + (toCentsOrNull(form.laborHigh) ?? 0) + (toCentsOrNull(form.suppliesHigh) ?? 0);
    return { low, high };
  }, [form.materialLow, form.materialHigh, form.laborLow, form.laborHigh, form.suppliesLow, form.suppliesHigh]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowBreakdown(false);
    setOpen(true);
  }

  function openEdit(item: PriceBookItem) {
    setEditing(item);
    setForm({
      category: item.category,
      item_name: item.item_name,
      unit: item.unit,
      low: (item.low_cents / 100).toString(),
      high: (item.high_cents / 100).toString(),
      notes: item.notes ?? "",
      description: item.description ?? "",
      materialLow: item.material_low_cents !== null ? (item.material_low_cents / 100).toString() : "",
      materialHigh: item.material_high_cents !== null ? (item.material_high_cents / 100).toString() : "",
      materialQty: item.material_quantity_label ?? "",
      laborLow: item.labor_low_cents !== null ? (item.labor_low_cents / 100).toString() : "",
      laborHigh: item.labor_high_cents !== null ? (item.labor_high_cents / 100).toString() : "",
      laborQty: item.labor_quantity_label ?? "",
      suppliesLow: item.supplies_low_cents !== null ? (item.supplies_low_cents / 100).toString() : "",
      suppliesHigh: item.supplies_high_cents !== null ? (item.supplies_high_cents / 100).toString() : "",
    });
    setShowBreakdown(hasPriceBookBreakdown(item));
    setOpen(true);
  }

  function applyBreakdownTotal() {
    setForm((f) => ({ ...f, low: (breakdownTotal.low / 100).toString(), high: (breakdownTotal.high / 100).toString() }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload = {
      category: form.category,
      item_name: form.item_name,
      unit: form.unit,
      low_cents: Math.round(Number(form.low) * 100),
      high_cents: Math.round(Number(form.high) * 100),
      notes: form.notes || null,
      description: showBreakdown ? form.description || null : null,
      material_low_cents: showBreakdown ? toCentsOrNull(form.materialLow) : null,
      material_high_cents: showBreakdown ? toCentsOrNull(form.materialHigh) : null,
      material_quantity_label: showBreakdown ? form.materialQty || null : null,
      labor_low_cents: showBreakdown ? toCentsOrNull(form.laborLow) : null,
      labor_high_cents: showBreakdown ? toCentsOrNull(form.laborHigh) : null,
      labor_quantity_label: showBreakdown ? form.laborQty || null : null,
      supplies_low_cents: showBreakdown ? toCentsOrNull(form.suppliesLow) : null,
      supplies_high_cents: showBreakdown ? toCentsOrNull(form.suppliesHigh) : null,
    };
    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.id, owner_id: user.id, ...payload });
        toast.success("Price book item updated");
      } else {
        await createItem.mutateAsync({ owner_id: user.id, ...payload });
        toast.success("Price book item added");
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save item");
    }
  }

  async function handleSeed() {
    if (!user) return;
    try {
      const count = await seedStarter.mutateAsync(user.id);
      toast.success(`Added ${count} starter items — edit or delete any that don't fit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load starter items");
    }
  }

  async function handleInvoiceScanSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const [blob] = await fileToImageBlobs(file);
      const base64 = await blobToBase64(blob);
      const extracted = await extractInvoiceItems.mutateAsync({ imageBase64: base64, mediaType: "image/jpeg" });
      if (extracted.items.length === 0) {
        toast.info("No service line items found on that invoice.");
      } else {
        setScanReview(extracted);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read invoice");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Price Book</h1>
          <p className="text-muted-foreground">
            Typical price ranges the estimate chatbot uses to give customers a rough number.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(items ?? []).length === 0 && !isLoading && (
            <Button variant="outline" onClick={handleSeed} disabled={seedStarter.isPending}>
              <Sparkles /> {seedStarter.isPending ? "Loading…" : "Load starter items"}
            </Button>
          )}
          <ImportPriceHistoryDialog />
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleInvoiceScanSelected}
          />
          <Button variant="outline" onClick={() => scanInputRef.current?.click()} disabled={scanning}>
            {scanning ? <Loader2 className="animate-spin" /> : <ScanLine />}
            {scanning ? "Reading…" : "Scan old invoice"}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus /> Add item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit price book item" : "Add price book item"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      required
                      placeholder="Plumbing"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item_name">Item</Label>
                    <Input
                      id="item_name"
                      required
                      placeholder="Faucet replacement"
                      value={form.item_name}
                      onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v as PriceUnit })}>
                      <SelectTrigger>
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
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="low">Low ($)</Label>
                    <Input
                      id="low"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.low}
                      onChange={(e) => setForm({ ...form, low: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="high">High ($)</Label>
                    <Input
                      id="high"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.high}
                      onChange={(e) => setForm({ ...form, high: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                <label className="flex items-center gap-2 border-t pt-4 text-sm font-medium">
                  <Checkbox checked={showBreakdown} onCheckedChange={(c) => setShowBreakdown(!!c)} />
                  Add a cost breakdown (Material / Labor / Supplies)
                </label>

                {showBreakdown && (
                  <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      Shows a detailed calculator for this item — Homewyse-style, but your own numbers and
                      wording. Leave a category blank to skip it.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="description">Client-facing description (optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="What's included in this job — shown to the client on the calculator."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                      />
                    </div>

                    {(
                      [
                        { label: "Material, Fixtures", lowKey: "materialLow", highKey: "materialHigh", qtyKey: "materialQty", qtyPlaceholder: "e.g. 85 sq ft" },
                        { label: "Project Labor", lowKey: "laborLow", highKey: "laborHigh", qtyKey: "laborQty", qtyPlaceholder: "e.g. 12 hrs" },
                        { label: "Project Supplies", lowKey: "suppliesLow", highKey: "suppliesHigh", qtyKey: null, qtyPlaceholder: "" },
                      ] as const
                    ).map((row) => (
                      <div key={row.label} className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{row.label}</Label>
                          {row.qtyKey && (
                            <Input
                              placeholder={row.qtyPlaceholder}
                              value={form[row.qtyKey]}
                              onChange={(e) => setForm({ ...form, [row.qtyKey]: e.target.value })}
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Low $"
                          value={form[row.lowKey]}
                          onChange={(e) => setForm({ ...form, [row.lowKey]: e.target.value })}
                          className="h-8 self-end"
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="High $"
                          value={form[row.highKey]}
                          onChange={(e) => setForm({ ...form, [row.highKey]: e.target.value })}
                          className="h-8 self-end"
                        />
                      </div>
                    ))}

                    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                      <span>
                        Breakdown total: {formatCurrency(breakdownTotal.low)} – {formatCurrency(breakdownTotal.high)}
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={applyBreakdownTotal}>
                        Use as Low/High above
                      </Button>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button type="submit" disabled={createItem.isPending || updateItem.isPending}>
                    {createItem.isPending || updateItem.isPending
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Add item"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load the price book: {error.message}. This usually means{" "}
          <code>docs/schema_v5_price_book_chat.sql</code> hasn't been run in Supabase yet.
        </p>
      )}

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Range</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (items ?? []).length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No price book items yet. Click "Load starter items" for a reasonable starting point,
                    or add your own.
                  </TableCell>
                </TableRow>
              )}
              {(items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.category}</TableCell>
                  <TableCell className="font-medium">{item.item_name}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>
                    {formatCurrency(item.low_cents)} – {formatCurrency(item.high_cents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {hasPriceBookBreakdown(item) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View cost calculator"
                          onClick={() => setViewingCalculator(item)}
                        >
                          <Calculator className="size-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Edit item" onClick={() => openEdit(item)}>
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteButton
                        itemLabel={item.item_name}
                        onConfirm={async () => {
                          try {
                            await deleteItem.mutateAsync(item.id);
                            toast.success("Item deleted");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to delete item");
                          }
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {scanReview && <InvoiceScanReviewDialog extracted={scanReview} onClose={() => setScanReview(null)} />}
      {viewingCalculator && (
        <PriceBookCalculatorDialog item={viewingCalculator} onClose={() => setViewingCalculator(null)} />
      )}
    </div>
  );
}
