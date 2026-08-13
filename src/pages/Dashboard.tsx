import { Link } from "react-router-dom";
import { CalendarDays, FileText, Receipt, Users } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useJobs } from "@/hooks/useJobs";
import { useQuotes } from "@/hooks/useQuotes";
import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function Dashboard() {
  const { data: clients } = useClients();
  const { data: jobs } = useJobs();
  const { data: quotes } = useQuotes();
  const { data: invoices } = useInvoices();

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

      <Card>
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
  );
}
