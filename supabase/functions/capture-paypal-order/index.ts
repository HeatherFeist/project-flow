// POST { token: string, paypalOrderId: string, milestoneId?: string }
// Public (no auth), token-scoped. Called by the /pay/:token page right
// after PayPal redirects the payer back. Captures the approved order,
// records the payment, and updates the invoice's amount_paid_cents/status
// — same effect as the Stripe webhook, just triggered by the redirect
// return instead of an async webhook (PayPal webhooks are a nice-to-have
// for extra robustness, not required for this flow to work).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { capturePaypalOrder } from "../_shared/paypal.ts";
import { getPaypalCredentials } from "../_shared/paymentCredentials.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { token, paypalOrderId, milestoneId } = await req.json();
    if (!token || !paypalOrderId) {
      return new Response(JSON.stringify({ error: "Missing token or paypalOrderId" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const supabase = serviceClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, owner_id, total_cents, amount_paid_cents, status")
      .eq("pay_token", token)
      .single();

    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }

    const creds = await getPaypalCredentials(supabase, invoice.owner_id);
    if (!creds) {
      return new Response(
        JSON.stringify({ error: "This business hasn't connected PayPal yet." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Idempotent: if this order was already captured (e.g. the page reloaded), don't double-count it.
    const { data: existingPayment } = await supabase
      .from("invoice_payments")
      .select("id")
      .eq("paypal_order_id", paypalOrderId)
      .maybeSingle();

    if (existingPayment) {
      return new Response(JSON.stringify({ ok: true, alreadyRecorded: true }), { headers: jsonHeaders });
    }

    const capture = await capturePaypalOrder(creds, paypalOrderId);
    if (capture.status !== "COMPLETED") {
      return new Response(JSON.stringify({ error: `Payment not completed (status: ${capture.status})` }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      amount_cents: capture.amountCents,
      provider: "paypal",
      paypal_order_id: paypalOrderId,
      status: "succeeded",
      milestone_id: milestoneId ?? null,
    });

    const newAmountPaid = invoice.amount_paid_cents + capture.amountCents;
    const newStatus =
      newAmountPaid >= invoice.total_cents ? "paid" : newAmountPaid > 0 ? "partially_paid" : invoice.status;

    await supabase.from("invoices").update({ amount_paid_cents: newAmountPaid, status: newStatus }).eq("id", invoice.id);

    if (milestoneId) {
      await supabase
        .from("invoice_milestones")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", milestoneId);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
