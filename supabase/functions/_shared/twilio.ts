// Shared helpers for Twilio's REST API (SMS) and TwiML (voice webhook
// responses) from Supabase Edge Functions. No SDK needed — Twilio's REST
// API is plain HTTP with HTTP Basic Auth.

export async function sendSms(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const { accountSid, authToken, from, to, body } = params;
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    },
  );

  if (!res.ok) {
    throw new Error(`Twilio SMS send failed: ${await res.text()}`);
  }

  return res.json();
}

/** Wraps XML as a TwiML response with the content type Twilio expects. */
export function twimlResponse(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

/** Parses Twilio's application/x-www-form-urlencoded webhook payload. */
export async function parseTwilioWebhook(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = String(value);
  }
  return params;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export { xmlEscape };

/**
 * Verifies the `X-Twilio-Signature` header so these public webhooks can't
 * be spoofed by a third party sending fake "missed call" or "inbound text"
 * requests. `url` must be the exact webhook URL configured in the Twilio
 * console (including query string, if any).
 */
export async function verifyTwilioSignature(params: {
  authToken: string;
  url: string;
  formParams: Record<string, string>;
  signature: string | null;
}): Promise<boolean> {
  const { authToken, url, formParams, signature } = params;
  if (!signature) return false;

  const sortedKeys = Object.keys(formParams).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + formParams[key];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  return computed === signature;
}
