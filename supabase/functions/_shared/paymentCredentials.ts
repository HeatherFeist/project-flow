// Resolves per-owner Stripe/PayPal credentials (docs/schema_v22), falling
// back to the platform-wide secrets so an owner who hasn't set their own
// yet (e.g. Nick's existing account) keeps working unchanged.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface PaymentSettingsRow {
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  paypal_client_id: string | null;
  paypal_client_secret: string | null;
  paypal_mode: string | null;
}

async function getPaymentSettings(supabase: SupabaseClient, ownerId: string): Promise<PaymentSettingsRow | null> {
  const { data } = await supabase
    .from("payment_settings")
    .select("stripe_secret_key, stripe_webhook_secret, paypal_client_id, paypal_client_secret, paypal_mode")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return data ?? null;
}

export async function getStripeSecretKey(supabase: SupabaseClient, ownerId: string): Promise<string | null> {
  const settings = await getPaymentSettings(supabase, ownerId);
  return settings?.stripe_secret_key || Deno.env.get("STRIPE_SECRET_KEY") || null;
}

/** All owners' possible webhook signing secrets (their own, if set, plus the platform fallback) — a Stripe webhook event has to be checked against whichever one actually signed it. */
export async function getAllStripeWebhookSecrets(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("payment_settings")
    .select("stripe_webhook_secret")
    .not("stripe_webhook_secret", "is", null);
  const secrets = (data ?? []).map((r: { stripe_webhook_secret: string }) => r.stripe_webhook_secret);
  const platformSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (platformSecret) secrets.push(platformSecret);
  return secrets;
}

export async function getPaypalCredentials(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<{ clientId: string; clientSecret: string; mode: string } | null> {
  const settings = await getPaymentSettings(supabase, ownerId);
  const clientId = settings?.paypal_client_id || Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = settings?.paypal_client_secret || Deno.env.get("PAYPAL_CLIENT_SECRET");
  const mode = settings?.paypal_client_id ? settings?.paypal_mode ?? "sandbox" : Deno.env.get("PAYPAL_MODE") ?? "sandbox";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, mode: mode ?? "sandbox" };
}
