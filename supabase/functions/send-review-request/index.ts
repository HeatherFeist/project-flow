// POST { jobId: string }
// Auth: caller's Supabase JWT (the business owner). Sends the client a
// direct link to leave a Google review — texts it if Twilio + the client's
// phone are available, otherwise emails it via the owner's connected
// Gmail. The customer posts the review themselves, signed into their own
// Google account; Project Flow never touches Google's review system
// directly (there is no API for a third party to post a review on
// someone's behalf — see the README).

import { CORS_HEADERS, getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";
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

    const { jobId } = await req.json();

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*, client:clients(name, phone, email)")
      .eq("id", jobId)
      .eq("owner_id", ownerId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, google_review_link")
      .eq("id", ownerId)
      .maybeSingle();

    if (!profile?.google_review_link) {
      return new Response(
        JSON.stringify({ error: "Add your Google review link in Settings first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const businessName = profile.business_name || "us";
    const reviewLink = profile.google_review_link;
    const clientName = job.client?.name?.split(" ")[0] || "there";

    // Prefer text — higher open/click rate for this kind of ask — and
    // fall back to email if there's no phone or no Twilio connected.
    if (job.client?.phone) {
      const { data: twilioSettings } = await supabase
        .from("twilio_settings")
        .select("twilio_phone_number")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (twilioSettings) {
        const body = `Hi ${clientName}, thanks for choosing ${businessName}! If you have a minute, we'd really appreciate a quick Google review: ${reviewLink}`;
        await sendSms({
          accountSid: Deno.env.get("TWILIO_ACCOUNT_SID")!,
          authToken: Deno.env.get("TWILIO_AUTH_TOKEN")!,
          from: twilioSettings.twilio_phone_number,
          to: job.client.phone,
          body,
        });
        await logClientMessage(supabase, {
          ownerId,
          clientId: job.client_id,
          channel: "sms",
          direction: "outbound",
          body,
        });
        return new Response(JSON.stringify({ ok: true, channel: "sms" }), { headers: jsonHeaders });
      }
    }

    if (job.client?.email) {
      const { data: connection } = await supabase
        .from("google_connections")
        .select("google_email")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (connection) {
        const accessToken = await getFreshAccessToken(ownerId);
        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
            <p>Hi ${clientName},</p>
            <p>Thanks for choosing ${businessName}! If you have a minute, we'd really appreciate a quick review.</p>
            <p><a href="${reviewLink}" style="display:inline-block;padding:10px 16px;background:#4285F4;color:#fff;border-radius:6px;text-decoration:none;">Leave a Google review</a></p>
          </div>`;
        await sendGmail({
          accessToken,
          fromEmail: connection.google_email ?? "",
          fromName: businessName,
          to: job.client.email,
          subject: `How did we do?`,
          html,
        });
        await logClientMessage(supabase, {
          ownerId,
          clientId: job.client_id,
          channel: "email",
          direction: "outbound",
          body: "How did we do? (Google review request)",
        });
        return new Response(JSON.stringify({ ok: true, channel: "email" }), { headers: jsonHeaders });
      }
    }

    return new Response(
      JSON.stringify({
        error: "This client has no phone number (with Twilio connected) or email (with Google connected) to send to.",
      }),
      { status: 400, headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
