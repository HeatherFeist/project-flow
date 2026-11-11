import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useTeamMembers } from "@/hooks/useTeamAccounts";
import { useAssignJob, useClockIn, useClockOut, useSaveSeriesAndGenerate, useTimeEntries } from "@/hooks/useRecurrence";
import type { Job } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

export function JobCrewCard({ job }: { job: Job }) {
  const { user } = useAuth();
  const { ownerId, isAdmin } = useTeam();
  const { data: members } = useTeamMembers(ownerId);
  const assign = useAssignJob();
  const saveSeries = useSaveSeriesAndGenerate();
  const { data: entries } = useTimeEntries(job.id);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "custom">("weekly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [weekdays, setWeekdays] = useState<number[]>([new Date().getDay()]);
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [untilDate, setUntilDate] = useState("");
  const [duration, setDuration] = useState("60");
  const [assignee, setAssignee] = useState(job.assigned_to ?? "unassigned");

  const openEntry = (entries ?? []).find((entry) => entry.user_id === user?.id && !entry.clock_out);
  const crew = [
    ...(ownerId ? [{ id: ownerId, label: "Owner" }] : []),
    ...(members ?? [])
      .filter((member) => member.user_id && member.status === "active")
      .map((member) => ({ id: member.user_id as string, label: member.email })),
  ];

  async function saveAssignment(value: string) {
    setAssignee(value);
    try {
      await assign.mutateAsync({ id: job.id, assignedTo: value === "unassigned" ? null : value });
      toast.success("Assignment saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  async function makeRecurring(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await saveSeries.mutateAsync({
        job,
        assignedTo: assignee === "unassigned" ? null : assignee,
        durationMinutes: Number(duration) || null,
        recurrence: {
          cadence,
          intervalCount: Number(intervalCount) || 1,
          weekdays,
          dayOfMonth: Number(dayOfMonth) || null,
          startDate,
          untilDate: untilDate || null,
        },
      });
      toast.success(
        result.created === 0 ? "Schedule saved. Those visits already exist." : `Added ${result.created} upcoming visits`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create the schedule");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Crew and repeat visits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        {isAdmin && (
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select value={assignee} onValueChange={saveAssignment}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {crew.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Time on this visit</p>
          {(entries ?? []).length === 0 && <p className="text-sm text-muted-foreground">No clock-ins yet.</p>}
          {(entries ?? []).map((entry) => (
            <p key={entry.id} className="text-sm text-muted-foreground">
              In {formatDateTime(entry.clock_in)}
              {entry.clock_out ? ` · Out ${formatDateTime(entry.clock_out)}` : " · Still clocked in"}
            </p>
          ))}
          {user && (
            openEntry ? (
              <Button
                size="sm"
                variant="outline"
                disabled={clockOut.isPending}
                onClick={() => clockOut.mutate({ id: openEntry.id, jobId: job.id })}
              >
                Clock out
              </Button>
            ) : (
              <Button size="sm" disabled={clockIn.isPending} onClick={() => clockIn.mutate({ job, userId: user.id })}>
                Clock in
              </Button>
            )
          )}
        </div>

        {isAdmin && (
          <form onSubmit={makeRecurring} className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Repeat this job</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>How often</Label>
                <Select value={cadence} onValueChange={(value) => setCadence(value as typeof cadence)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Every N days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{cadence === "custom" ? "Every N days" : "Every N"}</Label>
                <Input type="number" min={1} value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Length (minutes)</Label>
                <Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>
            {cadence === "weekly" && (
              <div className="flex flex-wrap gap-2 text-sm">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => (
                  <label key={label} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={weekdays.includes(index)}
                      onChange={() =>
                        setWeekdays((current) =>
                          current.includes(index) ? current.filter((day) => day !== index) : [...current, index],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {cadence === "monthly" && (
              <div className="space-y-1">
                <Label>Day of month</Label>
                <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>First date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Last date (optional)</Label>
                <Input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saveSeries.isPending}>
              {saveSeries.isPending ? "Saving…" : "Save and add the next 60 days"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
