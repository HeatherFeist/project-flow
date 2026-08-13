import { Plus, Trash2 } from "lucide-react";
import type { LineItem } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}

export function LineItemsEditor({ items, onChange }: Props) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);

  function update(id: string, patch: Partial<LineItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([
      ...items,
      { id: crypto.randomUUID(), description: "", quantity: 1, unit_price_cents: 0 },
    ]);
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
          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus /> Add line item
        </Button>
        <p className="text-sm font-medium">Total: {formatCurrency(total)}</p>
      </div>
    </div>
  );
}
