import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// supabase-js's functions.invoke() gives a generic "Edge Function returned
// a non-2xx status code" message on failure — the actual { error: "..." }
// JSON body our functions return is on error.context (the raw Response),
// not surfaced automatically. This pulls the real message out so toasts
// are actually diagnosable instead of always saying the same generic
// thing.
export async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // Response body wasn't JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatJobWhen(job: { scheduled_at: string | null; ends_at?: string | null }) {
  if (!job.scheduled_at) return "Unscheduled";
  const start = formatDateTime(job.scheduled_at);
  if (!job.ends_at) return start;
  const end = new Date(job.ends_at);
  if (Number.isNaN(end.getTime())) return start;
  const endLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(end);
  return `${start} – ${endLabel}`;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
