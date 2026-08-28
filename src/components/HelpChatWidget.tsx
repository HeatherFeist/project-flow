import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, HelpCircle, Loader2, Mic, MicOff, Send, X } from "lucide-react";
import { useHelpChat } from "@/hooks/useHelpChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { ChatMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportTicketsPanel } from "@/components/SupportTicketsPanel";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  escalated?: boolean;
}

const WELCOME =
  "Hi! I can help you find your way around Project Flow, or answer general renovation/repair questions. If I can't help with something, I'll send it to our support team for you. What do you need?";

// Renders "[label](/path)" as an in-app <Link>, "[label](https://...)" as a
// normal link, and everything else as plain text — enough for the help
// assistant's replies without pulling in a full markdown renderer.
function renderWithLinks(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return <Fragment key={i}>{part}</Fragment>;
    const [, label, href] = match;
    if (href.startsWith("/")) {
      return (
        <Link key={i} to={href} className="font-medium underline underline-offset-2">
          {label}
        </Link>
      );
    }
    return (
      <a key={i} href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
        {label}
      </a>
    );
  });
}

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "support">("chat");
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([
    { role: "assistant", text: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const helpChat = useHelpChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition((transcript) => setInput(transcript));

  useEffect(() => {
    if (open && tab === "chat") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [displayMessages, helpChat.isPending, open, tab]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || helpChat.isPending) return;

    setInput("");
    setDisplayMessages((prev) => [...prev, { role: "user", text }]);
    const nextMessages: ChatMessage[] = [...apiMessages, { role: "user", content: text }];

    try {
      const result = await helpChat.mutateAsync(nextMessages);
      setApiMessages([...nextMessages, { role: "assistant", content: result.reply }]);
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: result.reply, escalated: result.escalated }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        title="Help & support"
        className="fixed bottom-5 right-5 z-50 size-12 rounded-full shadow-lg"
      >
        <HelpCircle className="size-5" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-5 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col shadow-xl">
      <CardHeader className="flex-row items-center justify-between gap-2 border-b py-3">
        <div className="flex items-center gap-1">
          <CardTitle
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 text-sm",
              tab === "chat" ? "bg-secondary" : "text-muted-foreground",
            )}
            onClick={() => setTab("chat")}
          >
            Help &amp; Q&amp;A
          </CardTitle>
          <CardTitle
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 text-sm",
              tab === "support" ? "bg-secondary" : "text-muted-foreground",
            )}
            onClick={() => setTab("support")}
          >
            Support
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)} title="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>

      {tab === "support" ? (
        <SupportTicketsPanel />
      ) : (
        <>
          <CardContent ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-3">
            {displayMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.escalated
                        ? "border border-success/40 bg-success/10 text-foreground"
                        : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.escalated && (
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-success">
                      <CheckCircle2 className="size-3.5" /> Sent to support
                    </p>
                  )}
                  {renderWithLinks(m.text)}
                </div>
              </div>
            ))}
            {helpChat.isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-secondary px-3 py-2">
                  <Loader2 className="size-4 animate-spin text-secondary-foreground" />
                </div>
              </div>
            )}
            {speech.error && <p className="text-center text-xs text-destructive">{speech.error}</p>}
          </CardContent>
          <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
            {speech.supported && (
              <Button
                type="button"
                variant={speech.listening ? "destructive" : "outline"}
                size="icon"
                title={speech.listening ? "Stop recording" : "Speak instead of typing"}
                disabled={helpChat.isPending}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
              >
                {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={speech.listening ? "Listening…" : "Ask anything…"}
              disabled={helpChat.isPending}
            />
            <Button type="submit" size="icon" disabled={helpChat.isPending || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
