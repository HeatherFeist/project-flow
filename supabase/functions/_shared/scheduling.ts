// Shared slot-computation logic used by both the available-slots endpoint
// (quote-driven booking) and the estimate chatbot's get_available_slots
// tool. Business hours minus Google Calendar busy time minus already-
// scheduled jobs.

import { getBusyIntervals, getFreshAccessToken, serviceClient } from "./google.ts";
import { zonedDateParts, zonedTimeToUtc } from "./time.ts";

interface Interval {
  start: number;
  end: number;
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

const DEFAULT_SETTINGS = {
  timezone: "America/New_York",
  work_days: [1, 2, 3, 4, 5],
  work_start_minutes: 480,
  work_end_minutes: 1020,
  slot_duration_minutes: 120,
  booking_horizon_days: 14,
};

export async function computeAvailableSlots(
  ownerId: string,
): Promise<{ slots: { start: string; end: string }[]; timezone: string }> {
  const supabase = serviceClient();

  const { data: settings } = await supabase
    .from("scheduling_settings")
    .select("*")
    .eq("user_id", ownerId)
    .maybeSingle();

  const cfg = settings ?? DEFAULT_SETTINGS;

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + cfg.booking_horizon_days * 24 * 60 * 60 * 1000);

  const busy: Interval[] = [];

  const { data: connection } = await supabase
    .from("google_connections")
    .select("user_id")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (connection) {
    try {
      const accessToken = await getFreshAccessToken(ownerId);
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
    .eq("owner_id", ownerId)
    .not("scheduled_at", "is", null)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizonEnd.toISOString());

  for (const j of jobs ?? []) {
    const start = new Date(j.scheduled_at).getTime();
    busy.push({ start, end: start + cfg.slot_duration_minutes * 60000 });
  }

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

  return { slots: slots.slice(0, 60), timezone: cfg.timezone };
}
