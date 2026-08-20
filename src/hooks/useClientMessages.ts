import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ClientMessage } from "@/types/domain";

export function useClientMessages(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_messages", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientMessage[];
    },
  });
}
