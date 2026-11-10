// POST { jobId, action: "push" | "delete" }
// Auth: signed-in owner, admin, or crew member of the business.
//
// push: create or update the Google Calendar event so it matches the job
// (title, time, end, address). delete: remove the event, then delete the job.
// A missing Google connection is recorded as not_connected and does not
// fail the request. A Google error is recorded as failed.

import {
  CORS_HEADERS,
  createCalendarEvent,
  deleteCalendarEvent,
  getFreshAccessToken,
  serviceClient,
  updateCalendarEvent,
} from "../_shared/google.ts";
import { resolveOwnerId } from "../_shared/team.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }

    const { jobId, action } = await req.json();
    if (!jobId || !["push", "delete"].includes(action)) {
      return new Response(JSON.stringify({ error: "Missing jobId/action" }), { status: 400, headers: jsonHeaders });
    }

    const { ownerId } = await resolveOwnerId(supabase, userData.user.id);
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*, client:clients(name, email)")
      .eq("id", jobId)
      .eq("owner_id", ownerId)
      .single();
    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: jsonHeaders });
    }

    if (action === "delete") {
      await removeEvent(job.owner_id, job.google_event_id);
      const { error: deleteError } = await supabase.from("jobs").delete().eq("id", job.id);
      if (deleteError) throw deleteError;
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    const status = await pushJob(supabase, job);
    return new Response(JSON.stringify(status), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

async function removeEvent(ownerId: string, eventId: string | null) {
  if (!eventId) return;
  try {
    const accessToken = await getFreshAccessToken(ownerId);
    await deleteCalendarEvent({ accessToken, eventId });
  } catch {
    // The job delete still proceeds. A leftover calendar event can be
    // removed from Google by hand.
  }
}

// deno-lint-ignore no-explicit-any
async function pushJob(supabase: any, job: any) {
  const { data: connection } = await supabase
    .from("google_connections")
    .select("user_id")
    .eq("user_id", job.owner_id)
    .maybeSingle();

  if (!connection) {
    await supabase
      .from("jobs")
      .update({ calendar_sync_status: "not_connected", calendar_sync_error: null })
      .eq("id", job.id);
    return { status: "not_connected" };
  }

  const { data: settings } = await supabase
    .from("scheduling_settings")
    .select("timezone, slot_duration_minutes")
    .eq("user_id", job.owner_id)
    .maybeSingle();
  const timezone = settings?.timezone ?? "America/New_York";
  const durationMinutes = settings?.slot_duration_minutes ?? 60;

  if (!job.scheduled_at) {
    await removeEvent(job.owner_id, job.google_event_id);
    await supabase
      .from("jobs")
      .update({
        google_event_id: null,
        google_event_url: null,
        calendar_sync_status: "synced",
        calendar_sync_error: null,
      })
      .eq("id", job.id);
    return { status: "synced" };
  }

  const start = new Date(job.scheduled_at);
  const requestedEnd = job.ends_at ? new Date(job.ends_at) : null;
  const end =
    requestedEnd && !Number.isNaN(requestedEnd.getTime()) && requestedEnd > start
      ? requestedEnd
      : new Date(start.getTime() + durationMinutes * 60_000);

  const eventInput = {
    summary: `${job.title} — ${job.client?.name ?? "Client"}`,
    description: job.description || undefined,
    location: job.address || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    timezone,
  };

  try {
    const accessToken = await getFreshAccessToken(job.owner_id);
    let eventId = job.google_event_id as string | null;
    let htmlLink: string | null = job.google_event_url ?? null;

    if (eventId) {
      try {
        const updated = await updateCalendarEvent({ accessToken, eventId, ...eventInput });
        htmlLink = updated.htmlLink ?? htmlLink;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("(404)") && !message.includes("(410)")) throw err;
        eventId = null;
      }
    }

    if (!eventId) {
      const created = await createCalendarEvent({ accessToken, ...eventInput });
      eventId = created.id;
      htmlLink = created.htmlLink;
    }

    await supabase
      .from("jobs")
      .update({
        google_event_id: eventId,
        google_event_url: htmlLink,
        calendar_sync_status: "synced",
        calendar_sync_error: null,
      })
      .eq("id", job.id);
    return { status: "synced", url: htmlLink };
  } catch (err) {
    const calendarSyncError = err instanceof Error ? err.message.slice(0, 500) : "Calendar sync failed";
    await supabase
      .from("jobs")
      .update({ calendar_sync_status: "failed", calendar_sync_error: calendarSyncError })
      .eq("id", job.id);
    return { status: "failed", error: calendarSyncError };
  }
}
