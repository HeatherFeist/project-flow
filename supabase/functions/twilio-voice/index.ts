// Twilio Voice webhook. Configure this as the "A call comes in" webhook
// (POST) on your Twilio number, and as its own <Dial> action callback (see
// below — Twilio re-POSTs to the same URL after the dial attempt ends).
//
// Flow: incoming call → ring the owner's real phone for 20s → if answered,
// done. If not answered/busy/failed, text the caller a "sorry we missed
// you" message and log them as a lead in Clients.

import { serviceClient } from "../_shared/google.ts";
import { parseTwilioWebhook, sendSms, twimlResponse, verifyTwilioSignature, xmlEscape } from "../_shared/twilio.ts";

Deno.serve(async (req) => {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const params = await parseTwilioWebhook(req);
  const signature = req.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature({
    authToken,
    url: req.url,
    formParams: params,
    signature,
  });
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

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

  // Second stage: Twilio POSTs back here with DialCallStatus once the
  // <Dial> attempt below finishes.
  if (params.DialCallStatus) {
    if (params.DialCallStatus !== "completed" && params.DialCallStatus !== "answered") {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;

      try {
        await sendSms({
          accountSid,
          authToken,
          from: to,
          to: from,
          body: settings.missed_call_message,
        });
      } catch (err) {
        console.error("Failed to send missed-call text:", err);
      }

      // Log (or update) this caller as a lead.
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("owner_id", settings.user_id)
        .eq("phone", from)
        .maybeSingle();

      if (!existing) {
        await supabase.from("clients").insert({
          owner_id: settings.user_id,
          name: `New lead (${from})`,
          phone: from,
          source: "missed_call",
          notes: `Missed call at ${new Date().toISOString()}. Auto-texted a callback link.`,
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
