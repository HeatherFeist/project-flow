import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Job, JobNote, JobStatus } from "@/types/domain";

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, client:clients(id, name)")
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as unknown as Job[];
    },
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ["jobs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, client:clients(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Job;
    },
  });
}

export function useJobNotes(jobId: string | undefined) {
  return useQuery({
    queryKey: ["jobs", jobId, "notes"],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_notes")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as JobNote[];
    },
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<Job, "client_id" | "title" | "description" | "status" | "scheduled_at" | "address"> & {
        owner_id: string;
      },
    ) => {
      const { data, error } = await supabase.from("jobs").insert(input).select().single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { data, error } = await supabase
        .from("jobs")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useAddJobNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, note }: { jobId: string; note: string }) => {
      const { data, error } = await supabase
        .from("job_notes")
        .insert({ job_id: jobId, note })
        .select()
        .single();
      if (error) throw error;
      return data as JobNote;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.jobId, "notes"] });
    },
  });
}
