import { useState } from "react";
import { toast } from "sonner";
import { Calculator, HandCoins, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useCreateSubcontractor, useDeleteSubcontractor, useSubcontractors } from "@/hooks/useSubcontractors";
import { calculatePayGuideline, usePayGuidelines } from "@/hooks/usePayGuidelines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const EMPTY_FORM = { name: "", scope_of_work: "", pay: "", paypal_handle: "", cashapp_handle: "" };

interface SubcontractorsCardProps {
  quoteId: string;
  /** Quote detail: full editor. Invoice detail: read-only reference (no add/remove), since the estimate is locked in once accepted. */
  mode: "edit" | "reference";
}

// Client never sees pay amounts or payment handles — only name +
// scope_of_work, on the separate public quote/invoice pages. This card
// is the GC-only view: full editing while quoting, then a read-only
// reference on the invoice for paying subs after a milestone lands (see
// docs/schema_v30_subcontractors.sql).
export function SubcontractorsCard({ quoteId, mode }: SubcontractorsCardProps) {
  const { user } = useAuth();
  const { ownerId } = useTeam();
  const { data: guidelines } = usePayGuidelines(ownerId);
  const { data: subs } = useSubcontractors(quoteId);
  const createSub = useCreateSubcontractor();
  const deleteSub = useDeleteSubcontractor();
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [materialCost, setMaterialCost] = useState("");

  const guideline =
    guidelines && materialCost ? calculatePayGuideline(guidelines, Math.round(Number(materialCost) * 100)) : null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim() || !form.scope_of_work.trim()) return;
    try {
      await createSub.mutateAsync({
        owner_id: user.id,
        quote_id: quoteId,
        name: form.name.trim(),
        scope_of_work: form.scope_of_work.trim(),
        pay_cents: form.pay ? Math.round(Number(form.pay) * 100) : null,
        paypal_handle: form.paypal_handle.trim() || null,
        cashapp_handle: form.cashapp_handle.trim() || null,
      });
      setForm(EMPTY_FORM);
      setMaterialCost("");
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subcontractor");
    }
  }

  if (mode === "reference" && (subs ?? []).length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Subcontractors</CardTitle>
        {mode === "edit" && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        {mode === "reference" && (
          <p className="text-xs text-muted-foreground">
            The client only ever pays you — this is your own reference for paying each sub after a
            milestone lands.
          </p>
        )}

        {(subs ?? []).map((sub) => (
          <div key={sub.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{sub.name}</p>
              <p className="text-muted-foreground">{sub.scope_of_work}</p>
              {mode === "reference" && (
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                  {sub.pay_cents !== null && (
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <HandCoins className="size-3.5" /> {formatCurrency(sub.pay_cents)}
                    </span>
                  )}
                  {sub.paypal_handle && <span>PayPal: {sub.paypal_handle}</span>}
                  {sub.cashapp_handle && <span>Cash App: {sub.cashapp_handle}</span>}
                </div>
              )}
            </div>
            {mode === "edit" && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => deleteSub.mutate({ id: sub.id, quoteId })}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}

        {mode === "edit" && (subs ?? []).length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No subcontractors on this job. Add one if someone else is doing part of the work — their name
            and scope show on the client's quote; their pay and PayPal/Cash App stay private to you.
          </p>
        )}

        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pay ($, optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.pay}
                  onChange={(e) => setForm({ ...form, pay: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scope of work</Label>
              <Input
                placeholder="e.g. Electrical rough-in and fixture install"
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Shown to the client, along with their name.</p>
            </div>

            <div className="space-y-1.5 rounded-md border bg-background p-2.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Calculator className="size-3.5" /> Suggested pay (optional reference)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Material cost for this scope ($)"
                  value={materialCost}
                  onChange={(e) => setMaterialCost(e.target.value)}
                  className="h-8"
                />
              </div>
              {guideline && (
                <div className="space-y-1 pt-1 text-xs text-muted-foreground">
                  <p>
                    Suggested total: <span className="font-medium text-foreground">{formatCurrency(guideline.totalCents)}</span>{" "}
                    (materials {formatCurrency(guideline.materialsCents)}, overhead {formatCurrency(guideline.overheadCents)},
                    your share {formatCurrency(guideline.gcCents)})
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p>
                      Suggested sub pay: <span className="font-medium text-foreground">{formatCurrency(guideline.subCents)}</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setForm({ ...form, pay: (guideline.subCents / 100).toString() })}
                    >
                      Use this amount
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Based on your Settings → Subcontractor Pay Guidelines — just a reference, never required.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">PayPal (optional)</Label>
                <Input
                  placeholder="email or paypal.me link"
                  value={form.paypal_handle}
                  onChange={(e) => setForm({ ...form, paypal_handle: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cash App (optional)</Label>
                <Input
                  placeholder="$cashtag"
                  value={form.cashapp_handle}
                  onChange={(e) => setForm({ ...form, cashapp_handle: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={createSub.isPending}>
                {createSub.isPending ? "Saving…" : "Add subcontractor"}
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
