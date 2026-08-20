// Shared helpers for PayPal's REST API (Orders v2) from Supabase Edge
// Functions. Credentials are per-owner (payment_settings.paypal_client_id
// / paypal_client_secret / paypal_mode, with the platform PAYPAL_CLIENT_ID
// / PAYPAL_CLIENT_SECRET / PAYPAL_MODE secrets as a fallback for owners
// who haven't set their own yet) — BYOK on purpose (see docs/schema_v22):
// a platform-wide key would mean every subscriber's client payments land
// in the same PayPal account.

export interface PaypalCredentials {
  clientId: string;
  clientSecret: string;
  mode: string; // 'live' | anything else (sandbox)
}

function apiBase(mode: string): string {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(creds: PaypalCredentials): Promise<string> {
  const res = await fetch(`${apiBase(creds.mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
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
export async function createPaypalOrder(
  creds: PaypalCredentials,
  params: {
    amountCents: number;
    returnUrl: string;
    cancelUrl: string;
    invoiceId: string;
  },
): Promise<{ id: string; approveUrl: string }> {
  const accessToken = await getAccessToken(creds);

  const res = await fetch(`${apiBase(creds.mode)}/v2/checkout/orders`, {
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
export async function capturePaypalOrder(
  creds: PaypalCredentials,
  orderId: string,
): Promise<{ amountCents: number; status: string }> {
  const accessToken = await getAccessToken(creds);

  const res = await fetch(`${apiBase(creds.mode)}/v2/checkout/orders/${orderId}/capture`, {
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
