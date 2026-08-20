// Not called from the app — this runs on a schedule (pg_cron, see
// docs/schema_v23_reminders_leads.sql) once an hour, and automatically
// texts clients an appointment reminder for jobs coming up within each
// owner's configured reminder window (Settings → Scheduling → "Remind
// clients"). This is what turns the existing manual "Text reminder"
// button on a job into something that actually fires on its own.
//
// Idempotent: jobs.reminder_sent_at is set the moment a reminder goes
// out (or is skipped for a good reason, like no phone on file), so a job
// only ever gets one automatic reminder even though this runs hourly.

import { serviceClient } from "../_shared/google.ts";
import { sendSms } from "../_shared/twilio.ts";
import { logClientMessage } from "../_shared/clientMessages.ts";

const MAX_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000; // owners can set a long reminder window; don't scan further than a week out

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null);

  try {
    const supabase = serviceClient();
    const now = new Date();

    const { data: settingsRows } = await supabase
      .from("scheduling_settings")
      .select("user_id, reminder_hours_before")
      .gt("reminder_hours_before", 0);

    const hoursByOwner = new Map<string, number>((settingsRows ?? []).map((r) => [r.user_id, r.reminder_hours_before]));
    if (hoursByOwner.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, note: "No owners have reminders enabled." }));
    }

    const ownerIds = [...hoursByOwner.keys()];
    const maxWindow = new Date(now.getTime() + MAX_LOOKAHEAD_MS);

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, owner_id, client_id, title, address, scheduled_at, client:clients(name, phone)")
      .in("owner_id", ownerIds)
      .eq("status", "scheduled")
      .is("reminder_sent_at", null)
      .not("scheduled_at", "is", null)
      .gt("scheduled_at", now.toISOString())
      .lte("scheduled_at", maxWindow.toISOString());

    if (jobsError) throw jobsError;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const twilioByOwner = new Map<string, { twilio_phone_number: string; twilio_account_sid: string | null; twilio_auth_token: string | null } | null>();
    const profileByOwner = new Map<string, string | null>();

    for (const job of jobs ?? []) {
      // deno-lint-ignore no-explicit-any
      const client = (job as any).client as { name: string; phone: string | null } | null;
      const hours = hoursByOwner.get(job.owner_id);
      if (!hours || !job.scheduled_at) continue;

      const dueAt = new Date(new Date(job.scheduled_at).getTime() - hours * 60 * 60 * 1000);
      if (dueAt > now) continue; // not due yet — try again next hourly run

      if (!client?.phone) {
        // No phone on file — nothing we can do, and no point re-checking every hour.
        await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
        skipped++;
        continue;
      }

      try {
        if (!twilioByOwner.has(job.owner_id)) {
          const { data } = await supabase
            .from("twilio_settings")
            .select("twilio_phone_number, twilio_account_sid, twilio_auth_token")
            .eq("user_id", job.owner_id)
            .maybeSingle();
          twilioByOwner.set(job.owner_id, data ?? null);
        }
        if (!profileByOwner.has(job.owner_id)) {
          const { data } = await supabase
            .from("profiles")
            .select("business_name")
            .eq("id", job.owner_id)
            .maybeSingle();
          profileByOwner.set(job.owner_id, data?.business_name ?? null);
        }

        const twilioSettings = twilioByOwner.get(job.owner_id);
        if (!twilioSettings) {
          skipped++;
          await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
          continue;
        }

        const when = new Date(job.scheduled_at).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const businessName = profileByOwner.get(job.owner_id) || "your contractor";
        const body = `Reminder from ${businessName}: "${job.title}" is scheduled for ${when}${
          job.address ? ` at ${job.address}` : ""
        }. Reply to this text if you need to reschedule.`;

        await sendSms({
          accountSid: twilioSettings.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID")!,
          authToken: twilioSettings.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN")!,
          from: twilioSettings.twilio_phone_number,
          to: client.phone,
          body,
        });

        await logClientMessage(supabase, {
          ownerId: job.owner_id,
          clientId: job.client_id,
          channel: "sms",
          direction: "outbound",
          body,
        });

        await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
        sent++;
      } catch (err) {
        console.error(`Scheduled reminder failed for job ${job.id}:`, err);
        failed++;
        // Not marked sent — retried on the next hourly run as long as it's still due.
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, failed }));
  } catch (err) {
    console.error("send-scheduled-reminders failed:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500 });
  }
});
