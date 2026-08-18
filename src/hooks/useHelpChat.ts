import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/functions";

// The in-app help assistant (site navigation + general renovation
// questions) — distinct from the public estimate chatbot. Auth required,
// so this goes through supabase-js (which attaches the session) rather
// than the plain-fetch helpers in lib/functions.ts.
export function useHelpChat() {
  return useMutation({
    mutationFn: async (messages: ChatMessage[]) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ reply: string }>("app-help-chat", {
        body: { messages },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw error;
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to reach the help assistant");
      }
      return data;
    },
  });
}
