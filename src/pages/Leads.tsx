import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, PlusCircle } from "lucide-react";
import { useLeads } from "@/hooks/useLeads";
import { useMarkServiceRequestReviewed, useServiceRequests } from "@/hooks/useServiceRequests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { ClientSource } from "@/types/domain";

const SOURCE_LABEL: Record<ClientSource, string> = {
  manual: "Added manually",
  import: "CSV import",
  missed_call: "Missed call",
  inbound_text: "New text",
  chatbot: "Estimate chatbot",
};

export default function Leads() {
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: requests, isLoading: requestsLoading } = useServiceRequests();
  const markReviewed = useMarkServiceRequestReviewed();

  const newLeads = (leads ?? []).filter((l) => !l.converted);
  const convertedLeads = (leads ?? []).filter((l) => l.converted);
  const newRequests = (requests ?? []).filter((r) => r.status === "new");
  const reviewedRequests = (requests ?? []).filter((r) => r.status === "reviewed");

  async function handleMarkReviewed(id: string) {
    try {
      await markReviewed.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leads &amp; Requests</h1>
        <p className="text-muted-foreground">
          Everyone who's reached out but isn't a job yet — missed calls, new texts, chatbot conversations,
          and existing clients asking for more work.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New leads</CardTitle>
          <CardDescription>
            Captured automatically from missed calls, inbound texts, and the estimate chatbot. Once a lead
            has a job or quote, it moves to "Already converted" below.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {leadsLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : newLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new leads waiting on you right now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {newLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link to={`/clients/${lead.id}`} className="font-medium hover:underline">
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">{SOURCE_LABEL[lead.source]}</Badge>
                    </TableCell>
                    <TableCell>{lead.phone ?? lead.email ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(lead.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/clients/${lead.id}`}>
                          <PlusCircle /> Follow up
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service requests from clients</CardTitle>
          <CardDescription>
            "I'd also like…" requests an existing client submitted from their client portal. Doesn't create
            a quote automatically — that's your call on scope and price.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {requestsLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : newRequests.length === 0 && reviewedRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...newRequests, ...reviewedRequests].map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      {req.client ? (
                        <Link to={`/clients/${req.client.id}`} className="font-medium hover:underline">
                          {req.client.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">{req.message}</TableCell>
                    <TableCell>{formatDateTime(req.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={req.status === "new" ? "warning" : "secondary"}>
                        {req.status === "new" ? "New" : "Reviewed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "new" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={markReviewed.isPending}
                          onClick={() => handleMarkReviewed(req.id)}
                        >
                          Mark reviewed
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {convertedLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Already converted</CardTitle>
            <CardDescription>Leads that already have at least one job or quote on the books.</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {convertedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link to={`/clients/${lead.id}`} className="font-medium hover:underline">
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{SOURCE_LABEL[lead.source]}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(lead.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/clients/${lead.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
