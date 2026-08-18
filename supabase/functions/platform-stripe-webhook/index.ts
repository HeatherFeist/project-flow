// POST — Stripe webhook for Project Flow's OWN Stripe account (the
// platform subscription, not any business owner's own Stripe account).
// Configure this URL as a webhook endpoint in that Stripe Dashboard,
// subscribed to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.
//
// Keeps the `subscriptions` table in sync so the app can gate access on
// `status in ('active','trialing')` without calling Stripe on every page load.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const webhookSecret = Deno.env.get("PLATFORM_STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("PLATFORM_STRIPE_WEBHOOK_SECRET is not configured.");
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
  const supabase = serviceClient();

  async function upsertFromSubscription(sub: Record<string, unknown>) {
    const ownerId = (sub.metadata as Record<string, string> | undefined)?.owner_id;
    const customerId = sub.customer as string;
    if (!ownerId) {
      // Fallback: metadata can be missing on subscription.updated events in
      // some flows — look the owner up by the Stripe customer id instead.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("owner_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (!existing) return;
      await supabase
        .from("subscriptions")
        .update({
          stripe_subscription_id: sub.id as string,
          status: sub.status as string,
          current_period_end: sub.current_period_end
            ? new Date((sub.current_period_end as number) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", existing.owner_id);
      return;
    }

    await supabase.from("subscriptions").upsert({
      owner_id: ownerId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id as string,
      status: sub.status as string,
      current_period_end: sub.current_period_end
        ? new Date((sub.current_period_end as number) * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode === "subscription" && session.subscription) {
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
        headers: { Authorization: `Bearer ${Deno.env.get("PLATFORM_STRIPE_SECRET_KEY")}` },
      });
      if (subRes.ok) {
        await upsertFromSubscription(await subRes.json());
      }
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await upsertFromSubscription(event.data.object);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
