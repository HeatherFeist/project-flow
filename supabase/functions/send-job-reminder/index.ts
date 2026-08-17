// POST { jobId: string }
// Auth: caller's Supabase JWT (the business owner). Texts the client an
// appointment reminder for the given job from the owner's Twilio number.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
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
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const ownerId = userData.user.id;

    const { jobId } = await req.json();

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*, client:clients(name, phone)")
      .eq("id", jobId)
      .eq("owner_id", ownerId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: jsonHeaders });
    }
    if (!job.client?.phone) {
      return new Response(
        JSON.stringify({ error: "This client has no phone number on file." }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (!job.scheduled_at) {
      return new Response(
        JSON.stringify({ error: "This job doesn't have a scheduled time yet." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: twilioSettings } = await supabase
      .from("twilio_settings")
      .select("twilio_phone_number")
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

    const when = new Date(job.scheduled_at).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const body = `Reminder from ${profile?.business_name || "your contractor"}: "${job.title}" is scheduled for ${when}${
      job.address ? ` at ${job.address}` : ""
    }. Reply to this text if you need to reschedule.`;

    await sendSms({
      accountSid: Deno.env.get("TWILIO_ACCOUNT_SID")!,
      authToken: Deno.env.get("TWILIO_AUTH_TOKEN")!,
      from: twilioSettings.twilio_phone_number,
      to: job.client.phone,
      body,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
