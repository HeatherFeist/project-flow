// POST { token, start, end }  (ISO instants, as returned by available-slots)
// Books the slot onto the job that quote acceptance already created
// (docs/schema_v38_quote_accepted_job.sql). If that job isn't there yet
// (trigger not applied, or the job was deleted), one job is inserted.
// A second booking does not create a second job. Also creates the Google
// Calendar event on the owner's calendar and emails both sides a confirmation.

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

    const jobTitle = quoteJobTitle(quote);
    const jobDescription = quoteJobDescription(quote);

    const { data: existingJobs, error: existingJobsError } = await supabase
      .from("jobs")
      .select("id, scheduled_at, google_event_id, address")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: true });
    if (existingJobsError) throw existingJobsError;

    // A time is already saved — return that job and skip a second calendar
    // event. The public page hides the picker once a time is set.
    const alreadyBooked = (existingJobs ?? []).find((row: { scheduled_at: string | null }) => row.scheduled_at);
    if (alreadyBooked) {
      return new Response(JSON.stringify({ job: alreadyBooked }), { headers: jsonHeaders });
    }
    const existingJob = (existingJobs ?? [])[0] ?? null;

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

    const schedulePatch: Record<string, unknown> = {
      scheduled_at: start,
      status: "scheduled",
    };
    if (googleEventId) schedulePatch.google_event_id = googleEventId;

    let job: { id: string };
    if (existingJob) {
      if (!existingJob.address && quote.client.address) schedulePatch.address = quote.client.address;
      const { data, error: jobError } = await supabase
        .from("jobs")
        .update(schedulePatch)
        .eq("id", existingJob.id)
        .select()
        .single();
      if (jobError) throw jobError;
      job = data;
    } else {
      const { data, error: jobError } = await supabase
        .from("jobs")
        .insert({
          owner_id: quote.owner_id,
          client_id: quote.client_id,
          quote_id: quote.id,
          title: jobTitle,
          description: jobDescription,
          status: "scheduled",
          scheduled_at: start,
          address: quote.client.address ?? null,
          google_event_id: googleEventId,
        })
        .select()
        .single();

      if (jobError) {
        // Acceptance inserted the job between our lookup and this insert.
        if (jobError.code !== "23505") throw jobError;
        const { data: raced, error: racedError } = await supabase
          .from("jobs")
          .update(schedulePatch)
          .eq("quote_id", quote.id)
          .select()
          .limit(1);
        if (racedError || !raced?.[0]) throw jobError;
        job = raced[0];
      } else {
        job = data;
      }
    }

    // Link the auto-created invoice (from accept) to this job, if present,
    // and point quotes.job_id at it when that side of the link is empty.
    await supabase.from("invoices").update({ job_id: job.id }).eq("quote_id", quote.id).is("job_id", null);
    await supabase.from("quotes").update({ job_id: job.id }).eq("id", quote.id).is("job_id", null);

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

// Same title/description rules as create_job_for_accepted_quote in
// docs/schema_v38_quote_accepted_job.sql, so a job created here (only when
// acceptance didn't already make one) matches one the trigger would make.
function quoteJobTitle(quote: {
  notes: string | null;
  items?: { description?: string }[] | null;
  client?: { name?: string | null } | null;
}) {
  const notes = quote.notes?.trim();
  if (notes) return notes.slice(0, 80);
  const firstItem = Array.isArray(quote.items) ? quote.items[0]?.description?.trim() : "";
  if (firstItem) return firstItem.slice(0, 80);
  return `Job for ${quote.client?.name || "client"}`;
}

function quoteJobDescription(quote: {
  notes: string | null;
  items?: { description?: string }[] | null;
}) {
  const notes = quote.notes?.trim();
  if (notes) return notes;
  const firstItem = Array.isArray(quote.items) ? quote.items[0]?.description?.trim() : "";
  return firstItem || null;
}
