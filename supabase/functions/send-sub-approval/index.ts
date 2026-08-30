// POST { subcontractorId: string }
// Auth: caller's Supabase JWT (the business owner). Sends the
// subcontractor a link to their own approval page (/sub/:token) — where
// they can review their scope of work, pay, and the project's payment
// timeline, then type their name to agree, before the estimate ever goes
// to the client. Best-effort across whichever contact info is on file:
// tries email (via the owner's connected Gmail) and SMS (via the owner's
// connected Twilio number) independently, succeeding if either works.

import { CORS_HEADERS, getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";
import { sendSms } from "../_shared/twilio.ts";

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

    const { subcontractorId } = await req.json();

    const { data: sub, error: subError } = await supabase
      .from("subcontractors")
      .select("id, name, scope_of_work, email, phone, approve_token, quote_id")
      .eq("id", subcontractorId)
      .eq("owner_id", ownerId)
      .single();

    if (subError || !sub) {
      return new Response(JSON.stringify({ error: "Subcontractor not found" }), { status: 404, headers: jsonHeaders });
    }

    if (!sub.email && !sub.phone) {
      return new Response(
        JSON.stringify({ error: "Add an email or phone number for this sub first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, logo_url")
      .eq("id", ownerId)
      .maybeSingle();

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const approveUrl = `${siteUrl}/sub/${sub.approve_token}`;
    const businessName = profile?.business_name || "your contractor";
    const firstName = sub.name.split(" ")[0];

    const sentVia: string[] = [];

    if (sub.email) {
      try {
        const accessToken = await getFreshAccessToken(ownerId);
        const { data: connection } = await supabase
          .from("google_connections")
          .select("google_email")
          .eq("user_id", ownerId)
          .single();

        const logoHtml = profile?.logo_url
          ? `<img src="${profile.logo_url}" alt="${businessName}" style="max-height:56px;max-width:200px;margin-bottom:12px;" />`
          : "";

        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;">
            ${logoHtml}
            <h2 style="margin-bottom:0;">Job details from ${businessName}</h2>
            <p style="color:#555;margin-top:4px;">
              Hi ${firstName}, ${businessName} added you to an upcoming job — "${sub.scope_of_work}".
              Take a look and sign off when you're ready.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${approveUrl}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Review &amp; sign off</a>
            </div>
          </div>`;

        await sendGmail({
          accessToken,
          fromEmail: connection?.google_email ?? userData.user.email!,
          fromName: businessName,
          to: sub.email,
          subject: `${businessName} added you to a job`,
          html,
        });
        sentVia.push("email");
      } catch {
        // Owner hasn't connected Google, or the send failed — fall through
        // and still try SMS if a phone number is on file.
      }
    }

    if (sub.phone) {
      try {
        const { data: twilioSettings } = await supabase
          .from("twilio_settings")
          .select("twilio_phone_number, twilio_account_sid, twilio_auth_token")
          .eq("user_id", ownerId)
          .maybeSingle();

        if (twilioSettings) {
          const body = `Hi ${firstName}, ${businessName} added you to a job ("${sub.scope_of_work}"). Review and sign off: ${approveUrl}`;
          await sendSms({
            accountSid: twilioSettings.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID")!,
            authToken: twilioSettings.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN")!,
            from: twilioSettings.twilio_phone_number,
            to: sub.phone,
            body,
          });
          sentVia.push("SMS");
        }
      } catch {
        // Owner hasn't connected Twilio, or the send failed.
      }
    }

    if (sentVia.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Couldn't send — connect Gmail or Twilio in Settings first (whichever matches this sub's contact info).",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ ok: true, sentVia }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
