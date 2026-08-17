import { supabase } from "@/lib/supabase";

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;
const VIDEO_FRAME_COUNT = 3;

/** Resizes an image to a max dimension and re-encodes as JPEG, to keep both storage and API payloads small. */
export function compressImage(source: HTMLImageElement | HTMLVideoElement): Promise<Blob> {
  const width = "videoWidth" in source ? source.videoWidth : source.naturalWidth;
  const height = "videoWidth" in source ? source.videoHeight : source.naturalHeight;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not supported"));
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/** Grabs a few evenly-spaced frames from a video file as compressed JPEG blobs — Claude only accepts images, not video. */
async function extractVideoFrames(file: File, count = VIDEO_FRAME_COUNT): Promise<Blob[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });

  const frames: Blob[] = [];
  for (let i = 1; i <= count; i++) {
    const t = (video.duration * i) / (count + 1);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Failed to seek video"));
      video.currentTime = t;
    });
    frames.push(await compressImage(video));
  }

  URL.revokeObjectURL(video.src);
  return frames;
}

/** Turns a file (image or video) into one or more compressed JPEG blobs ready to upload/analyze. */
export async function fileToImageBlobs(file: File): Promise<Blob[]> {
  if (file.type.startsWith("video/")) {
    return extractVideoFrames(file);
  }
  const img = await loadImageFile(file);
  const blob = await compressImage(img);
  URL.revokeObjectURL(img.src);
  return [blob];
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

/** Uploads a compressed image blob to the public estimate-uploads bucket; returns its public URL. */
export async function uploadEstimateImage(ownerId: string, blob: Blob): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("estimate-uploads")
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("estimate-uploads").getPublicUrl(path);
  return data.publicUrl;
}
