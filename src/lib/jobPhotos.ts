import { supabase } from "@/lib/supabase";
import { fileToImageBlobs } from "@/lib/estimateMedia";

// Public bucket (like estimate-uploads) — job photos are meant to be easy
// to share with a client later. Only the owning user can add/remove
// files (see docs/schema_v15_job_photos.sql), but reads don't need a
// session, so photo_urls stores full public URLs directly, same as the
// estimate chatbot's uploads already do.

export async function uploadJobPhoto(ownerId: string, jobId: string, file: File): Promise<string> {
  const [blob] = await fileToImageBlobs(file);
  const path = `${ownerId}/${jobId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("job-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
  return data.publicUrl;
}

/** Deletes a job photo from storage given its public URL (derives the storage path from it). */
export async function deleteJobPhoto(publicUrl: string): Promise<void> {
  const marker = "/object/public/job-photos/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return; // Not a job-photos URL (e.g. an old estimate-uploads photo) — nothing to delete server-side.
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  const { error } = await supabase.storage.from("job-photos").remove([path]);
  if (error) throw error;
}
