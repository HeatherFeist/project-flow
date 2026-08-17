// Shared helpers for Stripe's REST API from Supabase Edge Functions.
// Plain HTTP + Bearer auth — no SDK needed. Requires STRIPE_SECRET_KEY and
// (for webhook verification) STRIPE_WEBHOOK_SECRET.

export async function createCheckoutSession(params: {
  amountCents: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");

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

  // Offer bank-transfer (ACH direct debit) alongside card — lower fees than
  // card (~0.8%, capped around $5, vs ~2.9%+30¢), settles in a few business
  // days. Stripe handles the bank-linking itself (Plaid-equivalent instant
  // verification); the client just picks "US bank account" at checkout.
  body.set("payment_method_types[0]", "card");
  body.set("payment_method_types[1]", "us_bank_account");
  body.set("payment_method_options[us_bank_account][verification_method]", "instant");

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
