import { supabase } from "@/lib/supabase";
import { fileToImageBlobs } from "@/lib/estimateMedia";

// Public bucket (like estimate-uploads) — job photos are meant to be easy
// to share with a client later. Only the owning user can add/remove
// files (see docs/schema_v15_job_photos.sql / v16), but reads don't need
// a session, so job_photos.url stores the full public URL directly.

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadJobPhoto(
  ownerId: string,
  jobId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const [blob] = await fileToImageBlobs(file);
  return uploadJobPhotoBlob(ownerId, jobId, blob);
}

/** Same as uploadJobPhoto but for an already-compressed blob (used to save an annotated photo). */
export async function uploadJobPhotoBlob(
  ownerId: string,
  jobId: string,
  blob: Blob,
): Promise<{ url: string; path: string }> {
  const path = `${ownerId}/${jobId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("job-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return { url: publicUrlFor(path), path };
}

export async function deleteJobPhotoFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from("job-photos").remove([path]);
  if (error) throw error;
}
