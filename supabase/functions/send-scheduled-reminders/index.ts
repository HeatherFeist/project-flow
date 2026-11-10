// Runs on a schedule (pg_cron, see docs/schema_v23_reminders_leads.sql)
// once an hour.
//
// 1. Upcoming visit reminders (the original behavior): text, and email
//    when reminder_settings.visit_email_enabled is on. The window is still
//    scheduling_settings.reminder_hours_before. visit_sms_enabled defaults
//    to on so businesses that never open the new settings keep getting texts.
// 2. Quote follow-ups and overdue-invoice reminders, only when that
//    business turns them on in Settings. Each send is written to reminder_log.
//
// A quote, invoice, or job is marked sent after at least one channel
// succeeds, so the hourly run does not send the same reminder again.
// A failed channel (for example an expired Twilio trial) is logged and
// retried on a later run only if nothing succeeded.

import { getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";
import { sendSms } from "../_shared/twilio.ts";
import { logClientMessage } from "../_shared/clientMessages.ts";

const MAX_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Supabase = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null);

  try {
    const supabase = serviceClient();
    const now = new Date();
    const { data: reminderRows } = await supabase.from("reminder_settings").select("*");
    const remindersByOwner = new Map<string, ReminderSettings>(
      (reminderRows ?? []).map((row: ReminderSettings) => [row.owner_id, row]),
    );

    const { data: settingsRows } = await supabase
      .from("scheduling_settings")
      .select("user_id, reminder_hours_before")
      .gt("reminder_hours_before", 0);
    const hoursByOwner = new Map<string, number>(
      (settingsRows ?? []).map((r: { user_id: string; reminder_hours_before: number }) => [r.user_id, r.reminder_hours_before]),
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    if (hoursByOwner.size > 0) {
      const counts = await sendVisitReminders(supabase, hoursByOwner, remindersByOwner, now);
      sent += counts.sent;
      skipped += counts.skipped;
      failed += counts.failed;
    }

    const extra = await sendFollowUps(supabase, remindersByOwner, now);
    sent += extra.sent;
    failed += extra.failed;

    return new Response(JSON.stringify({ ok: true, sent, skipped, failed }));
  } catch (err) {
    console.error("send-scheduled-reminders failed:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500 });
  }
});

interface ReminderSettings {
  owner_id: string;
  quote_followup_enabled: boolean;
  quote_followup_days: number;
  quote_followup_email: boolean;
  quote_followup_sms: boolean;
  quote_followup_template: string;
  invoice_reminder_enabled: boolean;
  invoice_reminder_days: number;
  invoice_reminder_email: boolean;
  invoice_reminder_sms: boolean;
  invoice_reminder_template: string;
  visit_email_enabled: boolean;
  visit_sms_enabled: boolean;
  visit_template: string;
}

async function sendVisitReminders(
  supabase: Supabase,
  hoursByOwner: Map<string, number>,
  remindersByOwner: Map<string, ReminderSettings>,
  now: Date,
) {
  const ownerIds = [...hoursByOwner.keys()];
  const maxWindow = new Date(now.getTime() + MAX_LOOKAHEAD_MS);
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, owner_id, client_id, title, address, scheduled_at, client:clients(name, phone, email)")
    .in("owner_id", ownerIds)
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .not("scheduled_at", "is", null)
    .gt("scheduled_at", now.toISOString())
    .lte("scheduled_at", maxWindow.toISOString());
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const client = job.client as { name: string; phone: string | null; email: string | null } | null;
    const hours = hoursByOwner.get(job.owner_id);
    if (!hours || !job.scheduled_at) continue;
    const dueAt = new Date(new Date(job.scheduled_at).getTime() - hours * 60 * 60 * 1000);
    if (dueAt > now) continue;

    const settings = remindersByOwner.get(job.owner_id);
    const smsOn = settings ? settings.visit_sms_enabled : true;
    const emailOn = settings?.visit_email_enabled ?? false;
    const when = new Date(job.scheduled_at).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const businessName = await businessNameFor(supabase, job.owner_id);
    const body = fill(settings?.visit_template || 'Reminder from {business_name}: "{job}" is scheduled for {when}.', {
      client_name: client?.name?.split(" ")[0] || "there",
      business_name: businessName,
      when,
      job: job.title,
      address: job.address || "",
      link: "",
      amount: "",
    });

    if (!smsOn && !emailOn) {
      skipped++;
      continue;
    }
    if (smsOn && !client?.phone && emailOn && !client?.email) {
      await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
      skipped++;
      continue;
    }
    if (smsOn && !emailOn && !client?.phone) {
      await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
      skipped++;
      continue;
    }

    let anySent = false;
    try {
      if (smsOn && client?.phone) {
        await deliverSms(supabase, job.owner_id, job.client_id, client.phone, body);
        await logReminder(supabase, { ownerId: job.owner_id, clientId: job.client_id, kind: "visit", channel: "sms", body, relatedId: job.id, status: "sent" });
        anySent = true;
      }
      if (emailOn && client?.email) {
        await deliverEmail(supabase, job.owner_id, job.client_id, client.email, `Reminder: ${job.title}`, body);
        await logReminder(supabase, { ownerId: job.owner_id, clientId: job.client_id, kind: "visit", channel: "email", body, relatedId: job.id, status: "sent" });
        anySent = true;
      }
      if (anySent) {
        await supabase.from("jobs").update({ reminder_sent_at: now.toISOString() }).eq("id", job.id);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      await logReminder(supabase, {
        ownerId: job.owner_id,
        clientId: job.client_id,
        kind: "visit",
        channel: "sms",
        body,
        relatedId: job.id,
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 500) : "Send failed",
      });
    }
  }

  return { sent, skipped, failed };
}

