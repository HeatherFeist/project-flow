import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useJobs } from "@/hooks/useJobs";
import { useClockIn, useClockOut, useTimeEntries } from "@/hooks/useRecurrence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { Job } from "@/types/domain";

function sameLocalDay(value: string | null, day: Date) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function VisitRow({ job, userId }: { job: Job; userId: string }) {
  const { data: entries } = useTimeEntries(job.id);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const open = (entries ?? []).find((entry) => entry.user_id === userId && !entry.clock_out);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div>
        <Link to={`/schedule/${job.id}`} className="font-medium hover:underline">
          {job.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {job.client?.name ?? "Client"} · {job.scheduled_at ? formatDateTime(job.scheduled_at) : "Unscheduled"}
          {job.address ? ` · ${job.address}` : ""}
        </p>
      </div>
      {open ? (
        <Button size="sm" variant="outline" disabled={clockOut.isPending} onClick={() => clockOut.mutate({ id: open.id, jobId: job.id })}>
          Clock out
        </Button>
      ) : (
        <Button size="sm" disabled={clockIn.isPending} onClick={() => clockIn.mutate({ job, userId })}>
          Clock in
        </Button>
      )}
    </div>
  );
}

export default function MyDay() {
  const { user } = useAuth();
  const { data: jobs, isLoading } = useJobs();
  const today = new Date();
  const mine = (jobs ?? []).filter(
    (job) => user && job.assigned_to === user.id && job.status !== "cancelled" && sameLocalDay(job.scheduled_at, today),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My day</h1>
        <p className="text-muted-foreground">Visits assigned to you today.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-6">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && mine.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing assigned to you today.</p>
          )}
          {user && mine.map((job) => <VisitRow key={job.id} job={job} userId={user.id} />)}
          {mine.some((job) => job.status === "in_progress") && <Badge variant="warning">In progress</Badge>}
        </CardContent>
      </Card>
    </div>
  );
}
