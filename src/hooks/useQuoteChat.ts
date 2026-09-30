import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import type { ChatMessage } from "@/lib/functions";
import type { LineItem } from "@/types/domain";

export interface QuoteChatProposal {
  items: LineItem[];
  notes: string;
}

interface QuoteChatResponse {
  reply: string;
  messages: ChatMessage[];
  proposal: { items: { scope_of_work: string; quantity: number; unit_price: number; estimated_hours: number }[]; notes: string } | null;
}

// The conversational counterpart to useGenerateQuoteDraft — same
// pricing logic (Price Book first, Unit Cost Method fallback, detailed
// scope + hours per line), but back-and-forth instead of one shot. See
// supabase/functions/quote-chat.
export function useSendQuoteChatMessage() {
  return useMutation({
    mutationFn: async (messages: ChatMessage[]) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<QuoteChatResponse>("quote-chat", {
        body: { messages },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to send message");
      }

      const proposal: QuoteChatProposal | null = data.proposal
        ? {
            items: data.proposal.items.map((i) => ({
              id: crypto.randomUUID(),
              description: i.scope_of_work,
              quantity: i.quantity,
              unit_price_cents: Math.round(i.unit_price * 100),
              estimated_hours: i.estimated_hours,
            })),
            notes: data.proposal.notes,
          }
        : null;

      return { reply: data.reply, messages: data.messages, proposal };
    },
  });
}
