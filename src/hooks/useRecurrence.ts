import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { visitDates, visitStart, type RecurrenceInput } from "@/lib/recurrence";
import type { Job } from "@/types/domain";

export interface JobSeries extends RecurrenceInput {
  id: string;
  owner_id: string;
  client_id: string;
  title: string;
  description: string | null;
  address: string | null;
  durationMinutes: number | null;
  assignedTo: string | null;
}

export function useAssignJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string | null }) => {
      const { error } = await supabase.from("jobs").update({ assigned_to: assignedTo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useSaveSeriesAndGenerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      job: Job;
      recurrence: RecurrenceInput;
      durationMinutes: number | null;
      assignedTo: string | null;
      horizonDays?: number;
    }) => {
      const { job, recurrence, durationMinutes, assignedTo } = input;
      const row = {
        owner_id: job.owner_id,
        client_id: job.client_id,
        title: job.title,
        description: job.description,
        address: job.address,
        cadence: recurrence.cadence,
        interval_count: recurrence.intervalCount,
        weekdays: recurrence.weekdays,
        day_of_month: recurrence.dayOfMonth,
        start_date: recurrence.startDate,
        until_date: recurrence.untilDate,
        duration_minutes: durationMinutes,
        assigned_to: assignedTo,
        active: true,
      };
      const query = job.series_id
        ? supabase.from("job_series").update(row).eq("id", job.series_id).select("id").single()
        : supabase.from("job_series").insert(row).select("id").single();
      const { data: series, error } = await query;
      if (error) throw error;

      if (!job.series_id) {
        await supabase.from("jobs").update({ series_id: series.id, assigned_to: assignedTo }).eq("id", job.id);
      }

      const horizon = new Date();
      horizon.setDate(horizon.getDate() + (input.horizonDays ?? 60));
      const dates = visitDates(recurrence, horizon);
      const { data: existing, error: existingError } = await supabase
        .from("jobs")
        .select("scheduled_at")
        .eq("series_id", series.id);
      if (existingError) throw existingError;
      const have = new Set(
        (existing ?? [])
          .map((item: { scheduled_at: string | null }) => item.scheduled_at?.slice(0, 10))
          .filter(Boolean),
      );
      const fresh = dates.filter((date) => !have.has(date));
      if (fresh.length > 0) {
        const records = fresh.map((date) => {
          const start = visitStart(date);
          const end = durationMinutes ? new Date(start.getTime() + durationMinutes * 60_000) : null;
          return {
            owner_id: job.owner_id,
            client_id: job.client_id,
            title: job.title,
            description: job.description,
            address: job.address,
            status: "scheduled",
            scheduled_at: start.toISOString(),
            ends_at: end ? end.toISOString() : null,
            assigned_to: assignedTo,
            series_id: series.id,
          };
        });
        const { error: insertError } = await supabase.from("jobs").insert(records);
        if (insertError) throw insertError;
      }
      return { created: fresh.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useTimeEntries(jobId: string | undefined) {
  return useQuery({
    queryKey: ["time_entries", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, user_id, clock_in, clock_out")
        .eq("job_id", jobId!)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return data as { id: string; user_id: string; clock_in: string; clock_out: string | null }[];
    },
  });
}

export function useClockIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ job, userId }: { job: Job; userId: string }) => {
      const { error } = await supabase.from("time_entries").insert({
        owner_id: job.owner_id,
        job_id: job.id,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["time_entries", variables.job.id] }),
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, jobId }: { id: string; jobId: string }) => {
      const { error } = await supabase.from("time_entries").update({ clock_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return jobId;
    },
    onSuccess: (jobId) => queryClient.invalidateQueries({ queryKey: ["time_entries", jobId] }),
  });
}