async function sendFollowUps(supabase: Supabase, remindersByOwner: Map<string, ReminderSettings>, now: Date) {
  let sent = 0;
  let failed = 0;
  const siteUrl = Deno.env.get("SITE_URL") ?? "";

  for (const settings of remindersByOwner.values()) {
    if (settings.quote_followup_enabled) {
      const cutoff = new Date(now.getTime() - settings.quote_followup_days * 24 * 60 * 60 * 1000).toISOString();
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, owner_id, client_id, total_cents, accept_token, sent_at, client:clients(name, phone, email)")
        .eq("owner_id", settings.owner_id)
        .eq("status", "sent")
        .is("followup_sent_at", null)
        .not("sent_at", "is", null)
        .lte("sent_at", cutoff);
      for (const quote of quotes ?? []) {
        const outcome = await sendOne(supabase, {
          settings,
          ownerId: settings.owner_id,
          client: quote.client,
          clientId: quote.client_id,
          kind: "quote_followup",
          relatedId: quote.id,
          emailOn: settings.quote_followup_email,
          smsOn: settings.quote_followup_sms,
          template: settings.quote_followup_template,
          subject: "Following up on your quote",
          link: `${siteUrl}/q/${quote.accept_token}`,
          amount: formatMoney(quote.total_cents),
        });
        if (outcome === "sent") {
          await supabase.from("quotes").update({ followup_sent_at: now.toISOString() }).eq("id", quote.id);
          sent++;
        } else if (outcome === "failed") failed++;
      }
    }

    if (settings.invoice_reminder_enabled) {
      const cutoff = new Date(now.getTime() - settings.invoice_reminder_days * 24 * 60 * 60 * 1000);
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, owner_id, client_id, total_cents, amount_paid_cents, due_date, pay_token, status, client:clients(name, phone, email)")
        .eq("owner_id", settings.owner_id)
        .is("overdue_reminder_sent_at", null)
        .not("due_date", "is", null)
        .lte("due_date", cutoffDate)
        .neq("status", "paid");
      for (const invoice of invoices ?? []) {
        const remaining = invoice.total_cents - (invoice.amount_paid_cents ?? 0);
        if (remaining <= 0) continue;
        const outcome = await sendOne(supabase, {
          settings,
          ownerId: settings.owner_id,
          client: invoice.client,
          clientId: invoice.client_id,
          kind: "invoice_overdue",
          relatedId: invoice.id,
          emailOn: settings.invoice_reminder_email,
          smsOn: settings.invoice_reminder_sms,
          template: settings.invoice_reminder_template,
          subject: "Invoice past due",
          link: `${siteUrl}/pay/${invoice.pay_token}`,
          amount: formatMoney(remaining),
        });
        if (outcome === "sent") {
          await supabase.from("invoices").update({ overdue_reminder_sent_at: now.toISOString() }).eq("id", invoice.id);
          sent++;
        } else if (outcome === "failed") failed++;
      }
    }
  }

  return { sent, failed };
}

