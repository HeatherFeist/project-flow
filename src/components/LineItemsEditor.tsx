import { useState } from "react";
import { BookOpen, Calculator, Plus, Trash2 } from "lucide-react";
import { usePriceBook } from "@/hooks/usePriceBook";
import type { LineItem, PriceBookItem } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PriceBookCalculatorDialog } from "@/components/PriceBookCalculatorDialog";
import { formatCurrency } from "@/lib/utils";

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  /** When provided, shows an "Add from Price Book" button that picks a Price Book item straight into a line item. */
  ownerId?: string;
}

export function LineItemsEditor({ items, onChange, ownerId }: Props) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  const totalHours = items.reduce((sum, item) => sum + (item.estimated_hours ?? 0), 0);
  const { data: priceBookItems } = usePriceBook(ownerId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewing, setPreviewing] = useState<PriceBookItem | null>(null);

  function update(id: string, patch: Partial<LineItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([
      ...items,
      { id: crypto.randomUUID(), description: "", quantity: 1, unit_price_cents: 0 },
    ]);
  }

  function addFromPriceBook(pbItem: PriceBookItem) {
    onChange([
      ...items,
      { id: crypto.randomUUID(), description: pbItem.item_name, quantity: 1, unit_price_cents: pbItem.high_cents },
    ]);
    setPickerOpen(false);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Input
            placeholder="Description"
            value={item.description}
            onChange={(e) => update(item.id, { description: e.target.value })}
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            step="1"
            placeholder="Qty"
            value={item.quantity}
            onChange={(e) => update(item.id, { quantity: Number(e.target.value) })}
            className="w-20"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Unit price"
            value={item.unit_price_cents / 100}
            onChange={(e) =>
              update(item.id, { unit_price_cents: Math.round(Number(e.target.value) * 100) })
            }
            className="w-28"
          />
          <Input
            type="number"
            min={0}
            step="0.25"
            placeholder="Hrs"
            title="Estimated labor hours (internal only, never shown to the client)"
            value={item.estimated_hours ?? ""}
            onChange={(e) =>
              update(item.id, { estimated_hours: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="w-20"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus /> Add line item
          </Button>
          {ownerId && (priceBookItems ?? []).length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <BookOpen /> Add from Price Book
            </Button>
          )}
        </div>
        <div className="text-right">
          {totalHours > 0 && (
            <p className="text-xs text-muted-foreground">Estimated labor: {totalHours} hrs (not shown to client)</p>
          )}
          <p className="text-sm font-medium">Total: {formatCurrency(total)}</p>
        </div>
      </div>

      {pickerOpen && (
        <Dialog open onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add from Price Book</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 space-y-1 overflow-auto">
              {(priceBookItems ?? []).map((pbItem) => (
                <div key={pbItem.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pbItem.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pbItem.category} · {formatCurrency(pbItem.low_cents)} – {formatCurrency(pbItem.high_cents)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(pbItem.material_low_cents !== null ||
                      pbItem.labor_low_cents !== null ||
                      pbItem.supplies_low_cents !== null) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="View cost calculator"
                        onClick={() => setPreviewing(pbItem)}
                      >
                        <Calculator className="size-4" />
                      </Button>
                    )}
                    <Button type="button" size="sm" onClick={() => addFromPriceBook(pbItem)}>
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {previewing && (
        <PriceBookCalculatorDialog
          item={previewing}
          onClose={() => setPreviewing(null)}
          onInsert={(pbItem) => addFromPriceBook(pbItem)}
        />
      )}
    </div>
  );
}
