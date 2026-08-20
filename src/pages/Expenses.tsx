import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateExpense, useDeleteExpense, useExpenses } from "@/hooks/useExpenses";
import { useJobs } from "@/hooks/useJobs";
import { useMaterials } from "@/hooks/useMaterials";
import type { ExpenseCategory } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatCurrency, formatDate } from "@/lib/utils";

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "fuel", label: "Fuel" },
  { value: "tools_equipment", label: "Tools/equipment" },
  { value: "permits_fees", label: "Permits/fees" },
  { value: "vehicle", label: "Vehicle" },
  { value: "insurance", label: "Insurance" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  jobId: "none",
  materialId: "",
  category: "other" as ExpenseCategory,
  description: "",
  quantity: "1",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
};

export default function Expenses() {
  const { user } = useAuth();
  const { data: expenses, isLoading } = useExpenses(user?.id);
  const { data: jobs } = useJobs();
  const { data: materials } = useMaterials(user?.id);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");

  const filtered = useMemo(
    () => (expenses ?? []).filter((e) => categoryFilter === "all" || e.category === categoryFilter),
    [expenses, categoryFilter],
  );
  const totalCents = filtered.reduce((sum, e) => sum + e.amount_cents, 0);

  function handleMaterialPick(materialId: string) {
    const material = (materials ?? []).find((m) => m.id === materialId);
    if (!material) {
      setForm({ ...form, materialId });
      return;
    }
    const qty = Number(form.quantity) || 1;
    setForm({ ...form, materialId, description: material.name, amount: ((material.cost_cents * qty) / 100).toString() });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!form.description.trim() || !amountCents) return;
    try {
      await createExpense.mutateAsync({
        owner_id: user.id,
        job_id: form.jobId === "none" ? null : form.jobId,
        material_id: form.category === "material" && form.materialId ? form.materialId : null,
        category: form.category,
        description: form.description.trim(),
        quantity: Number(form.quantity) || 1,
        amount_cents: amountCents,
        expense_date: form.date,
      });
      toast.success("Expense added");
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add expense");
    }
  }

  async function handleDelete(id: string, jobId: string | null) {
    if (!user) return;
    try {
      await deleteExpense.mutateAsync({ id, ownerId: user.id, jobId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete expense");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-muted-foreground">
            Every business cost — job-specific or general overhead. Job-tied expenses also show up on that
            job's Job Costing card.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Add expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add expense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Job (optional)</Label>
                <Select value={form.jobId} onValueChange={(v) => setForm({ ...form, jobId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General / overhead — no job</SelectItem>
                    {(jobs ?? []).map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title} — {j.client?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
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
              </div>
              {form.category === "material" && (materials ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <Label>From your Materials catalog (optional)</Label>
                  <Select value={form.materialId} onValueChange={handleMaterialPick}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a material, or just type a description below" />
                    </SelectTrigger>
                    <SelectContent>
                      {(materials ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} — {formatCurrency(m.cost_cents)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createExpense.isPending}>
                  {createExpense.isPending ? "Saving…" : "Add expense"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ExpenseCategory | "all")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">{formatCurrency(totalCents)}</span>
        </p>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No expenses yet.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{formatDate(expense.expense_date)}</TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {expense.category.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    {expense.job ? (
                      <Link to={`/schedule/${expense.job.id}`} className="hover:underline">
                        {expense.job.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">General</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(expense.amount_cents)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(expense.id, expense.job_id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
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
