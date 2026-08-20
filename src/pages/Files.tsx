import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export default function Files() {
  const { user } = useAuth();
  const { data, isLoading } = useMediaLibrary(user?.id);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();

  const photos = useMemo(
    () =>
      (data?.photos ?? []).filter(
        (p) => !q || p.jobTitle.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q),
      ),
    [data, q],
  );
  const receipts = useMemo(
    () => (data?.receipts ?? []).filter((r) => !q || r.clientName?.toLowerCase().includes(q)),
    [data, q],
  );
  const visualizations = useMemo(
    () =>
      (data?.visualizations ?? []).filter(
        (v) => !q || v.clientName?.toLowerCase().includes(q) || v.prompt.toLowerCase().includes(q),
      ),
    [data, q],
  );

  const isEmpty = !isLoading && photos.length === 0 && receipts.length === 0 && visualizations.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Files &amp; Media</h1>
        <p className="text-muted-foreground">
          Every job photo, receipt, and AI project visualization in one browsable place.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job or client…"
          className="pl-8"
        />
      </div>

      {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {isEmpty && <p className="text-sm text-muted-foreground">No files match yet.</p>}

      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Job photos ({photos.length})</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {photos.map((photo) => (
                <Link
                  key={photo.id}
                  to={`/schedule/${photo.jobId}`}
                  className="group block overflow-hidden rounded-md border"
                >
                  <img src={photo.url} alt={photo.caption ?? photo.jobTitle} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium group-hover:underline">{photo.jobTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {photo.clientName ?? "—"} · {formatDate(photo.createdAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {receipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receipts ({receipts.length})</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {receipts.map((receipt) => (
                <Link
                  key={receipt.path}
                  to={`/invoices/${receipt.invoiceId}`}
                  className="group block overflow-hidden rounded-md border"
                >
                  <img src={receipt.url} alt="Receipt" className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium group-hover:underline">
                      {receipt.clientName ?? "Invoice"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {visualizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI project visualizations ({visualizations.length})</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {visualizations.map((viz) => (
                <Link
                  key={viz.id}
                  to={`/quotes/${viz.quoteId}`}
                  className="group block overflow-hidden rounded-md border"
                >
                  <img src={viz.url} alt={viz.prompt} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium group-hover:underline">
                      {viz.clientName ?? "Quote"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(viz.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
