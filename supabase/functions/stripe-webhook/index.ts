// POST — Stripe webhook. Configure this URL as a webhook endpoint in the
// Stripe Dashboard, subscribed to `checkout.session.completed`.
// Verifies Stripe's signature, records the payment, and updates the
// invoice's amount_paid_cents + status (draft/sent -> partially_paid/paid).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const valid = await verifyStripeSignature({
    rawBody,
    signatureHeader: req.headers.get("Stripe-Signature"),
    webhookSecret,
  });
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoice_id;
    const amountCents = session.amount_total as number;
    const paymentIntentId = session.payment_intent as string | null;

    if (invoiceId && typeof amountCents === "number") {
      const supabase = serviceClient();

      const { data: invoice, error } = await supabase
        .from("invoices")
        .select("id, total_cents, amount_paid_cents, status")
        .eq("id", invoiceId)
        .single();

      const { data: existingPayment } = await supabase
        .from("invoice_payments")
        .select("id")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();

      if (!error && invoice && !existingPayment) {
        await supabase.from("invoice_payments").insert({
          invoice_id: invoiceId,
          amount_cents: amountCents,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          status: "succeeded",
        });

        const newAmountPaid = invoice.amount_paid_cents + amountCents;
        const newStatus =
          newAmountPaid >= invoice.total_cents
            ? "paid"
            : newAmountPaid > 0
              ? "partially_paid"
              : invoice.status;

        await supabase
          .from("invoices")
          .update({ amount_paid_cents: newAmountPaid, status: newStatus })
          .eq("id", invoiceId);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
