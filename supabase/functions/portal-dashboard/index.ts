// POST { sessionToken: string }
// Public (no auth), session-scoped. Returns everything the client portal
// dashboard shows: the client's jobs (with a link to their photo
// gallery), quotes (with their existing accept_token so Accept/Decline
// reuses the already-working quote-response flow), invoices (with their
// existing pay_token + milestones so payment reuses create-invoice-
// checkout/create-paypal-order as-is), and the business's profile.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { sessionToken } = await req.json();
    const supabase = serviceClient();

    let clientId: string, ownerId: string;
    try {
      ({ clientId, ownerId } = await validatePortalSession(supabase, sessionToken));
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Not signed in" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const [{ data: client }, { data: profile }, { data: jobs }, { data: quotes }, { data: invoices }] =
      await Promise.all([
        supabase.from("clients").select("id, name, email").eq("id", clientId).single(),
        supabase.from("profiles").select("business_name, phone, email").eq("id", ownerId).maybeSingle(),
        supabase
          .from("jobs")
          .select("id, title, status, scheduled_at, address, photo_share_token")
          .eq("client_id", clientId)
          .order("scheduled_at", { ascending: false, nullsFirst: true }),
        supabase
          .from("quotes")
          .select("id, status, total_cents, notes, items, accept_token, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("id, status, total_cents, amount_paid_cents, due_date, pay_token, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ]);

    const invoiceIds = (invoices ?? []).map((i: { id: string }) => i.id);
    const { data: milestones } = invoiceIds.length
      ? await supabase
          .from("invoice_milestones")
          .select("id, invoice_id, title, amount_cents, sequence, status, paid_at")
          .in("invoice_id", invoiceIds)
          .order("sequence")
      : { data: [] };

    const invoicesWithMilestones = (invoices ?? []).map((inv: { id: string }) => ({
      ...inv,
      milestones: (milestones ?? []).filter((m: { invoice_id: string }) => m.invoice_id === inv.id),
    }));

    return new Response(
      JSON.stringify({
        client,
        business: profile ?? null,
        jobs: jobs ?? [],
        quotes: quotes ?? [],
        invoices: invoicesWithMilestones,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
