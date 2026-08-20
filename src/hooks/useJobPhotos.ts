import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { deleteJobPhotoFile, uploadJobPhoto, uploadJobPhotoBlob } from "@/lib/jobPhotos";
import type { JobPhoto } from "@/types/domain";

export function useJobPhotos(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job_photos", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_photos")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at");
      if (error) throw error;
      return data as JobPhoto[];
    },
  });
}

// Also returns previously-used "taken by" names for this owner, so the
// upload form can offer them as quick suggestions instead of retyping —
// the closest this gets to real team-member tagging without building out
// full multi-user accounts (Project Flow is one login per business today).
export function usePreviousPhotoTakers(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["job_photos_takers", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_photos")
        .select("taken_by")
        .eq("owner_id", ownerId)
        .not("taken_by", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      for (const row of data ?? []) {
        if (row.taken_by) seen.add(row.taken_by);
      }
      return Array.from(seen).slice(0, 10);
    },
  });
}

export function useAddJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ownerId,
      jobId,
      file,
      takenBy,
    }: {
      ownerId: string;
      jobId: string;
      file: File;
      takenBy: string | null;
    }) => {
      const { url, path } = await uploadJobPhoto(ownerId, jobId, file);
      const { error } = await supabase.from("job_photos").insert({
        job_id: jobId,
        owner_id: ownerId,
        url,
        storage_path: path,
        taken_by: takenBy,
      });
      if (error) throw error;
      return url;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_photos", variables.jobId] });
      queryClient.invalidateQueries({ queryKey: ["job_photos_takers", variables.ownerId] });
    },
  });
}

export function useUpdateJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      jobId,
      caption,
      takenBy,
    }: {
      id: string;
      jobId: string;
      caption?: string | null;
      takenBy?: string | null;
    }) => {
      const updates: Record<string, string | null> = {};
      if (caption !== undefined) updates.caption = caption;
      if (takenBy !== undefined) updates.taken_by = takenBy;
      const { error } = await supabase.from("job_photos").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_photos", variables.jobId] });
    },
  });
}

// Saves an annotated version of a photo — uploads the flattened
// (drawn-on) image as a new file, points the existing row at it, and
// cleans up the old file so storage doesn't accumulate orphaned versions.
export function useReplaceJobPhotoImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      photo,
      ownerId,
      blob,
    }: {
      photo: JobPhoto;
      ownerId: string;
      blob: Blob;
    }) => {
      const { url, path } = await uploadJobPhotoBlob(ownerId, photo.job_id, blob);
      const { error } = await supabase
        .from("job_photos")
        .update({ url, storage_path: path })
        .eq("id", photo.id);
      if (error) throw error;
      await deleteJobPhotoFile(photo.storage_path).catch(() => {
        // Non-fatal — the photo's already pointing at the new file either way.
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job_photos", variables.photo.job_id] });
    },
  });
}

export function useDeleteJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: JobPhoto) => {
      await deleteJobPhotoFile(photo.storage_path);
      const { error } = await supabase.from("job_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: (_data, photo) => {
      queryClient.invalidateQueries({ queryKey: ["job_photos", photo.job_id] });
    },
  });
}
