import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageSquareText, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDeleteQuote,
  useDeleteQuoteVisualization,
  useGenerateQuoteVisualization,
  useQuote,
  useQuoteVisualizations,
  useUpdateQuoteStatus,
} from "@/hooks/useQuotes";
import { useSendQuoteEmail } from "@/hooks/useScheduling";
import { useSendQuoteSms } from "@/hooks/useTwilio";
import { fileToImageBlobs, blobToBase64 } from "@/lib/estimateMedia";
import type { QuoteStatus } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { SubcontractorsCard } from "@/components/SubcontractorsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];
const STATUS_VARIANT: Record<QuoteStatus, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "success",
  declined: "warning",
};

interface PickedImage {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

async function pickImage(file: File): Promise<PickedImage> {
  const [blob] = await fileToImageBlobs(file);
  const base64 = await blobToBase64(blob);
  return { file, previewUrl: URL.createObjectURL(blob), base64, mimeType: "image/jpeg" };
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuote(id);
  const { data: visualizations } = useQuoteVisualizations(id);
  const updateStatus = useUpdateQuoteStatus();
  const deleteQuote = useDeleteQuote();
  const sendQuoteEmail = useSendQuoteEmail();
  const sendQuoteSms = useSendQuoteSms();
  const generateViz = useGenerateQuoteVisualization();
  const deleteViz = useDeleteQuoteVisualization();

  const [baseImage, setBaseImage] = useState<PickedImage | null>(null);
  const [refImages, setRefImages] = useState<PickedImage[]>([]);
  const [prompt, setPrompt] = useState("");
  const baseInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    if (!id) return;
    try {
      await sendQuoteEmail.mutateAsync(id);
      toast.success("Quote emailed to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send quote email");
    }
  }

  async function handleSendSms() {
    if (!id) return;
    try {
      await sendQuoteSms.mutateAsync(id);
      toast.success("Quote texted to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to text the quote");
    }
  }

  function copyLink() {
    if (!quote) return;
    navigator.clipboard.writeText(`${window.location.origin}/q/${quote.accept_token}`);
    toast.success("Quote link copied");
  }

  async function handleBaseImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBaseImage(await pickImage(file));
  }

  async function handleRefImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const picked = await Promise.all(files.map(pickImage));
    setRefImages((prev) => [...prev, ...picked]);
  }

  async function handleGenerate() {
    if (!id || !baseImage || !prompt.trim()) return;
    try {
      await generateViz.mutateAsync({
        quoteId: id,
        prompt: prompt.trim(),
        baseImage: { base64: baseImage.base64, mimeType: baseImage.mimeType },
        referenceImages: refImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
      });
      toast.success("Visualization generated");
      setBaseImage(null);
      setRefImages([]);
      setPrompt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate visualization");
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!quote) return <p className="text-muted-foreground">Quote not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/quotes" className="text-sm text-muted-foreground hover:underline">
          ← Quotes
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            Quote for {quote.client ? (
              <Link to={`/clients/${quote.client.id}`} className="hover:underline">
                {quote.client.name}
              </Link>
            ) : (
              "—"
            )}
          </h1>
          <div className="flex items-center gap-2">
            <Select
              value={quote.status}
              onValueChange={(v) => updateStatus.mutate({ id: quote.id, status: v as QuoteStatus })}
            >
              <SelectTrigger className="w-32">
                <Badge variant={STATUS_VARIANT[quote.status]} className="border-0 p-0">
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
            <Button
              variant="outline"
              size="sm"
              disabled={sendQuoteEmail.isPending || quote.status === "accepted" || quote.status === "declined"}
              onClick={handleSend}
            >
              <Mail /> {quote.status === "draft" ? "Send" : "Resend"} email
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                sendQuoteSms.isPending ||
                !quote.client?.phone ||
                quote.status === "accepted" ||
                quote.status === "declined"
              }
              title={quote.client?.phone ? undefined : "This client has no phone number on file"}
              onClick={handleSendSms}
            >
              <MessageSquareText /> {quote.status === "draft" ? "Text" : "Re-text"}
            </Button>
            <Button variant="outline" size="icon" title="Copy client link" onClick={copyLink}>
              <Copy className="size-4" />
            </Button>
            <DeleteButton
              itemLabel={`quote for ${quote.client?.name ?? "this client"}`}
              onConfirm={async () => {
                try {
                  await deleteQuote.mutateAsync(quote.id);
                  toast.success("Quote deleted");
                  navigate("/quotes");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete quote");
                }
              }}
            />
          </div>
        </div>
        <p className="text-muted-foreground">Total {formatCurrency(quote.total_cents)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Line items</CardTitle>
        </CardHeader>
        <CardContent className="divide-y pb-6">
          {(quote.items ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {item.description} <span className="text-muted-foreground">×{item.quantity}</span>
              </span>
              <span>{formatCurrency(item.quantity * item.unit_price_cents)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {quote.id && <SubcontractorsCard quoteId={quote.id} mode="edit" />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project visualization</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a photo of the space plus any product/material photos, describe the changes, and
            generate an "after" image the client sees right on this quote.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Before photo</p>
              {baseImage ? (
                <div className="relative w-fit">
                  <img src={baseImage.previewUrl} alt="Before" className="h-32 rounded-md border object-cover" />
                  <button
                    type="button"
                    onClick={() => setBaseImage(null)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => baseInputRef.current?.click()}>
                  Upload photo
                </Button>
              )}
              <input ref={baseInputRef} type="file" accept="image/*" className="hidden" onChange={handleBaseImage} />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">Reference photos (tile, flooring, fixtures…)</p>
              <div className="flex flex-wrap gap-2">
                {refImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.previewUrl} alt="Reference" className="size-16 rounded-md border object-cover" />
                    <button
                      type="button"
                      onClick={() => setRefImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => refInputRef.current?.click()}>
                  Add
                </Button>
              </div>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleRefImages}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">What should change?</p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Replace the white subway tile with the tile in the reference photo, replace the flooring with the LVP shown, and swap the light fixture and mirror for the ones shown.'
              className="min-h-20"
            />
          </div>

          <Button onClick={handleGenerate} disabled={!baseImage || !prompt.trim() || generateViz.isPending}>
            {generateViz.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Wand2 /> Generate visualization
              </>
            )}
          </Button>

          {visualizations && visualizations.length > 0 && (
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              {visualizations.map((viz) => (
                <div key={viz.id} className="space-y-1.5">
                  <div className="relative">
                    <img src={viz.result_url} alt="Visualization" className="w-full rounded-md border object-cover" />
                    <button
                      type="button"
                      onClick={() => deleteViz.mutate(viz)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                      title="Delete"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{viz.prompt}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(viz.created_at)}</p>
                </div>
              ))}
              <p className="col-span-full flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" /> Automatically shown to the client on this quote's link.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
