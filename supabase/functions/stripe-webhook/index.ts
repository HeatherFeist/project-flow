// POST — Stripe webhook. Each owner adds this SAME URL as a webhook
// endpoint in their own Stripe Dashboard, subscribed to
// `checkout.session.completed`. Verifies Stripe's signature, records the
// payment, and updates the invoice's amount_paid_cents + status
// (draft/sent -> partially_paid/paid).
//
// Multi-tenant signature verification: since every owner's Stripe account
// sends events to this one URL, there's no single correct webhook secret
// to check against up front — the event has to be tried against every
// owner's stored secret (plus the platform fallback) until one matches.
// A forged event can't pass this check without actually knowing one of
// those secrets, so this is no less secure than a single-tenant setup.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";
import { getAllStripeWebhookSecrets } from "../_shared/paymentCredentials.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const supabase = serviceClient();
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("Stripe-Signature");

  const candidateSecrets = await getAllStripeWebhookSecrets(supabase);
  if (candidateSecrets.length === 0) {
    console.error("No Stripe webhook secrets configured (platform or per-owner).");
    return new Response("Webhook not configured", { status: 500 });
  }

  let valid = false;
  for (const webhookSecret of candidateSecrets) {
    if (await verifyStripeSignature({ rawBody, signatureHeader, webhookSecret })) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoice_id;
    const milestoneId = session.metadata?.milestone_id as string | undefined;
    const amountCents = session.amount_total as number;
    const paymentIntentId = session.payment_intent as string | null;

    if (invoiceId && typeof amountCents === "number") {

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
          milestone_id: milestoneId ?? null,
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

        if (milestoneId) {
          await supabase
            .from("invoice_milestones")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", milestoneId);
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
