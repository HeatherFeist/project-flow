// POST { token, start, end }  (ISO instants, as returned by available-slots)
// Books the slot: creates the Job, creates the real Google Calendar event
// on the owner's calendar, and emails both sides a confirmation.

import { CORS_HEADERS, createCalendarEvent, getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { token, start, end } = await req.json();
    if (!token || !start || !end) {
      return new Response(JSON.stringify({ error: "Missing token/start/end" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = serviceClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, client:clients(id, name, email, address)")
      .eq("accept_token", token)
      .single();

    if (error || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
    }
    if (quote.status !== "accepted") {
      return new Response(JSON.stringify({ error: "Quote must be accepted before scheduling." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: settings } = await supabase
      .from("scheduling_settings")
      .select("timezone")
      .eq("user_id", quote.owner_id)
      .maybeSingle();
    const timezone = settings?.timezone ?? "America/New_York";

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, email")
      .eq("id", quote.owner_id)
      .maybeSingle();
    const businessName = profile?.business_name || "Project Flow";

    const jobTitle = quote.notes ? quote.notes.slice(0, 80) : `Job for ${quote.client.name}`;

    let googleEventId: string | null = null;
    const { data: connection } = await supabase
      .from("google_connections")
      .select("google_email")
      .eq("user_id", quote.owner_id)
      .maybeSingle();

    if (connection) {
      try {
        const accessToken = await getFreshAccessToken(quote.owner_id);
        googleEventId = await createCalendarEvent({
          accessToken,
          summary: `${jobTitle} — ${quote.client.name}`,
          description: quote.notes ?? undefined,
          location: quote.client.address ?? undefined,
          start,
          end,
          timezone,
          attendeeEmail: quote.client.email ?? undefined,
        });
      } catch {
        // Booking still succeeds in Project Flow even if the calendar push fails.
      }
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        owner_id: quote.owner_id,
        client_id: quote.client_id,
        quote_id: quote.id,
        title: jobTitle,
        description: quote.notes ?? null,
        status: "scheduled",
        scheduled_at: start,
        address: quote.client.address ?? null,
        google_event_id: googleEventId,
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Link the auto-created invoice (from accept) to this job, if present.
    await supabase.from("invoices").update({ job_id: job.id }).eq("quote_id", quote.id).is("job_id", null);

    const when = new Date(start).toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const confirmationHtml = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
        <h2>You're scheduled!</h2>
        <p>${quote.client.name}'s job with ${businessName} is booked for <strong>${when}</strong>.</p>
        ${quote.client.address ? `<p>Location: ${quote.client.address}</p>` : ""}
      </div>`;

    try {
      if (connection) {
        const accessToken = await getFreshAccessToken(quote.owner_id);
        const recipients = [quote.client.email, profile?.email ?? connection.google_email].filter(Boolean);
        for (const to of recipients as string[]) {
          await sendGmail({
            accessToken,
            fromEmail: connection.google_email ?? "",
            fromName: businessName,
            to,
            subject: `Scheduled: ${jobTitle}`,
            html: confirmationHtml,
          });
        }
      }
    } catch {
      // Non-fatal — the job is booked either way.
    }

    return new Response(JSON.stringify({ job }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
