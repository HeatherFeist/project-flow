import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { fetchJobPhotosInfo } from "@/lib/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type GalleryData = Awaited<ReturnType<typeof fetchJobPhotosInfo>>;

// Public, no-login page — a link the owner can send a client to see
// progress photos on their job, timeline-style (oldest first).
export default function JobGallery() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchJobPhotosInfo(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load gallery"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">{error ?? "Gallery not found."}</p>
      </div>
    );
  }

  const businessName = data.business?.business_name || "your contractor";

  return (
    <div className="min-h-svh bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <Sparkles className="mx-auto size-6 text-primary" />
          <h1 className="mt-2 text-2xl font-semibold">{data.job.title}</h1>
          <p className="text-muted-foreground">Photos from {businessName}</p>
        </div>

        {data.photos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No photos have been added to this job yet — check back soon.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.photos.map((photo) => (
              <Card key={photo.id} className="overflow-hidden">
                <img src={photo.url} alt={photo.caption ?? "Job photo"} className="w-full object-cover" />
                {(photo.caption || photo.taken_by) && (
                  <CardHeader className="py-3">
                    {photo.caption && <CardTitle className="text-sm font-normal">{photo.caption}</CardTitle>}
                    <p className="text-xs text-muted-foreground">
                      {photo.taken_by ? `${photo.taken_by} · ` : ""}
                      {formatDateTime(photo.created_at)}
                    </p>
                  </CardHeader>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
