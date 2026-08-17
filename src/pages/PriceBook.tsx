import { useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreatePriceBookItem,
  useDeletePriceBookItem,
  usePriceBook,
  useSeedStarterPriceBook,
} from "@/hooks/usePriceBook";
import type { PriceUnit } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ImportPriceHistoryDialog } from "@/components/ImportPriceHistoryDialog";
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

export default function PriceBook() {
  const { user } = useAuth();
  const { data: items, isLoading, error } = usePriceBook(user?.id);
  const createItem = useCreatePriceBookItem();
  const deleteItem = useDeletePriceBookItem();
  const seedStarter = useSeedStarterPriceBook();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "",
    item_name: "",
    unit: "flat" as PriceUnit,
    low: "",
    high: "",
    notes: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      await createItem.mutateAsync({
        owner_id: user.id,
        category: form.category,
        item_name: form.item_name,
        unit: form.unit,
        low_cents: Math.round(Number(form.low) * 100),
        high_cents: Math.round(Number(form.high) * 100),
        notes: form.notes || null,
      });
      toast.success("Price book item added");
      setForm({ category: "", item_name: "", unit: "flat", low: "", high: "", notes: "" });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Add item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add price book item</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
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
                <DialogFooter>
                  <Button type="submit" disabled={createItem.isPending}>
                    {createItem.isPending ? "Saving…" : "Add item"}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
