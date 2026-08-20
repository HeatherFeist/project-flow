// Twilio Messaging webhook. Configure this as the "A message comes in"
// webhook (POST) on your Twilio number. Logs the sender as a client/lead
// and every inbound (and auto-reply outbound) text into the structured
// client_messages timeline. New leads get an auto-reply pointing them at
// the estimate chatbot; existing clients get no auto-reply, so an ongoing
// conversation with the owner isn't interrupted.

import { serviceClient } from "../_shared/google.ts";
import { parseTwilioWebhook, twimlResponse, verifyTwilioSignature, xmlEscape } from "../_shared/twilio.ts";
import { logClientMessage } from "../_shared/clientMessages.ts";

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
  const to = params.To;
  const from = params.From;
  const body = params.Body ?? "";

  const { data: settings } = await supabase
    .from("twilio_settings")
    .select("user_id")
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!settings) {
    return twimlResponse(`<Response></Response>`);
  }

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_id", settings.user_id)
    .eq("phone", from)
    .maybeSingle();

  if (existing) {
    await logClientMessage(supabase, {
      ownerId: settings.user_id,
      clientId: existing.id,
      channel: "sms",
      direction: "inbound",
      body,
    });
    return twimlResponse(`<Response></Response>`);
  }

  const { data: newClient } = await supabase
    .from("clients")
    .insert({
      owner_id: settings.user_id,
      name: `New lead (${from})`,
      phone: from,
      source: "inbound_text",
    })
    .select("id")
    .single();

  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const chatLink = `${siteUrl}/estimate/${settings.user_id}`;
  const replyBody = `Thanks for reaching out! Get a rough estimate & schedule a free visit here: ${chatLink}`;

  if (newClient) {
    await logClientMessage(supabase, {
      ownerId: settings.user_id,
      clientId: newClient.id,
      channel: "sms",
      direction: "inbound",
      body,
    });
    await logClientMessage(supabase, {
      ownerId: settings.user_id,
      clientId: newClient.id,
      channel: "sms",
      direction: "outbound",
      body: replyBody,
    });
  }

  return twimlResponse(`<Response><Message>${xmlEscape(replyBody)}</Message></Response>`);
});
