import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TwilioSettings } from "@/types/domain";

export function useTwilioSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["twilio_settings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("twilio_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as TwilioSettings | null;
    },
  });
}

export function useSaveTwilioSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      user_id: string;
      twilio_phone_number: string;
      forward_to_phone: string | null;
      missed_call_message?: string;
    }) => {
      const { error } = await supabase
        .from("twilio_settings")
        .upsert({ ...settings, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["twilio_settings", variables.user_id] });
    },
  });
}

export function useSendJobReminder() {
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-job-reminder", {
        body: { jobId },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}
