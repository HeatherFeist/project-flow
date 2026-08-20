import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { resolveClientIds } from "@/lib/importClientMatching";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import { deleteJobPhoto, uploadJobPhoto } from "@/lib/jobPhotos";
import type { Job, JobNote, JobStatus } from "@/types/domain";

export interface JobImportRow {
  clientName: string;
  clientEmail: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  scheduledAt: string | null;
  address: string | null;
}

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

// Creates a job via the create-job edge function instead of a direct table
// insert — it also pushes a matching event (with an email reminder) onto
// the owner's Google Calendar when Google is connected and a time is set,
// so scheduling from inside Project Flow behaves like the client-facing
// booking flow does.
export function useCreateJobWithCalendarSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      title: string;
      description: string | null;
      address: string | null;
      scheduled_at: string | null;
    }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<{ job: Job; calendarSynced: boolean }>(
        "create-job",
        { body: input, headers: { Authorization: `Bearer ${sessionData.session?.access_token}` } },
      );
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (!data || (data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error?: string })?.error ?? "Failed to create job");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useImportJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, rows }: { ownerId: string; rows: JobImportRow[] }) => {
      const clientIds = await resolveClientIds(
        ownerId,
        rows.map((r) => ({ name: r.clientName, email: r.clientEmail })),
      );

      const records = rows
        .map((row, i) => {
          const client_id = clientIds[i];
          if (!client_id || !row.title) return null;
          return {
            owner_id: ownerId,
            client_id,
            title: row.title,
            description: row.description,
            status: row.status,
            scheduled_at: row.scheduledAt,
            address: row.address,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const CHUNK_SIZE = 200;
      let imported = 0;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("jobs").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
      }
      return { imported, skipped: rows.length - imported };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
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

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
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

// Job-site photo capture (CompanyCam-style — unlimited photos per job,
// snapped by the owner, not just what a customer attaches via the
// estimate chatbot). One file per call so the UI can show per-photo
// upload progress when adding several at once.
export function useAddJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, job, file }: { ownerId: string; job: Job; file: File }) => {
      const url = await uploadJobPhoto(ownerId, job.id, file);
      const { error } = await supabase
        .from("jobs")
        .update({ photo_urls: [...job.photo_urls, url] })
        .eq("id", job.id);
      if (error) throw error;
      return url;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.job.id] });
    },
  });
}

export function useDeleteJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ job, url }: { job: Job; url: string }) => {
      await deleteJobPhoto(url);
      const { error } = await supabase
        .from("jobs")
        .update({ photo_urls: job.photo_urls.filter((u) => u !== url) })
        .eq("id", job.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", variables.job.id] });
    },
  });
}
