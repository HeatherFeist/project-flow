import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateQuoteMilestone,
  useDeleteQuoteMilestone,
  useQuoteMilestones,
  useUpdateQuoteMilestone,
} from "@/hooks/useQuoteMilestones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const EMPTY_FORM = { title: "", amount: "", due_date: "" };

interface QuoteMilestonesCardProps {
  quoteId: string;
}

// The estimate's own planned payment schedule — a deposit, progress
// payments, a final payment — each with an expected due date, so the
// client and any subcontractors reviewing the estimate can see the whole
// timeline up front, before the client has even accepted. Carries over
// automatically to the invoice's real (payable) milestones on acceptance
// (see docs/schema_v32_sub_approval_and_milestones.sql).
export function QuoteMilestonesCard({ quoteId }: QuoteMilestonesCardProps) {
  const { user } = useAuth();
  const { data: milestones } = useQuoteMilestones(quoteId);
  const createMilestone = useCreateQuoteMilestone();
  const updateMilestone = useUpdateQuoteMilestone();
  const deleteMilestone = useDeleteQuoteMilestone();
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.title.trim() || !form.amount) return;
    try {
      await createMilestone.mutateAsync({
        owner_id: user.id,
        quote_id: quoteId,
        title: form.title.trim(),
        amount_cents: Math.round(Number(form.amount) * 100),
        sequence: (milestones?.length ?? 0) + 1,
        due_date: form.due_date || null,
      });
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add milestone");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Payment timeline</CardTitle>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add milestone
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        <p className="text-xs text-muted-foreground">
          Lay out the payment schedule now so the client (and any subs reviewing the estimate) can see
          when each payment is expected. This carries over to the invoice automatically once accepted.
        </p>

        {(milestones ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{m.title}</p>
              <p className="text-muted-foreground">{formatCurrency(m.amount_cents)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  className="h-8 w-36"
                  value={m.due_date ?? ""}
                  onChange={(e) =>
                    updateMilestone.mutate({ id: m.id, quote_id: quoteId, due_date: e.target.value || null })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMilestone.mutate({ id: m.id, quoteId })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}

        {(milestones ?? []).length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No payment timeline set yet — the client will just see the total due on acceptance.
          </p>
        )}

        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Milestone</Label>
                <Input
                  placeholder="e.g. Deposit"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date (optional)</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={createMilestone.isPending}>
                {createMilestone.isPending ? "Saving…" : "Add milestone"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
