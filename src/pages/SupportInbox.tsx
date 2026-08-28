import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import {
  useAddTicketReply,
  useAllTickets,
  useTicketReplies,
  useUpdateTicketStatus,
} from "@/hooks/useSupportTickets";
import type { SupportTicket, SupportTicketStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

const STATUS_VARIANT: Record<SupportTicketStatus, "outline" | "warning" | "secondary"> = {
  open: "warning",
  answered: "secondary",
  closed: "outline",
};

// The admin side of the support inbox (see docs/schema_v28_support_inbox.sql
// and app-help-chat's escalate_to_support tool) — only reachable by an
// account with profiles.is_admin set. Every subscriber's escalated
// conversations land here in one place, across owners, since RLS grants
// an admin account read/write on the whole table.
export default function SupportInbox() {
  const { data: tickets, isLoading } = useAllTickets();
  const updateStatus = useUpdateTicketStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("open");

  const filtered = (tickets ?? []).filter((t) => statusFilter === "all" || t.status === statusFilter);
  const selected = (tickets ?? []).find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Support Inbox</h1>
        <p className="text-muted-foreground">
          Conversations the Help Assistant couldn't resolve on its own, across every subscriber.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="lg:h-[calc(100svh-14rem)]">
          <CardContent className="flex h-full flex-col px-0 pb-0">
            <div className="border-b p-3">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SupportTicketStatus | "all")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && <Loader2 className="mx-auto mt-4 size-4 animate-spin text-muted-foreground" />}
              {!isLoading && filtered.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No tickets here.</p>
              )}
              {filtered.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left hover:bg-muted/50 ${
                    selectedId === ticket.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
                    <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {ticket.owner?.business_name || ticket.owner_email || "Unknown business"}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(ticket.created_at)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:h-[calc(100svh-14rem)]">
          <CardContent className="flex h-full flex-col px-0 pb-0">
            {!selected ? (
              <p className="p-6 text-sm text-muted-foreground">Pick a ticket to see the conversation.</p>
            ) : (
              <TicketDetail ticket={selected} onStatusChange={(s) => updateStatus.mutate({ id: selected.id, status: s })} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketDetail({
  ticket,
  onStatusChange,
}: {
  ticket: SupportTicket;
  onStatusChange: (status: SupportTicketStatus) => void;
}) {
  const { data: replies } = useTicketReplies(ticket.id);
  const addReply = useAddTicketReply();
  const [message, setMessage] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      await addReply.mutateAsync({ ticketId: ticket.id, author: "support", body: message.trim() });
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{ticket.subject}</p>
          <p className="text-xs text-muted-foreground">
            {ticket.owner?.business_name || ticket.owner_email} · {formatDateTime(ticket.created_at)}
          </p>
        </div>
        <Select value={ticket.status} onValueChange={(v) => onStatusChange(v as SupportTicketStatus)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            What led to this ticket (from the Help Assistant chat):
          </p>
          <div className="space-y-2">
            {ticket.transcript.map((m, i) => (
              <p key={i} className={m.role === "user" ? "font-medium" : "text-muted-foreground"}>
                {m.role === "user" ? "Them: " : "Bot: "}
                {m.content}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {(replies ?? []).map((reply) => (
            <div key={reply.id} className={`flex ${reply.author === "support" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 ${
                  reply.author === "support" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {reply.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Reply — the owner will see this next time they open Support…"
          disabled={addReply.isPending}
        />
        <Button type="submit" size="icon" disabled={addReply.isPending || !message.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
