import { useState } from "react";
import { toast } from "sonner";
import { useUpdateJob } from "@/hooks/useJobs";
import { toDateTimeLocalValue } from "@/lib/utils";
import type { Job } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditJobCardProps {
  job: Job;
}

function hoursBetween(start: string, end: string): string {
  if (!start || !end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const hours = ms / 3_600_000;
  return String(Math.round(hours * 4) / 4);
}

export function EditJobCard({ job }: EditJobCardProps) {
  const updateJob = useUpdateJob();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? "");
  const [address, setAddress] = useState(job.address ?? "");
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocalValue(job.scheduled_at));
  const [endsAt, setEndsAt] = useState(toDateTimeLocalValue(job.ends_at));

  function beginEdit() {
    setTitle(job.title);
    setDescription(job.description ?? "");
    setAddress(job.address ?? "");
    setScheduledAt(toDateTimeLocalValue(job.scheduled_at));
    setEndsAt(toDateTimeLocalValue(job.ends_at));
    setEditing(true);
  }

  function setDurationHours(raw: string) {
    if (!scheduledAt || !raw) {
      setEndsAt("");
      return;
    }
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const start = new Date(scheduledAt);
    setEndsAt(toDateTimeLocalValue(new Date(start.getTime() + hours * 3_600_000)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const start = scheduledAt ? new Date(scheduledAt) : null;
    const end = endsAt ? new Date(endsAt) : null;
    if (start && end && end <= start) {
      toast.error("The end time has to be after the start.");
      return;
    }
    try {
      await updateJob.mutateAsync({
        id: job.id,
        title: title.trim(),
        description: description.trim() || null,
        address: address.trim() || null,
        scheduled_at: start ? start.toISOString() : null,
        ends_at: end ? end.toISOString() : null,
      });
      toast.success("Job updated");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update job");
    }
  }

  if (!editing) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={beginEdit}>
          Edit job
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Edit job</CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start</Label>
              <Input
                id="edit-start"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End</Label>
              <Input id="edit-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-duration">Duration (hours)</Label>
            <Input
              id="edit-duration"
              type="number"
              min="0.25"
              step="0.25"
              placeholder="e.g. 2"
              value={hoursBetween(scheduledAt, endsAt)}
              onChange={(e) => setDurationHours(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave the start empty to keep the job unscheduled. Duration fills in the end time.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={updateJob.isPending || !title.trim()}>
              {updateJob.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
