// Shared helpers for invoice payment milestones (docs/schema_v14_invoice_milestones.sql).
// A milestone-bearing invoice pays out in a fixed order — a client can't
// jump ahead to a later milestone while an earlier one is still pending.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface Milestone {
  id: string;
  invoice_id: string;
  amount_cents: number;
  sequence: number;
  status: string;
}

/**
 * Validates that `milestoneId` is real, belongs to `invoiceId`, is still
 * pending, is next in sequence (no earlier pending milestone), and that
 * `amountCents` matches it exactly — milestones aren't partial-payable.
 * Throws a user-facing Error on any failure.
 */
export async function validateNextMilestone(
  supabase: SupabaseClient,
  invoiceId: string,
  milestoneId: string,
  amountCents: number,
): Promise<Milestone> {
  const { data: milestones, error } = await supabase
    .from("invoice_milestones")
    .select("id, invoice_id, amount_cents, sequence, status")
    .eq("invoice_id", invoiceId)
    .order("sequence");

  if (error || !milestones || milestones.length === 0) {
    throw new Error("This invoice doesn't have payment milestones.");
  }

  const target = milestones.find((m: Milestone) => m.id === milestoneId);
  if (!target) throw new Error("Milestone not found on this invoice.");
  if (target.status === "paid") throw new Error("This milestone has already been paid.");

  const earlierPending = milestones.find(
    (m: Milestone) => m.sequence < target.sequence && m.status !== "paid",
  );
  if (earlierPending) throw new Error("Pay the earlier milestone first.");

  if (amountCents !== target.amount_cents) {
    throw new Error("The amount doesn't match this milestone.");
  }

  return target;
}
