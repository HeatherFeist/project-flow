import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Image as ImageIcon, Loader2, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { sendEstimateChatMessage, type ChatMessage } from "@/lib/functions";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { blobToBase64, fileToImageBlobs, uploadEstimateImage } from "@/lib/estimateMedia";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  imageUrls?: string[];
}

interface PendingImage {
  url: string;
  base64: string;
}

// Keeps the resent conversation from growing unbounded with base64 image
// data on every turn — once Claude has seen a photo, its reply already
// captures what it learned in text, so older image blocks are replaced
// with a placeholder rather than re-sent every turn.
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
      text: "Hi! I can give you a rough, no-obligation estimate and help schedule a free in-person visit. What do you need done? You can also attach a photo or video of the project.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechRecognition((transcript) => setInput(transcript));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [displayMessages, sending, uploading]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !ownerId) return;

    setUploading(true);
    setError(null);
    try {
      const blobs = await fileToImageBlobs(file);
      const uploaded: PendingImage[] = [];
      for (const blob of blobs) {
        const [url, base64] = await Promise.all([uploadEstimateImage(ownerId, blob), blobToBase64(blob)]);
        uploaded.push({ url, base64 });
      }
      setPendingImages((prev) => [...prev, ...uploaded]);
      setPhotoUrls((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process that file — try a different photo.");
    } finally {
      setUploading(false);
    }
  }

  function removePendingImage(url: string) {
    setPendingImages((prev) => prev.filter((img) => img.url !== url));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || !ownerId || sending) return;

    setInput("");
    setError(null);
    const imagesToSend = pendingImages;
    setPendingImages([]);
    setDisplayMessages((prev) => [
      ...prev,
      { role: "user", text, imageUrls: imagesToSend.map((i) => i.url) },
    ]);
    setSending(true);

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
      const result = await sendEstimateChatMessage(ownerId, nextApiMessages, photoUrls);
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
                className={`max-w-[80%] space-y-2 rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {m.imageUrls && m.imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.imageUrls.map((url) => (
                      <img key={url} src={url} alt="Attached" className="h-20 w-20 rounded object-cover" />
                    ))}
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              </div>
            </div>
          ))}
          {(sending || uploading) && (
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

        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t px-3 pt-3">
            {pendingImages.map((img) => (
              <div key={img.url} className="relative">
                <img src={img.url} alt="Ready to send" className="size-14 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => removePendingImage(img.url)}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  title="Remove"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className={cn("flex items-center gap-2 p-3", pendingImages.length === 0 && "border-t")}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Attach a photo or video"
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="size-4" />
          </Button>
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
          <Button type="submit" size="icon" disabled={sending || uploading || (!input.trim() && pendingImages.length === 0)}>
            <Send className="size-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
