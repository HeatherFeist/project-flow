export interface RecurrenceInput {
  cadence: "weekly" | "monthly" | "custom";
  intervalCount: number;
  weekdays: number[];
  dayOfMonth: number | null;
  startDate: string;
  untilDate: string | null;
}

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Dates a repeating schedule should visit, through `horizon` (and until_date when set). */
export function visitDates(input: RecurrenceInput, horizon: Date): string[] {
  const start = parseDate(input.startDate);
  const until = input.untilDate ? parseDate(input.untilDate) : horizon;
  const end = until < horizon ? until : horizon;
  const interval = Math.max(1, input.intervalCount);
  const dates: string[] = [];

  if (input.cadence === "custom") {
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + interval)) {
      dates.push(isoDate(cursor));
    }
    return dates;
  }

  if (input.cadence === "monthly") {
    const day = input.dayOfMonth ?? start.getDate();
    let monthIndex = 0;
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
      if (monthIndex % interval === 0) {
        const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        const visit = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, dim));
        if (visit >= start && visit <= end) dates.push(isoDate(visit));
      }
      monthIndex++;
    }
    return dates;
  }

  const weekdays = input.weekdays.length > 0 ? input.weekdays : [start.getDay()];
  const originWeek = startOfWeek(start).getTime();
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const weeks = Math.floor((startOfWeek(cursor).getTime() - originWeek) / (7 * 24 * 60 * 60 * 1000));
    if (weeks % interval === 0 && weekdays.includes(cursor.getDay())) dates.push(isoDate(cursor));
  }
  return dates;
}

export function visitStart(date: string, hour = 9) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hour, 0, 0, 0);
}
