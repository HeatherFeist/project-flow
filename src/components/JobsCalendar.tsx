import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Job } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function JobsCalendar({ jobs, onDayClick }: { jobs: Job[]; onDayClick?: (date: Date) => void }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const jobsByDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.scheduled_at) continue;
      const key = dayKey(new Date(job.scheduled_at));
      map.set(key, [...(map.get(key) ?? []), job]);
    }
    return map;
  }, [jobs]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{monthLabel}</p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const dayJobs = jobsByDay.get(dayKey(date)) ?? [];
          const isToday = dayKey(date) === dayKey(today);
          return (
            <div
              key={i}
              role={onDayClick ? "button" : undefined}
              tabIndex={onDayClick ? 0 : undefined}
              onClick={onDayClick ? () => onDayClick(date) : undefined}
              className={cn(
                "min-h-16 rounded-md border p-1 text-xs",
                isToday && "border-primary",
                onDayClick && "cursor-pointer hover:bg-accent/50",
              )}
              title={onDayClick ? "Click to schedule a job on this day" : undefined}
            >
              <span className={cn("text-muted-foreground", isToday && "font-semibold text-foreground")}>
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayJobs.slice(0, 2).map((job) => (
                  <Link
                    key={job.id}
                    to={`/schedule/${job.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate rounded bg-secondary px-1 py-0.5 text-secondary-foreground hover:bg-secondary/80"
                    title={job.title}
                  >
                    {job.title}
                  </Link>
                ))}
                {dayJobs.length > 2 && (
                  <p className="text-muted-foreground">+{dayJobs.length - 2} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
