import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTeam } from "@/contexts/TeamContext";
import { usePayGuidelines, useSavePayGuidelines } from "@/hooks/usePayGuidelines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// A reference calculator for what to pay a sub, not a rule the app
// enforces — see docs/schema_v31_pay_guidelines.sql. The actual "use
// this" calculator lives on the subcontractor add form
// (SubcontractorsCard); this card is just where the owner sets their
// own default split.
export function PayGuidelinesCard() {
  const { ownerId } = useTeam();
  const { data: guidelines } = usePayGuidelines(ownerId);
  const saveGuidelines = useSavePayGuidelines();
  const [form, setForm] = useState({ multiplier: "4", materialsPct: "25", overheadPct: "25", gcSharePct: "50" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!guidelines) return;
    setForm({
      multiplier: guidelines.materials_multiplier.toString(),
      materialsPct: guidelines.materials_pct.toString(),
      overheadPct: guidelines.overhead_pct.toString(),
      gcSharePct: guidelines.gc_labor_share_pct.toString(),
    });
  }, [guidelines]);

  const laborPoolPct = 100 - Number(form.materialsPct || 0) - Number(form.overheadPct || 0);
  const subSharePct = 100 - Number(form.gcSharePct || 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId) return;
    setSaving(true);
    try {
      await saveGuidelines.mutateAsync({
        owner_id: ownerId,
        materials_multiplier: Number(form.multiplier) || 1,
        materials_pct: Number(form.materialsPct) || 0,
        overhead_pct: Number(form.overheadPct) || 0,
        gc_labor_share_pct: Number(form.gcSharePct) || 0,
      });
      toast.success("Pay guidelines saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subcontractor Pay Guidelines</CardTitle>
        <CardDescription>
          A reference calculator for what to pay a sub for a given scope of work — shown as a suggestion
          when adding a subcontractor to a quote. Never required or enforced; you can always type in
          whatever amount you actually agree on.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="multiplier">Materials multiplier</Label>
              <Input
                id="multiplier"
                type="number"
                min="1"
                step="0.1"
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Suggested total project value = material cost × this. (e.g. $100 material × 4 = $400 total)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="materials_pct">Materials share (%)</Label>
              <Input
                id="materials_pct"
                type="number"
                min="0"
                max="100"
                value={form.materialsPct}
                onChange={(e) => setForm({ ...form, materialsPct: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="overhead_pct">Business overhead share (%)</Label>
              <Input
                id="overhead_pct"
                type="number"
                min="0"
                max="100"
                value={form.overheadPct}
                onChange={(e) => setForm({ ...form, overheadPct: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc_share_pct">Your share of the remaining labor (%)</Label>
              <Input
                id="gc_share_pct"
                type="number"
                min="0"
                max="100"
                value={form.gcSharePct}
                onChange={(e) => setForm({ ...form, gcSharePct: e.target.value })}
              />
            </div>
          </div>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            With these numbers: materials {form.materialsPct || 0}% + overhead {form.overheadPct || 0}% leaves{" "}
            {laborPoolPct}% as the labor pool — split {form.gcSharePct || 0}% to you / {subSharePct}% to the sub.
          </p>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
