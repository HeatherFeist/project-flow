// POST {} — Auth required. Opens Stripe's hosted Billing Portal so the
// owner can update their payment method, see invoices, or cancel.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { createBillingPortalSession } from "../_shared/stripe.ts";

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

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No billing account found yet — subscribe first." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const session = await createBillingPortalSession({
      customerId: sub.stripe_customer_id,
      returnUrl: `${siteUrl}/settings`,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
