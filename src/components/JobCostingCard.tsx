import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useCreateExpense, useDeleteExpense, useJobExpenses, useJobRevenue } from "@/hooks/useExpenses";
import { useMaterials } from "@/hooks/useMaterials";
import type { ExpenseCategory } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "fuel", label: "Fuel" },
  { value: "tools_equipment", label: "Tools/equipment" },
  { value: "permits_fees", label: "Permits/fees" },
  { value: "vehicle", label: "Vehicle" },
  { value: "other", label: "Other" },
];

interface JobCostingCardProps {
  jobId: string;
  ownerId: string;
  quoteId: string | null;
}

const EMPTY_FORM = { category: "material" as ExpenseCategory, materialId: "", description: "", quantity: "1", amount: "" };

export function JobCostingCard({ jobId, ownerId, quoteId }: JobCostingCardProps) {
  const { data: costs } = useJobExpenses(jobId);
  const { data: revenue } = useJobRevenue(jobId, quoteId);
  const { data: materials } = useMaterials(ownerId);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const [form, setForm] = useState(EMPTY_FORM);

  const totalCostCents = (costs ?? []).reduce((sum, c) => sum + c.amount_cents, 0);
  const revenueCents = revenue?.amountCents ?? 0;
  const profitCents = revenueCents - totalCostCents;
  const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : null;

  function handleMaterialPick(materialId: string) {
    const material = (materials ?? []).find((m) => m.id === materialId);
    if (!material) {
      setForm({ ...form, materialId });
      return;
    }
    const qty = Number(form.quantity) || 1;
    setForm({
      ...form,
      materialId,
      description: material.name,
      amount: ((material.cost_cents * qty) / 100).toString(),
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!form.description.trim() || !amountCents) return;
    try {
      await createExpense.mutateAsync({
        owner_id: ownerId,
        job_id: jobId,
        material_id: form.category === "material" && form.materialId ? form.materialId : null,
        category: form.category,
        description: form.description.trim(),
        quantity: Number(form.quantity) || 1,
        amount_cents: amountCents,
        expense_date: new Date().toISOString().slice(0, 10),
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add cost");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Job Costing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_5rem_6rem_auto]">
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory, materialId: "" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {form.category === "material" && (materials ?? []).length > 0 ? (
            <Select value={form.materialId} onValueChange={handleMaterialPick}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a material (or type below)" />
              </SelectTrigger>
              <SelectContent>
                {(materials ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} — {formatCurrency(m.cost_cents)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description"
            />
          )}

          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="Qty"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="$ total"
          />
          <Button type="submit" size="icon" disabled={createExpense.isPending}>
            <Plus />
          </Button>
        </form>
        {form.category === "material" && form.materialId && (
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (editable)"
            className="text-xs"
          />
        )}

        {(costs ?? []).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(costs ?? []).map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell>{cost.description}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {cost.category.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(cost.amount_cents)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => deleteExpense.mutate({ id: cost.id, ownerId, jobId })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="font-medium">{formatCurrency(totalCostCents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Revenue{revenue?.source === "quote" ? " (from quote)" : ""}
            </p>
            <p className="font-medium">{formatCurrency(revenueCents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit</p>
            <p className={`font-medium ${profitCents < 0 ? "text-destructive" : "text-success"}`}>
              {formatCurrency(profitCents)}
              {marginPct !== null && ` (${marginPct.toFixed(0)}%)`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
