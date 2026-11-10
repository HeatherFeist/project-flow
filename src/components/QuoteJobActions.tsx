import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuoteStatus } from "@/types/domain";

interface QuoteJobActionsProps {
  status: QuoteStatus;
  job: { id: string; scheduled_at: string | null } | null | undefined;
  /** False while the job lookup is still in flight, so "Create job" doesn't flash. */
  ready: boolean;
  pending?: boolean;
  onCreate: () => void;
  layout?: "banner" | "compact";
}

export function QuoteJobActions({
  status,
  job,
  ready,
  pending,
  onCreate,
  layout = "banner",
}: QuoteJobActionsProps) {
  if (status !== "accepted" || !ready) return null;

  if (layout === "compact") {
    if (job) {
      return (
        <Button variant="link" size="sm" className="h-auto px-0" asChild>
          <Link to={`/schedule/${job.id}`}>View job</Link>
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={onCreate}>
        {pending ? "Creating…" : "Create job"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-secondary/40 px-3 py-3">
      <div className="text-sm">
        {job ? (
          <>
            <p className="font-medium">This quote has a job.</p>
            <p className="text-muted-foreground">
              {job.scheduled_at
                ? "It's on the schedule."
                : "It's on the schedule, waiting for a date. Set a time on the job, or the client can pick one from their quote link."}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Create a job for this quote.</p>
            <p className="text-muted-foreground">
              Quotes accepted from now on get a job automatically. This adds one for a quote that was accepted earlier.
            </p>
          </>
        )}
      </div>
      {job ? (
        <Button variant="outline" size="sm" asChild>
          <Link to={`/schedule/${job.id}`}>
            <CalendarDays /> View job
          </Link>
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={onCreate}>
          {pending ? "Creating…" : "Create job"}
        </Button>
      )}
    </div>
  );
}
