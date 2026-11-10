import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTeam } from "@/contexts/TeamContext";
import {
  REMINDER_DEFAULTS,
  useReminderLog,
  useReminderSettings,
  useSaveReminderSettings,
  type ReminderSettings,
} from "@/hooks/useReminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

export function ReminderSettingsCard() {
  const { ownerId, isAdmin } = useTeam();
  const { data: saved } = useReminderSettings(ownerId);
  const { data: log } = useReminderLog(ownerId);
  const save = useSaveReminderSettings();
  const [form, setForm] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    setForm(saved ?? { owner_id: ownerId, ...REMINDER_DEFAULTS });
  }, [saved, ownerId]);

  if (!isAdmin || !form) return null;

  function patch(partial: Partial<ReminderSettings>) {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      await save.mutateAsync(form);
      toast.success("Reminder settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save reminders");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic reminders</CardTitle>
        <CardDescription>
          Quote follow-ups, overdue invoices, and visit reminders. Texts use the Twilio number already in Settings.
          Emails send from the connected Google account. Placeholders: {"{client_name}"}, {"{business_name}"}, {"{link}"},
          {"{amount}"}, {"{when}"}, {"{job}"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pb-6">
        <form onSubmit={handleSave} className="space-y-6">
          <ChannelBlock
            title="Quote follow-up"
            enabled={form.quote_followup_enabled}
            onEnabled={(value) => patch({ quote_followup_enabled: value })}
            days={form.quote_followup_days}
            daysLabel="Days after the quote is sent"
            onDays={(value) => patch({ quote_followup_days: value })}
            email={form.quote_followup_email}
            sms={form.quote_followup_sms}
            onEmail={(value) => patch({ quote_followup_email: value })}
            onSms={(value) => patch({ quote_followup_sms: value })}
            template={form.quote_followup_template}
            onTemplate={(value) => patch({ quote_followup_template: value })}
          />
          <ChannelBlock
            title="Overdue invoice"
            enabled={form.invoice_reminder_enabled}
            onEnabled={(value) => patch({ invoice_reminder_enabled: value })}
            days={form.invoice_reminder_days}
            daysLabel="Days after the due date"
            onDays={(value) => patch({ invoice_reminder_days: value })}
            email={form.invoice_reminder_email}
            sms={form.invoice_reminder_sms}
            onEmail={(value) => patch({ invoice_reminder_email: value })}
            onSms={(value) => patch({ invoice_reminder_sms: value })}
            template={form.invoice_reminder_template}
            onTemplate={(value) => patch({ invoice_reminder_template: value })}
          />
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Upcoming visit</p>
            <p className="text-xs text-muted-foreground">
              How far ahead is set under Scheduling → Automatic appointment reminders. These switches choose email, text, or both.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.visit_email_enabled} onCheckedChange={(v) => patch({ visit_email_enabled: v === true })} />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.visit_sms_enabled} onCheckedChange={(v) => patch({ visit_sms_enabled: v === true })} />
              Text
            </label>
            <Textarea value={form.visit_template} onChange={(e) => patch({ visit_template: e.target.value })} />
          </div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save reminders"}
          </Button>
        </form>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Recently sent</p>
          {(log ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
          {(log ?? []).map((entry) => (
            <div key={entry.id} className="rounded-md border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.created_at)} · {entry.kind.replaceAll("_", " ")} · {entry.channel} · {entry.status}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
              {entry.error && <p className="mt-1 text-xs text-destructive">{entry.error}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelBlock(props: {
  title: string;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  days: number;
  daysLabel: string;
  onDays: (value: number) => void;
  email: boolean;
  sms: boolean;
  onEmail: (value: boolean) => void;
  onSms: (value: boolean) => void;
  template: string;
  onTemplate: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={props.enabled} onCheckedChange={(v) => props.onEnabled(v === true)} />
        {props.title}
      </label>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-1">
          <Label>{props.daysLabel}</Label>
          <Input
            type="number"
            min={0}
            value={props.days}
            onChange={(e) => props.onDays(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={props.email} onCheckedChange={(v) => props.onEmail(v === true)} /> Email
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={props.sms} onCheckedChange={(v) => props.onSms(v === true)} /> Text
          </label>
        </div>
      </div>
      <Textarea value={props.template} onChange={(e) => props.onTemplate(e.target.value)} />
    </div>
  );
}
