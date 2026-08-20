// Twilio Voice webhook. Configure this as the "A call comes in" webhook
// (POST) on your Twilio number, and as its own <Dial> action callback (see
// below — Twilio re-POSTs to the same URL after the dial attempt ends).
//
// Flow: incoming call → ring the owner's real phone for 20s → if answered,
// done. If not answered/busy/failed, text the caller a "sorry we missed
// you" message and log them as a lead in Clients (and log the missed call
// + auto-text into the structured client_messages timeline either way —
// new lead or existing client).
//
// Credentials are per-owner (twilio_settings.twilio_account_sid /
// twilio_auth_token, falling back to the platform TWILIO_ACCOUNT_SID /
// TWILIO_AUTH_TOKEN secrets for an owner who hasn't set their own yet —
// see docs/schema_v22). Signature verification needs the owner's own
// auth token, so the settings lookup (by the `To` number, which any
// caller can identify) has to happen BEFORE verifying — that's fine,
// looking up which owner a number belongs to isn't itself a secret.

import { serviceClient } from "../_shared/google.ts";
import { parseTwilioWebhook, sendSms, twimlResponse, verifyTwilioSignature, xmlEscape } from "../_shared/twilio.ts";
import { logClientMessage } from "../_shared/clientMessages.ts";

Deno.serve(async (req) => {
  const params = await parseTwilioWebhook(req);
  const signature = req.headers.get("X-Twilio-Signature");
  const supabase = serviceClient();
  const to = params.To; // the Twilio number that was called
  const from = params.From; // the caller

  const { data: settings } = await supabase
    .from("twilio_settings")
    .select("*")
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!settings) {
    return twimlResponse(
      `<Response><Say>This number is not currently in service.</Say></Response>`,
    );
  }

  const accountSid = settings.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const authToken = settings.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN")!;

  const valid = await verifyTwilioSignature({
    authToken,
    url: req.url,
    formParams: params,
    signature,
  });
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  // Second stage: Twilio POSTs back here with DialCallStatus once the
  // <Dial> attempt below finishes.
  if (params.DialCallStatus) {
    if (params.DialCallStatus !== "completed" && params.DialCallStatus !== "answered") {
      const siteUrl = Deno.env.get("SITE_URL") ?? "";
      const chatLink = `${siteUrl}/estimate/${settings.user_id}`;
      const textBody = `${settings.missed_call_message}\n\nGet a rough estimate & schedule a visit here: ${chatLink}`;

      try {
        await sendSms({ accountSid, authToken, from: to, to: from, body: textBody });
      } catch (err) {
        console.error("Failed to send missed-call text:", err);
      }

      // Log (or create) this caller as a client, then log the missed call
      // + auto-text either way — this used to only log for brand-new
      // leads, so an existing client's missed call left no record at all.
      let clientId: string | undefined;
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("owner_id", settings.user_id)
        .eq("phone", from)
        .maybeSingle();

      if (existing) {
        clientId = existing.id;
      } else {
        const { data: created } = await supabase
          .from("clients")
          .insert({
            owner_id: settings.user_id,
            name: `New lead (${from})`,
            phone: from,
            source: "missed_call",
          })
          .select("id")
          .single();
        clientId = created?.id;
      }

      if (clientId) {
        await logClientMessage(supabase, {
          ownerId: settings.user_id,
          clientId,
          channel: "call",
          direction: "inbound",
          body: "Missed call",
        });
        await logClientMessage(supabase, {
          ownerId: settings.user_id,
          clientId,
          channel: "sms",
          direction: "outbound",
          body: textBody,
        });
      }
    }

    return twimlResponse(`<Response></Response>`);
  }

  // First stage: an incoming call just landed — ring the owner's real phone.
  if (!settings.forward_to_phone) {
    return twimlResponse(
      `<Response><Say>Sorry, this line isn't set up to take calls yet.</Say></Response>`,
    );
  }

  const actionUrl = req.url; // Twilio will re-POST here with DialCallStatus
  return twimlResponse(
    `<Response><Dial timeout="20" action="${xmlEscape(actionUrl)}"><Number>${xmlEscape(
      settings.forward_to_phone,
    )}</Number></Dial></Response>`,
  );
});
