import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { JobChecklistItem } from "@/types/domain";

export function useJobChecklist(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job_checklist_items", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_checklist_items")
        .select("*")
        .eq("job_id", jobId)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data as JobChecklistItem[];
    },
  });
}

export function useAddChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, jobId, text, position }: { ownerId: string; jobId: string; text: string; position: number }) => {
      const { error } = await supabase
        .from("job_checklist_items")
        .insert({ owner_id: ownerId, job_id: jobId, text, position });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_checklist_items", variables.jobId] });
    },
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, jobId, done }: { id: string; jobId: string; done: boolean }) => {
      const { error } = await supabase.from("job_checklist_items").update({ done }).eq("id", id);
      if (error) throw error;
      return jobId;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_checklist_items", variables.jobId] });
    },
  });
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; jobId: string }) => {
      const { error } = await supabase.from("job_checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_checklist_items", variables.jobId] });
    },
  });
}
