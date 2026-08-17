import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Mic, MicOff, Send, Sparkles } from "lucide-react";
import { sendEstimateChatMessage, type ChatMessage } from "@/lib/functions";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
}

export default function EstimateChat() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [searchParams] = useSearchParams();
  // ?embed=1 — for dropping this page into an <iframe> on another site:
  // fills its container instead of centering as a full standalone page.
  const embedded = searchParams.get("embed") === "1";
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      text: "Hi! I can give you a rough, no-obligation estimate and help schedule a free in-person visit. What do you need done?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition((transcript) => setInput(transcript));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [displayMessages, sending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !ownerId || sending) return;

    const userText = input.trim();
    setInput("");
    setError(null);
    setDisplayMessages((prev) => [...prev, { role: "user", text: userText }]);
    setSending(true);

    const nextApiMessages: ChatMessage[] = [...apiMessages, { role: "user", content: userText }];

    try {
      const result = await sendEstimateChatMessage(ownerId, nextApiMessages);
      setApiMessages(result.messages);
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!ownerId) return null;

  return (
    <div
      className={
        embedded ? "flex h-svh flex-col" : "flex min-h-svh items-center justify-center p-4"
      }
    >
      <Card
        className={cn(
          "flex flex-col",
          embedded ? "h-full w-full flex-1 rounded-none border-none" : "h-[80vh] w-full max-w-lg",
        )}
      >
        <CardHeader className="flex-row items-center gap-2 border-b pb-4">
          <Sparkles className="size-5 text-primary" />
          <CardTitle className="text-base">Get a quick estimate</CardTitle>
        </CardHeader>
        <CardContent ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-4">
          {displayMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-secondary px-3 py-2">
                <Loader2 className="size-4 animate-spin text-secondary-foreground" />
              </div>
            </div>
          )}
          {(error || speech.error) && (
            <p className="text-center text-sm text-destructive">{error || speech.error}</p>
          )}
        </CardContent>
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
          {speech.supported && (
            <Button
              type="button"
              variant={speech.listening ? "destructive" : "outline"}
              size="icon"
              title={speech.listening ? "Stop recording" : "Speak instead of typing"}
              disabled={sending}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
            >
              {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={speech.listening ? "Listening…" : "Type a message…"}
            disabled={sending}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
