import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAddTicketReply, useMyTickets, useTicketReplies } from "@/hooks/useSupportTickets";
import type { SupportTicket, SupportTicketStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

const STATUS_VARIANT: Record<SupportTicketStatus, "outline" | "warning" | "secondary"> = {
  open: "warning",
  answered: "secondary",
  closed: "outline",
};

// The owner-facing side of the support inbox — lives inside the Help
// Chat widget as a second tab. Read-only history plus a way to add a
// follow-up message; an admin's reply here shows up the same way (see
// docs/schema_v28_support_inbox.sql / src/pages/SupportInbox.tsx for the
// admin side).
export function SupportTicketsPanel() {
  const { user } = useAuth();
  const { data: tickets, isLoading } = useMyTickets(user?.id);
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  if (selected) {
    return <TicketThread ticket={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto py-3">
      {isLoading && <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />}
      {!isLoading && (tickets ?? []).length === 0 && (
        <p className="px-3 text-sm text-muted-foreground">
          Nothing here yet — if the chat assistant can't help with something, it'll offer to send it to
          support, and it'll show up in this list.
        </p>
      )}
      {(tickets ?? []).map((ticket) => (
        <button
          key={ticket.id}
          type="button"
          onClick={() => setSelected(ticket)}
          className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left hover:bg-muted/50"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{ticket.subject}</p>
            <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTime(ticket.created_at)}</p>
        </button>
      ))}
    </div>
  );
}

function TicketThread({ ticket, onBack }: { ticket: SupportTicket; onBack: () => void }) {
  const { data: replies } = useTicketReplies(ticket.id);
  const addReply = useAddTicketReply();
  const [message, setMessage] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      await addReply.mutateAsync({ ticketId: ticket.id, author: "owner", body: message.trim() });
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ticket.subject}</p>
          <Badge variant={STATUS_VARIANT[ticket.status]} className="mt-0.5">
            {ticket.status}
          </Badge>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        <p className="text-xs text-muted-foreground">Sent {formatDateTime(ticket.created_at)}</p>
        {(replies ?? []).map((reply) => (
          <div key={reply.id} className={`flex ${reply.author === "owner" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${
                reply.author === "owner" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {reply.body}
            </div>
          </div>
        ))}
        {(replies ?? []).length === 0 && (
          <p className="text-muted-foreground">No replies yet — we'll get back to you here.</p>
        )}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add more detail…"
          disabled={addReply.isPending}
        />
        <Button type="submit" size="icon" disabled={addReply.isPending || !message.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
