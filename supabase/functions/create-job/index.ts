// POST { client_id, title, description?, address?, scheduled_at? }
// Auth: caller's Supabase JWT (the business owner).
//
// Creates a job directly from inside the app (dashboard/schedule "New job"
// dialog) and, if the owner has Google connected, also creates a matching
// event on their Google Calendar — with an email reminder — so a job
// scheduled by hand shows up and reminds the same way one booked through
// the public quote/estimate flow does.

import { CORS_HEADERS, createCalendarEvent, getFreshAccessToken, serviceClient } from "../_shared/google.ts";

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
    const ownerId = userData.user.id;

    const { client_id, title, description, address, scheduled_at, ends_at } = await req.json();
    if (!client_id || !title) {
      return new Response(JSON.stringify({ error: "Missing client_id/title" }), { status: 400, headers: jsonHeaders });
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, email, address")
      .eq("id", client_id)
      .eq("owner_id", ownerId)
      .single();
    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: jsonHeaders });
    }

    let googleEventId: string | null = null;
    let googleEventUrl: string | null = null;
    let calendarSyncStatus: "synced" | "failed" | "not_connected" | null = null;
    let calendarSyncError: string | null = null;

    if (scheduled_at) {
      const { data: connection } = await supabase
        .from("google_connections")
        .select("google_email")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (!connection) {
        calendarSyncStatus = "not_connected";
      } else {
        try {
          const { data: settings } = await supabase
            .from("scheduling_settings")
            .select("timezone, slot_duration_minutes")
            .eq("user_id", ownerId)
            .maybeSingle();
          const timezone = settings?.timezone ?? "America/New_York";
          const durationMinutes = settings?.slot_duration_minutes ?? 60;

          const start = new Date(scheduled_at);
          const requestedEnd = ends_at ? new Date(ends_at) : null;
          const end =
            requestedEnd && !Number.isNaN(requestedEnd.getTime()) && requestedEnd > start
              ? requestedEnd
              : new Date(start.getTime() + durationMinutes * 60_000);

          const accessToken = await getFreshAccessToken(ownerId);
          const created = await createCalendarEvent({
            accessToken,
            summary: `${title} — ${client.name}`,
            description: description || undefined,
            location: address || client.address || undefined,
            start: start.toISOString(),
            end: end.toISOString(),
            timezone,
            attendeeEmail: client.email ?? undefined,
          });
          googleEventId = created.id;
          googleEventUrl = created.htmlLink;
          calendarSyncStatus = "synced";
        } catch (err) {
          calendarSyncStatus = "failed";
          calendarSyncError = err instanceof Error ? err.message.slice(0, 500) : "Calendar sync failed";
        }
      }
    } else {
      const { data: connection } = await supabase
        .from("google_connections")
        .select("google_email")
        .eq("user_id", ownerId)
        .maybeSingle();
      calendarSyncStatus = connection ? null : "not_connected";
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        owner_id: ownerId,
        client_id,
        title,
        description: description || null,
        address: address || null,
        scheduled_at: scheduled_at || null,
        ends_at: ends_at || null,
        status: "scheduled",
        google_event_id: googleEventId,
        google_event_url: googleEventUrl,
        calendar_sync_status: calendarSyncStatus,
        calendar_sync_error: calendarSyncError,
      })
      .select("*, client:clients(id, name)")
      .single();
    if (jobError) throw jobError;

    return new Response(JSON.stringify({ job, calendarSynced: !!googleEventId }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
