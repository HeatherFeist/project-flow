// Shared helpers for PayPal's REST API (Orders v2) from Supabase Edge
// Functions. Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Set
// PAYPAL_MODE=live to hit PayPal's live API; anything else (or unset)
// uses the sandbox for testing.

function apiBase(): string {
  return Deno.env.get("PAYPAL_MODE") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured.");
  }

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${await res.text()}`);
  }

  const json = await res.json();
  return json.access_token;
}

/** Creates a PayPal order (intent=CAPTURE); returns the id and the approval link to redirect the payer to. */
export async function createPaypalOrder(params: {
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
  invoiceId: string;
}): Promise<{ id: string; approveUrl: string }> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: params.invoiceId,
          amount: {
            currency_code: "USD",
            value: (params.amountCents / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        user_action: "PAY_NOW",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PayPal order creation failed: ${await res.text()}`);
  }

  const json = await res.json();
  const approveUrl = json.links?.find((l: { rel: string; href: string }) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("PayPal did not return an approval link.");

  return { id: json.id, approveUrl };
}

/** Captures a previously-approved order; returns the captured amount in cents. */
export async function capturePaypalOrder(orderId: string): Promise<{ amountCents: number; status: string }> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`PayPal capture failed: ${await res.text()}`);
  }

  const json = await res.json();
  const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error("PayPal capture response missing capture details.");

  return {
    amountCents: Math.round(Number(capture.amount.value) * 100),
    status: capture.status,
  };
}
