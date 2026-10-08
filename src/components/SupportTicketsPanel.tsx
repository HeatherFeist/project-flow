import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAddTicketReply, useCreateTicket, useMyTickets, useTicketReplies } from "@/hooks/useSupportTickets";
import type { SupportTicket, SupportTicketStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [composing, setComposing] = useState(false);

  if (selected) {
    return <TicketThread ticket={selected} onBack={() => setSelected(null)} />;
  }

  if (composing) {
    return (
      <NewTicketForm
        onCancel={() => setComposing(false)}
        onCreated={(ticket) => {
          setComposing(false);
          setSelected(ticket);
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-3 py-2">
        <Button type="button" size="sm" className="w-full gap-1.5" onClick={() => setComposing(true)}>
          <Plus className="size-4" /> New ticket
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {isLoading && <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />}
        {!isLoading && (tickets ?? []).length === 0 && (
          <p className="px-3 text-sm text-muted-foreground">
            Nothing here yet — open a ticket above, or if the chat assistant can't help with something,
            it'll offer to send it to support, and it'll show up in this list.
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
    </div>
  );
}

function NewTicketForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const { user } = useAuth();
  const createTicket = useCreateTicket();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    try {
      const ticket = await createTicket.mutateAsync({
        ownerId: user.id,
        ownerEmail: user.email ?? null,
        subject: subject.trim(),
        message: message.trim(),
      });
      onCreated(ticket);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open ticket");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onCancel}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-medium">New support ticket</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject — e.g. Can't connect Stripe"
          disabled={createTicket.isPending}
        />
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's going on…"
          rows={6}
          disabled={createTicket.isPending}
        />
      </div>
      <div className="border-t p-3">
        <Button type="submit" className="w-full gap-1.5" disabled={createTicket.isPending || !subject.trim() || !message.trim()}>
          {createTicket.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send to support
        </Button>
      </div>
    </form>
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
