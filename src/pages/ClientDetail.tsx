import { Link, useParams } from "react-router-dom";
import { useClient } from "@/hooks/useClients";
import { useJobs } from "@/hooks/useJobs";
import { useQuotes } from "@/hooks/useQuotes";
import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading } = useClient(id);
  const { data: jobs } = useJobs();
  const { data: quotes } = useQuotes();
  const { data: invoices } = useInvoices();

  const clientJobs = (jobs ?? []).filter((j) => j.client_id === id);
  const clientQuotes = (quotes ?? []).filter((q) => q.client_id === id);
  const clientInvoices = (invoices ?? []).filter((i) => i.client_id === id);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!client) return <p className="text-muted-foreground">Client not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-sm text-muted-foreground hover:underline">
          ← Clients
        </Link>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-muted-foreground">
          {[client.email, client.phone, client.address].filter(Boolean).join(" · ") || "No contact details on file"}
        </p>
      </div>

      {client.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent className="pb-6 text-sm text-muted-foreground">{client.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-6">
          {clientJobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
          {clientJobs.map((job) => (
            <Link
              key={job.id}
              to={`/schedule/${job.id}`}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
            >
              <span className="font-medium">{job.title}</span>
              <Badge variant="secondary">{job.status.replace("_", " ")}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quotes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {clientQuotes.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {clientQuotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{formatDate(q.created_at)}</span>
                <span className="font-medium">{formatCurrency(q.total_cents)}</span>
                <Badge variant="secondary">{q.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            {clientInvoices.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {clientInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{formatDate(inv.created_at)}</span>
                <span className="font-medium">{formatCurrency(inv.total_cents)}</span>
                <Badge variant={inv.status === "paid" ? "success" : "secondary"}>{inv.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
