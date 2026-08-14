// GET ?token=<accept_token>
// Returns open scheduling slots for the quote's owner: business-hours slots
// minus anything already busy on their Google Calendar and minus any job
// already scheduled in Project Flow (belt-and-suspenders in case a job
// wasn't mirrored to Calendar).

import { CORS_HEADERS, getBusyIntervals, getFreshAccessToken, serviceClient } from "../_shared/google.ts";
import { zonedDateParts, zonedTimeToUtc } from "../_shared/time.ts";

interface Interval {
  start: number;
  end: number;
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

    const supabase = serviceClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, owner_id, status")
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
      .select("*")
      .eq("user_id", quote.owner_id)
      .maybeSingle();

    const cfg = settings ?? {
      timezone: "America/New_York",
      work_days: [1, 2, 3, 4, 5],
      work_start_minutes: 480,
      work_end_minutes: 1020,
      slot_duration_minutes: 120,
      booking_horizon_days: 14,
    };

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + cfg.booking_horizon_days * 24 * 60 * 60 * 1000);

    // Busy intervals: Google Calendar (if connected) + already-scheduled jobs.
    const busy: Interval[] = [];

    const { data: connection } = await supabase
      .from("google_connections")
      .select("user_id")
      .eq("user_id", quote.owner_id)
      .maybeSingle();

    if (connection) {
      try {
        const accessToken = await getFreshAccessToken(quote.owner_id);
        const googleBusy = await getBusyIntervals({
          accessToken,
          timeMin: now.toISOString(),
          timeMax: horizonEnd.toISOString(),
        });
        for (const b of googleBusy) {
          busy.push({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() });
        }
      } catch {
        // Fall back to Project-Flow-only availability if Calendar can't be reached.
      }
    }

    const { data: jobs } = await supabase
      .from("jobs")
      .select("scheduled_at")
      .eq("owner_id", quote.owner_id)
      .not("scheduled_at", "is", null)
      .in("status", ["scheduled", "in_progress"])
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString());

    for (const j of jobs ?? []) {
      const start = new Date(j.scheduled_at).getTime();
      busy.push({ start, end: start + cfg.slot_duration_minutes * 60000 });
    }

    // Generate candidate slots across the horizon.
    const slots: { start: string; end: string }[] = [];
    for (let dayOffset = 0; dayOffset < cfg.booking_horizon_days; dayOffset++) {
      const dayInstant = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const { year, month, day, weekday } = zonedDateParts(dayInstant, cfg.timezone);
      if (!cfg.work_days.includes(weekday)) continue;

      for (
        let minutes = cfg.work_start_minutes;
        minutes + cfg.slot_duration_minutes <= cfg.work_end_minutes;
        minutes += cfg.slot_duration_minutes
      ) {
        const start = zonedTimeToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60, cfg.timezone);
        const end = new Date(start.getTime() + cfg.slot_duration_minutes * 60000);
        if (start.getTime() < now.getTime()) continue;

        const candidate = { start: start.getTime(), end: end.getTime() };
        if (busy.some((b) => overlaps(candidate, b))) continue;

        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }

    return new Response(JSON.stringify({ slots: slots.slice(0, 60), timezone: cfg.timezone }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
