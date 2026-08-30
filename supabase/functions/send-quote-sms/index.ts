// POST { quoteId: string }
// Auth: caller's Supabase JWT (the business owner). Texts the client a
// direct link to their quote — same public /q/:token page the email
// version links to, just delivered by SMS via the owner's Twilio number
// instead of (or alongside) email.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { sendSms } from "../_shared/twilio.ts";
import { logClientMessage } from "../_shared/clientMessages.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }
    const ownerId = userData.user.id;

    const { quoteId } = await req.json();

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, accept_token, total_cents, client:clients(id, name, phone)")
      .eq("id", quoteId)
      .eq("owner_id", ownerId)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
    }
    // deno-lint-ignore no-explicit-any
    const client = (quote as any).client as { id: string; name: string; phone: string | null } | null;
    if (!client?.phone) {
      return new Response(
        JSON.stringify({ error: "This client has no phone number on file." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: twilioSettings } = await supabase
      .from("twilio_settings")
      .select("twilio_phone_number, twilio_account_sid, twilio_auth_token")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (!twilioSettings) {
      return new Response(
        JSON.stringify({ error: "Connect a Twilio number in Settings first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("id", ownerId)
      .maybeSingle();

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const quoteUrl = `${siteUrl}/q/${quote.accept_token}`;
    const businessName = profile?.business_name || "your contractor";
    const body = `Hi ${client.name.split(" ")[0]}, here's your quote from ${businessName}: ${quoteUrl}`;

    await sendSms({
      accountSid: twilioSettings.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID")!,
      authToken: twilioSettings.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN")!,
      from: twilioSettings.twilio_phone_number,
      to: client.phone,
      body,
    });

    await logClientMessage(supabase, {
      ownerId,
      clientId: client.id,
      channel: "sms",
      direction: "outbound",
      body,
    });

    await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quote.id);

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
