import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useCreateQuote, useQuotes, useUpdateQuoteStatus } from "@/hooks/useQuotes";
import { useSendQuoteEmail } from "@/hooks/useScheduling";
import type { LineItem, QuoteStatus } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineItemsEditor } from "@/components/LineItemsEditor";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];
const STATUS_VARIANT: Record<QuoteStatus, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "success",
  declined: "warning",
};

export default function Quotes() {
  const { user } = useAuth();
  const { data: quotes, isLoading } = useQuotes();
  const { data: clients } = useClients();
  const createQuote = useCreateQuote();
  const updateStatus = useUpdateQuoteStatus();
  const sendQuoteEmail = useSendQuoteEmail();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !clientId || items.length === 0) return;
    try {
      await createQuote.mutateAsync({
        owner_id: user.id,
        client_id: clientId,
        job_id: null,
        notes: notes || null,
        items,
      });
      toast.success("Quote created");
      setClientId("");
      setNotes("");
      setItems([]);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quote");
    }
  }

  async function handleSend(quoteId: string) {
    try {
      await sendQuoteEmail.mutateAsync(quoteId);
      toast.success("Quote emailed to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send quote email");
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Quote link copied");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quotes</h1>
          <p className="text-muted-foreground">Send estimates and track their status.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!clients || clients.length === 0}>
              <Plus /> New quote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>New quote</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
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
                <Label>Line items</Label>
                <LineItemsEditor items={items} onChange={setItems} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createQuote.isPending || !clientId || items.length === 0}>
                  {createQuote.isPending ? "Saving…" : "Create quote"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (quotes ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No quotes yet.
                  </TableCell>
                </TableRow>
              )}
              {(quotes ?? []).map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    {q.client ? (
                      <Link to={`/clients/${q.client.id}`} className="font-medium hover:underline">
                        {q.client.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatDate(q.created_at)}</TableCell>
                  <TableCell>{formatCurrency(q.total_cents)}</TableCell>
                  <TableCell>
                    <Select
                      value={q.status}
                      onValueChange={(v) => updateStatus.mutate({ id: q.id, status: v as QuoteStatus })}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <Badge variant={STATUS_VARIANT[q.status]} className="border-0 p-0">
                          <SelectValue />
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sendQuoteEmail.isPending || q.status === "accepted" || q.status === "declined"}
                        onClick={() => handleSend(q.id)}
                      >
                        <Mail /> {q.status === "draft" ? "Send" : "Resend"}
                      </Button>
                      <Button variant="ghost" size="icon" title="Copy client link" onClick={() => copyLink(q.accept_token)}>
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
