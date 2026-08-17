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

    const { client_id, title, description, address, scheduled_at } = await req.json();
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

    if (scheduled_at) {
      const { data: connection } = await supabase
        .from("google_connections")
        .select("google_email")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (connection) {
        try {
          const { data: settings } = await supabase
            .from("scheduling_settings")
            .select("timezone, slot_duration_minutes")
            .eq("user_id", ownerId)
            .maybeSingle();
          const timezone = settings?.timezone ?? "America/New_York";
          const durationMinutes = settings?.slot_duration_minutes ?? 60;

          const start = new Date(scheduled_at);
          const end = new Date(start.getTime() + durationMinutes * 60_000);

          const accessToken = await getFreshAccessToken(ownerId);
          googleEventId = await createCalendarEvent({
            accessToken,
            summary: `${title} — ${client.name}`,
            description: description || undefined,
            location: address || client.address || undefined,
            start: start.toISOString(),
            end: end.toISOString(),
            timezone,
            attendeeEmail: client.email ?? undefined,
          });
        } catch {
          // The job still gets created in Project Flow even if the
          // calendar push fails (e.g. Google token needs reconnecting).
        }
      }
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
        status: "scheduled",
        google_event_id: googleEventId,
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
