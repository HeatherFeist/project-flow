import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useCreateJob, useJobs } from "@/hooks/useJobs";
import type { JobStatus } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

const STATUS_VARIANT: Record<JobStatus, "secondary" | "success" | "warning" | "outline"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "outline",
};

export default function Schedule() {
  const { user } = useAuth();
  const { data: jobs, isLoading } = useJobs();
  const { data: clients } = useClients();
  const createJob = useCreateJob();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    title: "",
    description: "",
    address: "",
    scheduled_at: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.client_id) return;
    try {
      await createJob.mutateAsync({
        owner_id: user.id,
        client_id: form.client_id,
        title: form.title,
        description: form.description || null,
        address: form.address || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        status: "scheduled",
      });
      toast.success("Job scheduled");
      setForm({ client_id: "", title: "", description: "", address: "", scheduled_at: "" });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create job");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-muted-foreground">Every job, past and upcoming.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!clients || clients.length === 0}>
              <Plus /> New job
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule a job</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Fix leaking faucet"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_at">Date &amp; time</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Job address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createJob.isPending || !form.client_id}>
                  {createJob.isPending ? "Saving…" : "Schedule job"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (jobs ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No jobs scheduled yet.
                  </TableCell>
                </TableRow>
              )}
              {(jobs ?? []).map((job) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
