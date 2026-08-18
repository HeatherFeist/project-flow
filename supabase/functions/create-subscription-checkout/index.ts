// POST {} — Auth required (the signed-in business owner).
// Creates (or reuses) a platform Stripe Customer for this owner and starts
// a subscription-mode Checkout session for the Project Flow monthly plan.
// Returns the hosted checkout URL to redirect the browser to.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { createSubscriptionCheckoutSession, getOrCreateStripeCustomer } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }
    const ownerId = userData.user.id;
    const email = userData.user.email;

    const priceId = Deno.env.get("PLATFORM_STRIPE_PRICE_ID");
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Billing isn't configured yet." }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    const customerId = existing?.stripe_customer_id || (await getOrCreateStripeCustomer({ ownerId, email }));

    if (!existing?.stripe_customer_id) {
      await supabase.from("subscriptions").upsert({ owner_id: ownerId, stripe_customer_id: customerId });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const session = await createSubscriptionCheckoutSession({
      customerId,
      priceId,
      successUrl: `${siteUrl}/subscribe?success=1`,
      cancelUrl: `${siteUrl}/subscribe`,
      ownerId,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
