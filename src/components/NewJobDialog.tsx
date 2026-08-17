import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useCreateJobWithCalendarSync } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Formats a Date as the value a <input type="datetime-local"> expects,
// in local time (not UTC) — used to prefill from a clicked calendar day.
function toLocalDateTimeInput(date: Date, hour = 9): string {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NewJobDialogProps {
  /** Controlled open state — pass when opening from outside (e.g. a calendar day click). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Prefills the date/time field, e.g. from a clicked calendar day. */
  initialDate?: Date;
  /** Hides the built-in trigger button — use when you're opening this dialog programmatically. */
  hideTrigger?: boolean;
}

export function NewJobDialog({ open, onOpenChange, initialDate, hideTrigger }: NewJobDialogProps) {
  const { user } = useAuth();
  const { data: clients } = useClients();
  const createJob = useCreateJobWithCalendarSync();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [form, setForm] = useState({
    client_id: "",
    title: "",
    description: "",
    address: "",
    scheduled_at: initialDate ? toLocalDateTimeInput(initialDate) : "",
  });

  useEffect(() => {
    if (initialDate) {
      setForm((f) => ({ ...f, scheduled_at: toLocalDateTimeInput(initialDate) }));
    }
  }, [initialDate]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.client_id) return;
    try {
      const result = await createJob.mutateAsync({
        client_id: form.client_id,
        title: form.title,
        description: form.description || null,
        address: form.address || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      });
      toast.success(
        result.calendarSynced ? "Job scheduled and added to your Google Calendar" : "Job scheduled",
      );
      setForm({ client_id: "", title: "", description: "", address: "", scheduled_at: "" });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create job");
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button disabled={!clients || clients.length === 0}>
            <Plus /> New job
          </Button>
        </DialogTrigger>
      )}
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
            <p className="text-xs text-muted-foreground">
              If Google Calendar is connected in Settings, this also creates the event on your
              calendar with an email reminder.
            </p>
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
  );
}
