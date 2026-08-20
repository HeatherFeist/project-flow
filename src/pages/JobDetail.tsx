import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Loader2, MessageSquare, Star, Trash2 } from "lucide-react";
import {
  useAddJobNote,
  useAddJobPhoto,
  useDeleteJob,
  useDeleteJobPhoto,
  useJob,
  useJobNotes,
  useUpdateJobStatus,
} from "@/hooks/useJobs";
import { useAuth } from "@/contexts/AuthContext";
import { useSendJobReminder, useSendReviewRequest } from "@/hooks/useTwilio";
import type { JobStatus } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteButton } from "@/components/DeleteButton";
import { formatDateTime } from "@/lib/utils";

const STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: job, isLoading } = useJob(id);
  const { data: notes } = useJobNotes(id);
  const updateStatus = useUpdateJobStatus();
  const addNote = useAddJobNote();
  const deleteJob = useDeleteJob();
  const sendReminder = useSendJobReminder();
  const sendReviewRequest = useSendReviewRequest();
  const addPhoto = useAddJobPhoto();
  const deletePhoto = useDeleteJobPhoto();
  const [note, setNote] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handleSendReminder() {
    if (!id) return;
    try {
      await sendReminder.mutateAsync(id);
      toast.success("Reminder texted to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminder");
    }
  }

  async function handleSendReviewRequest() {
    if (!id) return;
    try {
      const result = await sendReviewRequest.mutateAsync(id);
      toast.success(result.channel === "sms" ? "Review request texted to the client" : "Review request emailed to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send review request");
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!job) return <p className="text-muted-foreground">Job not found.</p>;

  async function handlePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !user || !job) return;
    setUploadingCount(files.length);
    let failures = 0;
    for (const file of files) {
      try {
        await addPhoto.mutateAsync({ ownerId: user.id, job, file });
      } catch {
        failures++;
      }
      setUploadingCount((n) => n - 1);
    }
    if (failures > 0) toast.error(`${failures} photo${failures === 1 ? "" : "s"} failed to upload`);
  }

  async function handleDeletePhoto(url: string) {
    if (!job) return;
    try {
      await deletePhoto.mutateAsync({ job, url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

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
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              disabled={sendReminder.isPending || !job.scheduled_at}
              onClick={handleSendReminder}
              title={job.scheduled_at ? "Text an appointment reminder to the client" : "Schedule a time first"}
            >
              <MessageSquare /> Text reminder
            </Button>
            {job.status === "completed" && (
              <Button
                variant="outline"
                size="sm"
                disabled={sendReviewRequest.isPending}
                onClick={handleSendReviewRequest}
                title="Send the client a direct link to leave a Google review"
              >
                <Star /> Request review
              </Button>
            )}
            <DeleteButton
              itemLabel={job.title}
              onConfirm={async () => {
                try {
                  await deleteJob.mutateAsync(job.id);
                  toast.success("Job deleted");
                  navigate("/schedule");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete job");
                }
              }}
            />
          </div>
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Photos</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={uploadingCount > 0}
            onClick={() => photoInputRef.current?.click()}
          >
            {uploadingCount > 0 ? (
              <>
                <Loader2 className="animate-spin" /> Uploading {uploadingCount}…
              </>
            ) : (
              <>
                <Camera /> Add photos
              </>
            )}
          </Button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotosSelected}
          />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pb-6">
          {job.photo_urls.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No photos yet — snap before/during/after shots as you work the job.
            </p>
          )}
          {job.photo_urls.map((url) => (
            <div key={url} className="group relative">
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Job" className="size-24 rounded-md border object-cover" />
              </a>
              <button
                type="button"
                onClick={() => handleDeletePhoto(url)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                title="Remove photo"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

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
