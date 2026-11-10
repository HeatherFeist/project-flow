import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useSyncJobCalendar } from "@/hooks/useJobs";
import type { Job } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LABEL: Record<NonNullable<Job["calendar_sync_status"]>, string> = {
  synced: "Synced",
  failed: "Failed",
  not_connected: "Not connected",
};

export function CalendarSyncCard({ job }: { job: Job }) {
  const sync = useSyncJobCalendar();
  const status = job.calendar_sync_status;

  async function retry() {
    try {
      const result = await sync.mutateAsync(job.id);
      if (result?.status === "failed") {
        toast.error(result.error || "Google Calendar didn't update");
      } else if (result?.status === "not_connected") {
        toast.error("Google Calendar isn't connected");
      } else {
        toast.success("Calendar updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync calendar");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Google Calendar</CardTitle>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {status ? LABEL[status] : "Not synced"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 pb-6 text-sm">
        {status === "synced" && job.google_event_url && (
          <a
            href={job.google_event_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open calendar event <ExternalLink className="size-3.5" />
          </a>
        )}
        {status === "synced" && !job.google_event_url && (
          <p className="text-muted-foreground">Synced. This job has no calendar event because it has no start time.</p>
        )}
        {status === "failed" && (
          <p className="text-muted-foreground">{job.calendar_sync_error || "The last update didn't reach Google Calendar."}</p>
        )}
        {status === "not_connected" && (
          <p className="text-muted-foreground">
            Google Calendar isn't connected.{" "}
            <Link to="/settings" className="text-primary hover:underline">
              Connect it in Settings
            </Link>
            .
          </p>
        )}
        {!status && (
          <p className="text-muted-foreground">This job hasn't been sent to Google Calendar yet.</p>
        )}
        {status !== "not_connected" && (
          <Button variant="outline" size="sm" onClick={retry} disabled={sync.isPending}>
            <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
            {sync.isPending ? "Syncing…" : "Retry sync"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
