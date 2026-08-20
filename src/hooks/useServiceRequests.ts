import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ServiceRequest {
  id: string;
  owner_id: string;
  client_id: string;
  message: string;
  status: "new" | "reviewed";
  created_at: string;
  client?: { id: string; name: string };
}

export function useServiceRequests() {
  return useQuery({
    queryKey: ["service_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*, client:clients(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ServiceRequest[];
    },
  });
}

export function useMarkServiceRequestReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_requests").update({ status: "reviewed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_requests"] });
    },
  });
}
