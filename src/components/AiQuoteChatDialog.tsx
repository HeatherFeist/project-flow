import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useSendQuoteChatMessage, type QuoteChatProposal } from "@/hooks/useQuoteChat";
import { fileToImageBlobs, blobToBase64 } from "@/lib/estimateMedia";
import type { ChatMessage } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  imageCount?: number;
}

interface PendingImage {
  previewUrl: string;
  base64: string;
}

// Keeps the resent conversation from growing unbounded with base64 image
// data every turn — same approach as the public estimate-chat widget.
function stripOldImages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    return {
      ...m,
      content: m.content.map((block) =>
        block.type === "image" ? { type: "text", text: "[Photo shared earlier]" } : block,
      ),
    };
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseDraft: (draft: QuoteChatProposal) => void;
}

export function AiQuoteChatDialog({ open, onOpenChange, onUseDraft }: Props) {
  const sendMessage = useSendQuoteChatMessage();
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      text: "What's the job? Describe it, and attach any photos of the space — I'll ask a couple quick questions if I need to, then start putting a draft together.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [proposal, setProposal] = useState<QuoteChatProposal | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [displayMessages, sendMessage.isPending]);

  useEffect(() => {
    if (!open) {
      setApiMessages([]);
      setDisplayMessages([
        {
          role: "assistant",
          text: "What's the job? Describe it, and attach any photos of the space — I'll ask a couple quick questions if I need to, then start putting a draft together.",
        },
      ]);
      setInput("");
      setPendingImages([]);
      setProposal(null);
    }
  }, [open]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      try {
        const [blob] = await fileToImageBlobs(file);
        const base64 = await blobToBase64(blob);
        setPendingImages((prev) => [...prev, { previewUrl: URL.createObjectURL(blob), base64 }]);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Couldn't process "${file.name}": ${err.message}`
            : `Couldn't process "${file.name}" — try a different photo.`,
        );
      }
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || sendMessage.isPending) return;

    setInput("");
    const imagesToSend = pendingImages;
    setPendingImages([]);
    setDisplayMessages((prev) => [...prev, { role: "user", text, imageCount: imagesToSend.length || undefined }]);

    const content: ChatMessage["content"] = imagesToSend.length
      ? [
          ...imagesToSend.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: img.base64 },
          })),
          ...(text ? [{ type: "text", text }] : []),
        ]
      : text;

    const nextApiMessages: ChatMessage[] = [...stripOldImages(apiMessages), { role: "user", content }];

    try {
      const result = await sendMessage.mutateAsync(nextApiMessages);
      setApiMessages(result.messages);
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: result.reply }]);
      if (result.proposal) setProposal(result.proposal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handleUseDraft() {
    if (!proposal) return;
    onUseDraft(proposal);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" /> Chat with AI to draft this quote
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {displayMessages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {m.text}
                    {m.imageCount ? (
                      <p className={cn("mt-1 text-xs", m.role === "user" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {m.imageCount} photo{m.imageCount === 1 ? "" : "s"} attached
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t px-4 pt-3">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.previewUrl} alt="" className="size-14 rounded-md border object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {proposal && (
              <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 sm:hidden">
                <p className="text-sm">
                  Draft ready: <span className="font-semibold">{formatCurrency(proposal.items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0))}</span>
                </p>
                <Button size="sm" onClick={handleUseDraft}>
                  Use this draft
                </Button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelected} />
              <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon className="size-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe the job, answer a question, or ask for a change…"
                disabled={sendMessage.isPending}
              />
              <Button type="submit" size="icon" disabled={sendMessage.isPending || (!input.trim() && pendingImages.length === 0)}>
                <Send className="size-4" />
              </Button>
            </form>
          </div>

          <div className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l p-4 sm:flex">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Current draft</p>
            {!proposal && <p className="text-sm text-muted-foreground">Nothing yet — keep chatting.</p>}
            {proposal && (
              <div className="space-y-3">
                {proposal.items.map((item) => (
                  <div key={item.id} className="space-y-0.5 border-b pb-2 text-xs">
                    <p className="font-medium leading-snug">{item.description}</p>
                    <p className="text-muted-foreground">
                      Qty {item.quantity} × {formatCurrency(item.unit_price_cents)}
                      {item.estimated_hours ? ` · ~${item.estimated_hours} hrs` : ""}
                    </p>
                  </div>
                ))}
                <p className="text-right text-sm font-semibold">
                  {formatCurrency(proposal.items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0))}
                </p>
                <Button size="sm" className="w-full" onClick={handleUseDraft}>
                  Use this draft
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
