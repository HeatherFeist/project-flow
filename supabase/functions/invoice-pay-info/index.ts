// GET ?token=<pay_token>
// Public (no auth) — returns the invoice's public details for the /pay/:token
// page: line items, total, amount already paid, and business info.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

    const supabase = serviceClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(
        "id, status, total_cents, amount_paid_cents, due_date, items, created_at, owner_id, client:clients(name, email)",
      )
      .eq("pay_token", token)
      .single();

    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, phone, email, logo_url")
      .eq("id", invoice.owner_id)
      .maybeSingle();

    const { data: milestones } = await supabase
      .from("invoice_milestones")
      .select("id, title, amount_cents, sequence, status, paid_at")
      .eq("invoice_id", invoice.id)
      .order("sequence");

    const { owner_id: _owner_id, ...publicInvoice } = invoice;
    return new Response(
      JSON.stringify({ invoice: publicInvoice, business: profile ?? null, milestones: milestones ?? [] }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
