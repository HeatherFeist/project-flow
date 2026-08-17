// POST { token: string, amountCents: number }
// Public (no auth), token-scoped. Creates a PayPal order for the given
// amount (full balance or a partial/deposit payment) against the invoice
// matching the token, and returns the PayPal approval URL to redirect to.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { createPaypalOrder } from "../_shared/paypal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { token, amountCents } = await req.json();
    if (!token || !Number.isInteger(amountCents) || amountCents <= 0) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = serviceClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, total_cents, amount_paid_cents")
      .eq("pay_token", token)
      .single();

    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }

    const remainingCents = invoice.total_cents - invoice.amount_paid_cents;
    if (remainingCents <= 0) {
      return new Response(JSON.stringify({ error: "This invoice is already paid in full." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    if (amountCents > remainingCents) {
      return new Response(JSON.stringify({ error: "That's more than the remaining balance." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const order = await createPaypalOrder({
      amountCents,
      invoiceId: invoice.id,
      returnUrl: `${siteUrl}/pay/${token}?provider=paypal`,
      cancelUrl: `${siteUrl}/pay/${token}`,
    });

    return new Response(JSON.stringify({ approveUrl: order.approveUrl }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
