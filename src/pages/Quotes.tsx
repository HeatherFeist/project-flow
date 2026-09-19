import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  Eye,
  Kanban,
  Loader2,
  Mail,
  MessageSquareText,
  Plus,
  Search,
  Sparkles,
  Table as TableIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useCreateQuote, useDeleteQuote, useGenerateQuoteDraft, useQuotes, useUpdateQuoteStatus } from "@/hooks/useQuotes";
import { useSendQuoteEmail } from "@/hooks/useScheduling";
import { useSendQuoteSms } from "@/hooks/useTwilio";
import { blobToBase64, fileToImageBlobs } from "@/lib/estimateMedia";
import type { LineItem, QuoteStatus } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { ImportQuotesDialog } from "@/components/ImportQuotesDialog";
import { QuotesPipelineBoard } from "@/components/QuotesPipelineBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const sendQuoteSms = useSendQuoteSms();
  const deleteQuote = useDeleteQuote();
  const generateDraft = useGenerateQuoteDraft();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImages, setAiImages] = useState<{ previewUrl: string; base64: string; mimeType: string }[]>([]);
  const aiImageInputRef = useRef<HTMLInputElement>(null);

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes ?? [];
    return (quotes ?? []).filter((quote) =>
      [quote.client?.name, quote.status, quote.notes].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [quotes, search]);

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
      setAiPrompt("");
      setAiImages([]);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quote");
    }
  }

  async function handleAiImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      const [blob] = await fileToImageBlobs(file);
      const base64 = await blobToBase64(blob);
      setAiImages((prev) => [...prev, { previewUrl: URL.createObjectURL(blob), base64, mimeType: "image/jpeg" }]);
    }
  }

  async function handleGenerateDraft() {
    if (!aiPrompt.trim()) return;
    try {
      const draft = await generateDraft.mutateAsync({
        prompt: aiPrompt.trim(),
        images: aiImages.map((img) => ({ base64: img.base64, mediaType: img.mimeType })),
      });
      setItems(draft.items);
      setNotes(draft.notes);
      toast.success("Draft estimate ready — review and adjust below");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate draft");
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

  async function handleSendSms(quoteId: string) {
    try {
      await sendQuoteSms.mutateAsync(quoteId);
      toast.success("Quote texted to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to text the quote");
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
        <div className="flex items-center gap-2">
          <ImportQuotesDialog />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!clients || clients.length === 0}>
              <Plus /> New quote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New quote</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Sparkles className="size-3.5" /> Draft with AI (optional)
                </Label>
                <Textarea
                  placeholder="Describe the job — e.g. 'Replace two GFCI outlets in the kitchen and patch a small drywall hole in the hallway'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="min-h-16 bg-background"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {aiImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.previewUrl} alt="" className="size-14 rounded-md border object-cover" />
                      <button
                        type="button"
                        onClick={() => setAiImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => aiImageInputRef.current?.click()}>
                    Add photos
                  </Button>
                  <input
                    ref={aiImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAiImages}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    disabled={!aiPrompt.trim() || generateDraft.isPending}
                    onClick={handleGenerateDraft}
                  >
                    {generateDraft.isPending ? (
                      <>
                        <Loader2 className="animate-spin" /> Drafting…
                      </>
                    ) : (
                      <>
                        <Sparkles /> Generate draft
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pulls from your Price Book where it matches, and estimates the rest — review everything below
                  before sending.
                </p>
              </div>

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
                <LineItemsEditor items={items} onChange={setItems} ownerId={user?.id} />
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
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes by client, status, notes…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border p-1">
          <Button
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
          >
            <TableIcon /> List
          </Button>
          <Button
            type="button"
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("board")}
          >
            <Kanban /> Pipeline
          </Button>
        </div>
      </div>

      {view === "board" ? (
        <QuotesPipelineBoard quotes={filteredQuotes} />
      ) : (
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (quotes ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No quotes yet.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (quotes ?? []).length > 0 && filteredQuotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No quotes match "{search}".
                  </TableCell>
                </TableRow>
              )}
              {filteredQuotes.map((q) => (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        title={q.client?.phone ? "Text the quote to the client" : "This client has no phone number on file"}
                        disabled={sendQuoteSms.isPending || !q.client?.phone || q.status === "accepted" || q.status === "declined"}
                        onClick={() => handleSendSms(q.id)}
                      >
                        <MessageSquareText className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Copy client link" onClick={() => copyLink(q.accept_token)}>
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="View quote" asChild>
                        <Link to={`/quotes/${q.id}`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DeleteButton
                      itemLabel={`quote for ${q.client?.name ?? "this client"}`}
                      onConfirm={async () => {
                        try {
                          await deleteQuote.mutateAsync(q.id);
                          toast.success("Quote deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to delete quote");
                        }
                      }}
                    />
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
