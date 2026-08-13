import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAddJobNote, useJob, useJobNotes, useUpdateJobStatus } from "@/hooks/useJobs";
import type { JobStatus } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

const STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useJob(id);
  const { data: notes } = useJobNotes(id);
  const updateStatus = useUpdateJobStatus();
  const addNote = useAddJobNote();
  const [note, setNote] = useState("");

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!job) return <p className="text-muted-foreground">Job not found.</p>;

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim() || !id) return;
    try {
      await addNote.mutateAsync({ jobId: id, note });
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/schedule" className="text-sm text-muted-foreground hover:underline">
          ← Schedule
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <Select
            value={job.status}
            onValueChange={(v) => updateStatus.mutate({ id: job.id, status: v as JobStatus })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-muted-foreground">
          {job.client && (
            <Link to={`/clients/${job.client.id}`} className="hover:underline">
              {job.client.name}
            </Link>
          )}
          {" · "}
          {formatDateTime(job.scheduled_at)}
          {job.address ? ` · ${job.address}` : ""}
        </p>
      </div>

      {job.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent className="pb-6 text-sm text-muted-foreground">{job.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <form onSubmit={handleAddNote} className="flex gap-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this job…"
              className="min-h-10"
            />
            <Button type="submit" disabled={addNote.isPending}>
              Add
            </Button>
          </form>
          <div className="space-y-2">
            {(notes ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
            {(notes ?? []).map((n) => (
              <div key={n.id} className="rounded-md border px-3 py-2 text-sm">
                <p>{n.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
