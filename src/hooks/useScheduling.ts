import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { GoogleConnection, SchedulingSettings } from "@/types/domain";

const DEFAULT_SETTINGS: Omit<SchedulingSettings, "user_id"> = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  work_days: [1, 2, 3, 4, 5],
  work_start_minutes: 480,
  work_end_minutes: 1020,
  slot_duration_minutes: 120,
  booking_horizon_days: 14,
  reminder_hours_before: 24,
};

export function useGoogleConnection(userId: string | undefined) {
  return useQuery({
    queryKey: ["google_connection", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_connections")
        .select("user_id, google_email")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as GoogleConnection | null;
    },
  });
}

export function useSchedulingSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["scheduling_settings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduling_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as SchedulingSettings | null) ?? { user_id: userId!, ...DEFAULT_SETTINGS };
    },
  });
}

export function useSaveSchedulingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: SchedulingSettings) => {
      const { error } = await supabase
        .from("scheduling_settings")
        .upsert({ ...settings, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["scheduling_settings", variables.user_id] });
    },
  });
}

export function useSendQuoteEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-quote-email", {
        body: { quoteId },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
