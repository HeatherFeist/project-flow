// POST { action: "start" | "refresh" }
// Auth: owner or admin of the business.
//
// start: creates a Stripe Express account (test mode only) if needed and
// returns a Stripe-hosted onboarding link. refresh: reads the account and
// saves whether charges and payouts are enabled.
//
// Payments are direct charges on the connected account, so the money lands
// in that business's Stripe balance. The platform key must be a test key
// (sk_test_...). Live keys are refused.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { resolveOwnerId } from "../_shared/team.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const secretKey = connectTestKey();
    if (!secretKey) {
      return new Response(
        JSON.stringify({
          error:
            "Stripe Connect needs a test secret key. Add STRIPE_CONNECT_SECRET_KEY (it starts with sk_test_) in the function secrets.",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const supabase = serviceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }
    const { ownerId, role } = await resolveOwnerId(supabase, userData.user.id);
    if (role === "field_tech") {
      return new Response(JSON.stringify({ error: "Only an owner or admin can connect Stripe." }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const { action } = await req.json();
    if (action !== "start" && action !== "refresh") {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jsonHeaders });
    }

    const { data: existing } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    let accountId = existing?.stripe_account_id as string | undefined;
    if (!accountId) {
      accountId = await createExpressAccount(secretKey);
      const { error } = await supabase.from("stripe_connect_accounts").insert({
        owner_id: ownerId,
        stripe_account_id: accountId,
      });
      if (error) throw error;
    }

    const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const account = await accountRes.json();
    if (!accountRes.ok) throw new Error(account.error?.message ?? "Could not read the Stripe account");

    const row = {
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("stripe_connect_accounts").update(row).eq("owner_id", ownerId);

    if (action === "refresh") {
      return new Response(JSON.stringify(row), { headers: jsonHeaders });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const linkBody = new URLSearchParams();
    linkBody.set("account", accountId);
    linkBody.set("refresh_url", `${siteUrl}/settings?connect=refresh`);
    linkBody.set("return_url", `${siteUrl}/settings?connect=return`);
    linkBody.set("type", "account_onboarding");
    const link = await stripeForm(secretKey, "/v1/account_links", linkBody);
    return new Response(JSON.stringify({ url: link.url, ...row }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

function connectTestKey(): string | null {
  const key = Deno.env.get("STRIPE_CONNECT_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
  return key.startsWith("sk_test_") ? key : null;
}

async function createExpressAccount(secretKey: string): Promise<string> {
  const body = new URLSearchParams();
  body.set("type", "express");
  body.set("country", "US");
  body.set("capabilities[card_payments][requested]", "true");
  body.set("capabilities[transfers][requested]", "true");
  body.set("capabilities[us_bank_account_ach_payments][requested]", "true");
  const account = await stripeForm(secretKey, "/v1/accounts", body);
  return account.id as string;
}

async function stripeForm(secretKey: string, path: string, body: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Stripe request failed");
  return json;
}
