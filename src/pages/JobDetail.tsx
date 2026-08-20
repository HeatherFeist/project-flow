import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Copy, Loader2, MessageSquare, PenLine, Star, Trash2 } from "lucide-react";
import { useAddJobNote, useDeleteJob, useJob, useJobNotes, useUpdateJobStatus } from "@/hooks/useJobs";
import {
  useAddJobPhoto,
  useDeleteJobPhoto,
  useJobPhotos,
  usePreviousPhotoTakers,
  useReplaceJobPhotoImage,
  useUpdateJobPhoto,
} from "@/hooks/useJobPhotos";
import { useAuth } from "@/contexts/AuthContext";
import { useSendJobReminder, useSendReviewRequest } from "@/hooks/useTwilio";
import type { JobPhoto, JobStatus } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteButton } from "@/components/DeleteButton";
import { PhotoAnnotator } from "@/components/PhotoAnnotator";
import { JobChecklistCard } from "@/components/JobChecklistCard";
import { JobCostingCard } from "@/components/JobCostingCard";
import { formatDateTime } from "@/lib/utils";

const STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: job, isLoading } = useJob(id);
  const { data: notes } = useJobNotes(id);
  const { data: photos } = useJobPhotos(id);
  const { data: previousTakers } = usePreviousPhotoTakers(user?.id);
  const updateStatus = useUpdateJobStatus();
  const addNote = useAddJobNote();
  const deleteJob = useDeleteJob();
  const sendReminder = useSendJobReminder();
  const sendReviewRequest = useSendReviewRequest();
  const addPhoto = useAddJobPhoto();
  const deletePhoto = useDeleteJobPhoto();
  const updatePhoto = useUpdateJobPhoto();
  const replacePhotoImage = useReplaceJobPhotoImage();
  const [note, setNote] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [takenBy, setTakenBy] = useState("");
  const [annotating, setAnnotating] = useState<JobPhoto | null>(null);
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
    if (files.length === 0 || !user || !id) return;
    setUploadingCount(files.length);
    let failures = 0;
    for (const file of files) {
      try {
        await addPhoto.mutateAsync({ ownerId: user.id, jobId: id, file, takenBy: takenBy.trim() || null });
      } catch {
        failures++;
      }
      setUploadingCount((n) => n - 1);
    }
    if (failures > 0) toast.error(`${failures} photo${failures === 1 ? "" : "s"} failed to upload`);
  }

  async function handleDeletePhoto(photo: JobPhoto) {
    try {
      await deletePhoto.mutateAsync(photo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  function copyGalleryLink() {
    if (!job) return;
    navigator.clipboard.writeText(`${window.location.origin}/job-gallery/${job.photo_share_token}`);
    toast.success("Gallery link copied — safe to text or email the client");
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
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">Photos</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={takenBy}
              onChange={(e) => setTakenBy(e.target.value)}
              placeholder="Taken by (optional)"
              list="photo-takers"
              className="h-8 w-40 text-xs"
            />
            <datalist id="photo-takers">
              {(previousTakers ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {(photos ?? []).length > 0 && (
              <Button variant="outline" size="sm" onClick={copyGalleryLink} title="Copy a shareable link for the client">
                <Copy className="size-3.5" /> Share gallery
              </Button>
            )}
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
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          {(!photos || photos.length === 0) && (
            <p className="text-sm text-muted-foreground">
              No photos yet — snap before/during/after shots as you work the job.
            </p>
          )}
          {(photos ?? []).map((photo) => (
            <div key={photo.id} className="group relative w-28">
              <div className="relative">
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt="Job" className="size-28 rounded-md border object-cover" />
                </a>
                <button
                  type="button"
                  onClick={() => setAnnotating(photo)}
                  className="absolute -left-1.5 -top-1.5 rounded-full bg-secondary p-1 text-secondary-foreground opacity-0 shadow group-hover:opacity-100"
                  title="Mark up photo"
                >
                  <PenLine className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(photo)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 shadow group-hover:opacity-100"
                  title="Remove photo"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <input
                defaultValue={photo.caption ?? ""}
                placeholder="Caption…"
                onBlur={(e) => {
                  const value = e.target.value.trim() || null;
                  if (value !== photo.caption) {
                    updatePhoto.mutate({ id: photo.id, jobId: photo.job_id, caption: value });
                  }
                }}
                className="mt-1 w-full rounded border-none bg-transparent px-0.5 text-xs text-muted-foreground focus:outline-none"
              />
              {photo.taken_by && <p className="truncate px-0.5 text-[10px] text-muted-foreground">{photo.taken_by}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      {job.photo_urls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Photos from the estimate chat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pb-6">
            {job.photo_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="From estimate chat" className="size-24 rounded-md border object-cover" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {annotating && (
        <PhotoAnnotator
          imageUrl={annotating.url}
          saving={replacePhotoImage.isPending}
          onCancel={() => setAnnotating(null)}
          onSave={async (blob) => {
            if (!user) return;
            try {
              await replacePhotoImage.mutateAsync({ photo: annotating, ownerId: user.id, blob });
              toast.success("Photo updated");
              setAnnotating(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to save markup");
            }
          }}
        />
      )}

      {user && <JobChecklistCard jobId={job.id} ownerId={user.id} />}

      {user && <JobCostingCard jobId={job.id} ownerId={user.id} quoteId={job.quote_id} />}

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
