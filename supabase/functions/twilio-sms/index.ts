// Twilio Messaging webhook. Configure this as the "A message comes in"
// webhook (POST) on your Twilio number. Logs the sender as a client/lead
// (or appends to their existing notes if already a client) and sends a
// short auto-acknowledgement back.

import { serviceClient } from "../_shared/google.ts";
import { parseTwilioWebhook, twimlResponse, verifyTwilioSignature, xmlEscape } from "../_shared/twilio.ts";

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

  const stamp = new Date().toLocaleString("en-US");
  const { data: existing } = await supabase
    .from("clients")
    .select("id, notes")
    .eq("owner_id", settings.user_id)
    .eq("phone", from)
    .maybeSingle();

  if (existing) {
    const updatedNotes = `${existing.notes ?? ""}\n[${stamp}] Text: ${body}`.trim();
    await supabase.from("clients").update({ notes: updatedNotes }).eq("id", existing.id);
  } else {
    await supabase.from("clients").insert({
      owner_id: settings.user_id,
      name: `New lead (${from})`,
      phone: from,
      source: "inbound_text",
      notes: `[${stamp}] Text: ${body}`,
    });
  }

  return twimlResponse(
    `<Response><Message>${xmlEscape(
      "Thanks for reaching out! We got your message and will get back to you shortly.",
    )}</Message></Response>`,
  );
});