async function sendOne(
  supabase: Supabase,
  input: {
    ownerId: string;
    client: { name?: string; phone?: string | null; email?: string | null } | null;
    clientId: string;
    kind: string;
    relatedId: string;
    emailOn: boolean;
    smsOn: boolean;
    template: string;
    subject: string;
    link: string;
    amount: string;
  },
): Promise<"sent" | "failed" | "skipped"> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("reminder_log")
    .select("id")
    .eq("related_id", input.relatedId)
    .eq("kind", input.kind)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return "skipped";

  const businessName = await businessNameFor(supabase, input.ownerId);
  const body = fill(input.template, {
    client_name: input.client?.name?.split(" ")[0] || "there",
    business_name: businessName,
    link: input.link,
    amount: input.amount,
    when: "",
    job: "",
    address: "",
  });

  let anySent = false;
  let anyFailed = false;
  if (input.emailOn && input.client?.email) {
    try {
      await deliverEmail(supabase, input.ownerId, input.clientId, input.client.email, input.subject, body);
      await logReminder(supabase, { ownerId: input.ownerId, clientId: input.clientId, kind: input.kind, channel: "email", body, relatedId: input.relatedId, status: "sent" });
      anySent = true;
    } catch (err) {
      anyFailed = true;
      await logReminder(supabase, { ownerId: input.ownerId, clientId: input.clientId, kind: input.kind, channel: "email", body, relatedId: input.relatedId, status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "Email failed" });
    }
  }
  if (input.smsOn && input.client?.phone) {
    try {
      await deliverSms(supabase, input.ownerId, input.clientId, input.client.phone, body);
      await logReminder(supabase, { ownerId: input.ownerId, clientId: input.clientId, kind: input.kind, channel: "sms", body, relatedId: input.relatedId, status: "sent" });
      anySent = true;
    } catch (err) {
      anyFailed = true;
      await logReminder(supabase, { ownerId: input.ownerId, clientId: input.clientId, kind: input.kind, channel: "sms", body, relatedId: input.relatedId, status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "Text failed" });
    }
  }
  if (anySent) return "sent";
  if (anyFailed) return "failed";
  return "skipped";
}

const businessNames = new Map<string, string>();
async function businessNameFor(supabase: Supabase, ownerId: string) {
  if (businessNames.has(ownerId)) return businessNames.get(ownerId)!;
  const { data } = await supabase.from("profiles").select("business_name").eq("id", ownerId).maybeSingle();
  const name = data?.business_name || "your contractor";
  businessNames.set(ownerId, name);
  return name;
}

async function deliverSms(supabase: Supabase, ownerId: string, clientId: string, to: string, body: string) {
  const { data: twilioSettings } = await supabase
    .from("twilio_settings")
    .select("twilio_phone_number, twilio_account_sid, twilio_auth_token")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!twilioSettings?.twilio_phone_number) throw new Error("No Twilio number configured");
  await sendSms({
    accountSid: twilioSettings.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID") || "",
    authToken: twilioSettings.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN") || "",
    from: twilioSettings.twilio_phone_number,
    to,
    body,
  });
  await logClientMessage(supabase, { ownerId, clientId, channel: "sms", direction: "outbound", body });
}

async function deliverEmail(supabase: Supabase, ownerId: string, clientId: string, to: string, subject: string, body: string) {
  const { data: connection } = await supabase
    .from("google_connections")
    .select("google_email")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!connection?.google_email) throw new Error("Google email isn't connected");
  const accessToken = await getFreshAccessToken(ownerId);
  const businessName = await businessNameFor(supabase, ownerId);
  await sendGmail({
    accessToken,
    fromEmail: connection.google_email,
    fromName: businessName,
    to,
    subject,
    html: `<p>${escapeHtml(body)}</p>`,
  });
  await logClientMessage(supabase, { ownerId, clientId, channel: "email", direction: "outbound", body });
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function logReminder(
  supabase: Supabase,
  row: { ownerId: string; clientId: string | null; kind: string; channel: string; body: string; relatedId: string; status: string; error?: string },
) {
  await supabase.from("reminder_log").insert({
    owner_id: row.ownerId,
    client_id: row.clientId,
    kind: row.kind,
    channel: row.channel,
    body: row.body,
    related_id: row.relatedId,
    status: row.status,
    error: row.error ?? null,
  });
}
