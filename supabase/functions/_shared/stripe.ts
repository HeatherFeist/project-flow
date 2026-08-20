// Shared helpers for Stripe's REST API from Supabase Edge Functions.
// Plain HTTP + Bearer auth — no SDK needed.
//
// Two entirely separate Stripe accounts are involved in this app, so two
// separate sets of credentials exist on purpose:
//   Per-owner (payment_settings.stripe_secret_key / stripe_webhook_secret,
//     with the platform STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET secrets
//     as a fallback for owners who haven't set their own yet) — each
//     business owner's own Stripe account, used only for their customers'
//     invoice payments (functions below, used by create-invoice-checkout
//     and stripe-webhook). BYOK on purpose (see docs/schema_v22) — a
//     platform-wide key would mean every subscriber's client payments
//     land in the same Stripe account.
//   PLATFORM_STRIPE_SECRET_KEY / PLATFORM_STRIPE_WEBHOOK_SECRET /
//     PLATFORM_STRIPE_PRICE_ID — Project Flow's own Stripe account, used
//     to bill business owners the monthly Project Flow subscription
//     itself (functions further below, used by
//     create-subscription-checkout / create-billing-portal-session /
//     platform-stripe-webhook). Never mix these two up.

export async function createCheckoutSession(params: {
  secretKey: string;
  amountCents: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const { secretKey } = params;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][product_data][name]", params.description);
  body.set("line_items[0][price_data][unit_amount]", String(params.amountCents));
  body.set("line_items[0][quantity]", "1");
  if (params.customerEmail) body.set("customer_email", params.customerEmail);
  for (const [key, value] of Object.entries(params.metadata)) {
    body.set(`metadata[${key}]`, value);
  }

  // Card + Cash App Pay, deliberately no ACH bank-transfer — ACH settles in
  // 3-5 business days no matter which processor moves it, which conflicts
  // with needing deposit funds the same day. Both of these use standard
  // (card-speed) payout timing, so both work with Stripe's Instant Payout
  // (to a linked debit card, from the Dashboard); see the README.
  body.set("payment_method_types[0]", "card");
  body.set("payment_method_types[1]", "cashapp");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Stripe checkout session creation failed: ${await res.text()}`);
  }

  return res.json();
}

/**
 * Verifies Stripe's `Stripe-Signature` header per Stripe's documented
 * scheme: HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed with the
 * webhook signing secret. `rawBody` must be the exact, unparsed request
 * body — re-serializing JSON can change the bytes and break verification.
 */
export async function verifyStripeSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
}): Promise<boolean> {
  const { rawBody, signatureHeader, webhookSecret } = params;
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}

// ---------------------------------------------------------------------
// Platform billing (Project Flow's own subscription) — separate Stripe
// account, see the file-header comment.
// ---------------------------------------------------------------------

function platformSecretKey(): string {
  const key = Deno.env.get("PLATFORM_STRIPE_SECRET_KEY");
  if (!key) throw new Error("PLATFORM_STRIPE_SECRET_KEY is not configured.");
  return key;
}

async function stripePost(path: string, body: URLSearchParams, secretKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Stripe request to ${path} failed: ${await res.text()}`);
  }
  return res.json();
}

/** Finds or creates the platform Stripe Customer for a given owner, returning its id. */
export async function getOrCreateStripeCustomer(params: {
  ownerId: string;
  email?: string;
}): Promise<string> {
  const secretKey = platformSecretKey();
  const body = new URLSearchParams();
  if (params.email) body.set("email", params.email);
  body.set(`metadata[owner_id]`, params.ownerId);
  const customer = await stripePost("customers", body, secretKey);
  return customer.id as string;
}

/** Creates a subscription-mode Checkout session for the $/mo platform plan. */
export async function createSubscriptionCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  ownerId: string;
  trialDays?: number;
}): Promise<{ id: string; url: string }> {
  const secretKey = platformSecretKey();
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", params.customerId);
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("line_items[0][price]", params.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set(`subscription_data[metadata][owner_id]`, params.ownerId);
  if (params.trialDays) {
    body.set("subscription_data[trial_period_days]", String(params.trialDays));
    // Card is still collected at signup (Checkout always requires a
    // payment method for a subscription), it's just not charged until the
    // trial ends — if the card fails once the trial's up, cancel instead
    // of leaving them in limbo.
    body.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
  }
  return stripePost("checkout/sessions", body, secretKey);
}

/** Creates a Billing Portal session so an owner can update payment method / cancel. */
export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const secretKey = platformSecretKey();
  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);
  return stripePost("billing_portal/sessions", body, secretKey);
}
