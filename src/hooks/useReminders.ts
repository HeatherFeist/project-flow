import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ReminderSettings {
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

export interface ReminderLogEntry {
  id: string;
  kind: string;
  channel: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
}

export const REMINDER_DEFAULTS: Omit<ReminderSettings, "owner_id"> = {
  quote_followup_enabled: false,
  quote_followup_days: 3,
  quote_followup_email: true,
  quote_followup_sms: false,
  quote_followup_template:
    "Hi {client_name}, just checking in on your quote from {business_name}. You can review it here: {link}",
  invoice_reminder_enabled: false,
  invoice_reminder_days: 1,
  invoice_reminder_email: true,
  invoice_reminder_sms: false,
  invoice_reminder_template:
    "Hi {client_name}, your invoice from {business_name} for {amount} is past due. You can pay here: {link}",
  visit_email_enabled: false,
  visit_sms_enabled: true,
  visit_template: 'Reminder from {business_name}: "{job}" is scheduled for {when}.',
};

export function useReminderSettings(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["reminder_settings", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("reminder_settings").select("*").eq("owner_id", ownerId!).maybeSingle();
      if (error) throw error;
      return data as ReminderSettings | null;
    },
  });
}

export function useReminderLog(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["reminder_log", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminder_log")
        .select("id, kind, channel, body, status, error, created_at")
        .eq("owner_id", ownerId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ReminderLogEntry[];
    },
  });
}

export function useSaveReminderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: ReminderSettings) => {
      const { error } = await supabase.from("reminder_settings").upsert(settings);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reminder_settings", variables.owner_id] });
    },
  });
}
