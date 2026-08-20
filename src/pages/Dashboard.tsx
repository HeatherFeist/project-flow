import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, FileText, MessageSquareText, Receipt, Users } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useJobs } from "@/hooks/useJobs";
import { useQuotes } from "@/hooks/useQuotes";
import { useInvoices } from "@/hooks/useInvoices";
import { useMarkServiceRequestReviewed, useServiceRequests } from "@/hooks/useServiceRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobsCalendar } from "@/components/JobsCalendar";
import { NewJobDialog } from "@/components/NewJobDialog";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function Dashboard() {
  const { data: clients } = useClients();
  const { data: jobs } = useJobs();
  const { data: quotes } = useQuotes();
  const { data: invoices } = useInvoices();
  const { data: serviceRequests } = useServiceRequests();
  const markReviewed = useMarkServiceRequestReviewed();
  const [newJobDate, setNewJobDate] = useState<Date | null>(null);
  const newRequests = (serviceRequests ?? []).filter((r) => r.status === "new");

  const upcomingJobs = (jobs ?? []).filter(
    (j) => j.status === "scheduled" || j.status === "in_progress",
  );
  const openQuotes = (quotes ?? []).filter((q) => q.status === "sent" || q.status === "draft");
  const unpaidInvoices = (invoices ?? []).filter(
    (i) => i.status !== "paid",
  );
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.total_cents, 0);

  const stats = [
    { label: "Clients", value: clients?.length ?? 0, icon: Users, to: "/clients" },
    { label: "Upcoming jobs", value: upcomingJobs.length, icon: CalendarDays, to: "/schedule" },
    { label: "Open quotes", value: openQuotes.length, icon: FileText, to: "/quotes" },
    {
      label: "Unpaid invoices",
      value: `${unpaidInvoices.length} · ${formatCurrency(unpaidTotal)}`,
      icon: Receipt,
      to: "/invoices",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">A snapshot of your business today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-6">
                <div className="text-2xl font-semibold">{value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {newRequests.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <MessageSquareText className="size-4 text-primary" />
            <CardTitle className="text-sm">
              New requests from clients ({newRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {newRequests.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{r.client?.name ?? "A client"}</p>
                  <p className="text-muted-foreground">{r.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={markReviewed.isPending}
                  onClick={async () => {
                    try {
                      await markReviewed.mutateAsync(r.id);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update");
                    }
                  }}
                >
                  Mark reviewed
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <p className="text-sm text-muted-foreground">Click any day to schedule a job on it.</p>
          </CardHeader>
          <CardContent className="pb-6">
            <JobsCalendar jobs={jobs ?? []} onDayClick={setNewJobDate} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            {upcomingJobs.length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming jobs scheduled.</p>
            )}
            {upcomingJobs.slice(0, 5).map((job) => (
              <Link
                key={job.id}
                to={`/schedule/${job.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
              >
                <div>
                  <p className="font-medium">{job.title}</p>
                  <p className="text-muted-foreground">{job.client?.name}</p>
                </div>
                <div className="text-right">
                  <p>{formatDateTime(job.scheduled_at)}</p>
                  <Badge variant="secondary">{job.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {newJobDate && (
        <NewJobDialog
          open={!!newJobDate}
          onOpenChange={(open) => !open && setNewJobDate(null)}
          initialDate={newJobDate}
          hideTrigger
        />
      )}
    </div>
  );
}
