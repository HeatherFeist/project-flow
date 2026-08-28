import { supabase } from "@/lib/supabase";

// Public bucket (docs/schema_v27_business_logo.sql) — the logo has to
// render on public, no-login pages (the quote page, the invoice pay
// page, the client portal), so profiles.logo_url stores the full public
// URL directly, same pattern as job photos.
//
// Deliberately NOT run through the same JPEG re-encode pipeline as job
// photos/receipts (estimateMedia.ts's compressImage) — that would flatten
// a transparent-background PNG logo to a solid rectangle. Logos are
// small enough that skipping compression doesn't matter, and preserving
// the original format (including transparency) matters a lot more here.
//
// SVG is allowed since a lot of small businesses only have a vector
// logo — safe here because it's only ever rendered via <img src>, which
// browsers sandbox (no script execution), never inlined into the page.

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from("business-logos").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadLogo(ownerId: string, file: File): Promise<{ url: string; path: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Please upload a PNG, JPEG, WebP, or SVG image.");
  }
  const ext = file.name.split(".").pop() || "png";
  const path = `${ownerId}/logo-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("business-logos").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return { url: publicUrlFor(path), path };
}

export async function deleteLogoFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from("business-logos").remove([path]);
  if (error) throw error;
}
