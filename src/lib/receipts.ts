import { supabase } from "@/lib/supabase";
import { fileToImageBlobs } from "@/lib/estimateMedia";

// Private bucket (unlike estimate-uploads) — receipts are internal
// financial records, so this stores just the storage path and resolves it
// to a short-lived signed URL for display, rather than a public URL.

export async function uploadReceipt(ownerId: string, invoiceId: string, file: File): Promise<string> {
  const [blob] = await fileToImageBlobs(file);
  const path = `${ownerId}/${invoiceId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("receipts").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function getReceiptSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from("receipts").createSignedUrls(paths, 3600);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export async function deleteReceipt(path: string): Promise<void> {
  const { error } = await supabase.storage.from("receipts").remove([path]);
  if (error) throw error;
}
