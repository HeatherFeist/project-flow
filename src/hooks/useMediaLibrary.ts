import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getReceiptSignedUrls } from "@/lib/receipts";

export interface LibraryPhoto {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
  jobId: string;
  jobTitle: string;
  clientName: string | null;
}

export interface LibraryReceipt {
  invoiceId: string;
  path: string;
  url: string;
  clientName: string | null;
}

export interface LibraryVisualization {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  quoteId: string;
  clientName: string | null;
}

// Pulls together every photo/file already scattered across jobs,
// invoices, and quotes into one browsable library — no new storage,
// just a unified read over what's already there.
export function useMediaLibrary(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["media_library", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const [photosRes, invoicesRes, vizRes] = await Promise.all([
        supabase
          .from("job_photos")
          .select("id, url, caption, created_at, job_id, job:jobs(title, client:clients(name))")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("invoices")
          .select("id, receipt_paths, client:clients(name)")
          .eq("owner_id", ownerId),
        supabase
          .from("quote_visualizations")
          .select("id, result_url, prompt, created_at, quote_id, quote:quotes(client:clients(name))")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (photosRes.error) throw photosRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (vizRes.error) throw vizRes.error;

      // deno-lint-ignore no-explicit-any
      const photos: LibraryPhoto[] = (photosRes.data ?? []).map((p: any) => ({
        id: p.id,
        url: p.url,
        caption: p.caption,
        createdAt: p.created_at,
        jobId: p.job_id,
        jobTitle: p.job?.title ?? "Untitled job",
        clientName: p.job?.client?.name ?? null,
      }));

      const allPaths = (invoicesRes.data ?? []).flatMap((inv) => inv.receipt_paths as string[]);
      const signedUrls = await getReceiptSignedUrls(allPaths);
      const receipts: LibraryReceipt[] = (invoicesRes.data ?? []).flatMap((inv) =>
        (inv.receipt_paths as string[])
          .filter((path) => signedUrls[path])
          .map((path) => ({
            invoiceId: inv.id,
            path,
            url: signedUrls[path],
            // deno-lint-ignore no-explicit-any
            clientName: (inv as any).client?.name ?? null,
          })),
      );

      // deno-lint-ignore no-explicit-any
      const visualizations: LibraryVisualization[] = (vizRes.data ?? []).map((v: any) => ({
        id: v.id,
        url: v.result_url,
        prompt: v.prompt,
        createdAt: v.created_at,
        quoteId: v.quote_id,
        clientName: v.quote?.client?.name ?? null,
      }));

      return { photos, receipts, visualizations };
    },
  });
}
