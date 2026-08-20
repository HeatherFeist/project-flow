import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useDeleteJob, useJobs } from "@/hooks/useJobs";
import type { JobStatus } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { ImportJobsDialog } from "@/components/ImportJobsDialog";
import { NewJobDialog } from "@/components/NewJobDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

const STATUS_VARIANT: Record<JobStatus, "secondary" | "success" | "warning" | "outline"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "outline",
};

export default function Schedule() {
  const { data: jobs, isLoading } = useJobs();
  const deleteJob = useDeleteJob();
  const [search, setSearch] = useState("");

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs ?? [];
    return (jobs ?? []).filter((job) =>
      [job.title, job.client?.name, job.address, job.status].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [jobs, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-muted-foreground">Every job, past and upcoming.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportJobsDialog />
          <NewJobDialog />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search jobs by title, client, address, status…"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (jobs ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No jobs scheduled yet.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (jobs ?? []).length > 0 && filteredJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No jobs match "{search}".
                  </TableCell>
                </TableRow>
              )}
              {filteredJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link to={`/schedule/${job.id}`} className="font-medium hover:underline">
                      {job.title}
                    </Link>
                  </TableCell>
                  <TableCell>{job.client?.name ?? "—"}</TableCell>
                  <TableCell>{formatDateTime(job.scheduled_at)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[job.status]}>{job.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <DeleteButton
                      itemLabel={job.title}
                      onConfirm={async () => {
                        try {
                          await deleteJob.mutateAsync(job.id);
                          toast.success("Job deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to delete job");
                        }
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
