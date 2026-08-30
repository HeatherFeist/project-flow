import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, CreditCard, ListPlus, Loader2, Receipt, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDeleteInvoice,
  useDeleteReceipt,
  useInvoice,
  useInvoiceMilestones,
  useInvoicePayments,
  useSendInvoiceEmail,
  useUpdateInvoiceStatus,
  useUploadReceipt,
} from "@/hooks/useInvoices";
import { useExtractReceiptItems, type ExtractedReceipt } from "@/hooks/useReceiptExtraction";
import { getReceiptSignedUrls } from "@/lib/receipts";
import { blobToBase64, fileToImageBlobs } from "@/lib/estimateMedia";
import type { InvoiceStatus } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { ReceiptItemsReviewDialog } from "@/components/ReceiptItemsReviewDialog";
import { SubcontractorsCard } from "@/components/SubcontractorsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const STATUSES: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue"];
const STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  partially_paid: "warning",
  paid: "success",
  overdue: "warning",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: invoice, isLoading } = useInvoice(id);
  const { data: milestones } = useInvoiceMilestones(id);
  const { data: payments } = useInvoicePayments(id);
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const sendInvoiceEmail = useSendInvoiceEmail();
  const uploadReceipt = useUploadReceipt();
  const deleteReceipt = useDeleteReceipt();
  const extractReceiptItems = useExtractReceiptItems();
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [scanningPath, setScanningPath] = useState<string | null>(null);
  const [review, setReview] = useState<ExtractedReceipt | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!invoice || invoice.receipt_paths.length === 0) return;
    getReceiptSignedUrls(invoice.receipt_paths)
      .then(setReceiptUrls)
      .catch(() => toast.error("Failed to load receipt images"));
  }, [invoice]);

  async function handleSend() {
    if (!id) return;
    try {
      await sendInvoiceEmail.mutateAsync(id);
      toast.success("Invoice emailed to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice email");
    }
  }

  function copyLink() {
    if (!invoice) return;
    navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.pay_token}`);
    toast.success("Payment link copied");
  }

  async function handleReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !invoice || !user) return;
    try {
      await uploadReceipt.mutateAsync({ ownerId: user.id, invoice, file });
      toast.success("Receipt attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload receipt");
      return;
    }

    // Best-effort — the receipt is already safely attached either way, so
    // a failure here is just a missed convenience, not a lost upload.
    try {
      const [blob] = await fileToImageBlobs(file);
      const base64 = await blobToBase64(blob);
      const extracted = await extractReceiptItems.mutateAsync({ imageBase64: base64, mediaType: "image/jpeg" });
      if (extracted.items.length > 0) setReview(extracted);
    } catch {
      // Silent — user can still click "Scan for materials" on the thumbnail manually.
    }
  }

  async function handleScanReceipt(path: string) {
    const url = receiptUrls[path];
    if (!url) return;
    setScanningPath(path);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const extracted = await extractReceiptItems.mutateAsync({ imageBase64: base64, mediaType: blob.type || "image/jpeg" });
      if (extracted.items.length === 0) {
        toast.info("No line items found on that receipt.");
      } else {
        setReview(extracted);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read receipt");
    } finally {
      setScanningPath(null);
    }
  }

  async function handleDeleteReceipt(path: string) {
    if (!invoice) return;
    try {
      await deleteReceipt.mutateAsync({ invoice, path });
      toast.success("Receipt removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove receipt");
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/invoices" className="text-sm text-muted-foreground hover:underline">
          ← Invoices
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            Invoice for {invoice.client ? (
              <Link to={`/clients/${invoice.client.id}`} className="hover:underline">
                {invoice.client.name}
              </Link>
            ) : (
              "—"
            )}
          </h1>
          <div className="flex items-center gap-2">
            <Select
              value={invoice.status}
              onValueChange={(v) => updateStatus.mutate({ id: invoice.id, status: v as InvoiceStatus })}
            >
              <SelectTrigger className="w-36">
                <Badge variant={STATUS_VARIANT[invoice.status]} className="border-0 p-0">
                  <SelectValue />
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={sendInvoiceEmail.isPending || invoice.status === "paid"}
              onClick={handleSend}
            >
              <CreditCard /> {invoice.status === "draft" ? "Send" : "Resend"}
            </Button>
            <Button variant="outline" size="icon" title="Copy payment link" onClick={copyLink}>
              <Copy className="size-4" />
            </Button>
            <DeleteButton
              itemLabel={`invoice for ${invoice.client?.name ?? "this client"}`}
              onConfirm={async () => {
                try {
                  await deleteInvoice.mutateAsync(invoice.id);
                  toast.success("Invoice deleted");
                  navigate("/invoices");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
                }
              }}
            />
          </div>
        </div>
        <p className="text-muted-foreground">
          Due {formatDate(invoice.due_date)} · Total {formatCurrency(invoice.total_cents)} · Paid{" "}
          {formatCurrency(invoice.amount_paid_cents)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Line items</CardTitle>
        </CardHeader>
        <CardContent className="divide-y pb-6">
          {(invoice.items ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {item.description} <span className="text-muted-foreground">×{item.quantity}</span>
              </span>
              <span>{formatCurrency(item.quantity * item.unit_price_cents)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {milestones && milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payment milestones</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pb-6">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {m.title}
                  {m.due_date && m.status !== "paid" && (
                    <span className="ml-1.5 text-xs text-muted-foreground">due {formatDate(m.due_date)}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {formatCurrency(m.amount_cents)}
                  <Badge variant={m.status === "paid" ? "success" : "outline"}>
                    {m.status === "paid" ? `Paid ${formatDate(m.paid_at)}` : "Pending"}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {payments && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payment history</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pb-6">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground">
                  {formatDateTime(p.created_at)} · {p.provider}
                </span>
                <span>{formatCurrency(p.amount_cents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Receipts</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={uploadReceipt.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadReceipt.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            Add receipt
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleReceiptSelected}
          />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          {invoice.receipt_paths.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Receipt className="size-4" /> No receipts attached yet — snap a photo of a materials
              receipt to keep it with this invoice. It's automatically scanned for line items you can
              add straight to your Materials catalog.
            </p>
          )}
          {invoice.receipt_paths.map((path) => (
            <div key={path} className="relative">
              {receiptUrls[path] ? (
                <a href={receiptUrls[path]} target="_blank" rel="noreferrer">
                  <img src={receiptUrls[path]} alt="Receipt" className="size-24 rounded-md border object-cover" />
                </a>
              ) : (
                <div className="flex size-24 items-center justify-center rounded-md border bg-secondary">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDeleteReceipt(path)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-destructive-foreground"
                title="Remove receipt"
              >
                <Trash2 className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => handleScanReceipt(path)}
                disabled={!receiptUrls[path] || scanningPath === path}
                className="absolute -left-1.5 -top-1.5 rounded-full bg-secondary p-1 text-secondary-foreground shadow disabled:opacity-50"
                title="Scan for materials"
              >
                {scanningPath === path ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ListPlus className="size-3" />
                )}
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {invoice.quote_id && <SubcontractorsCard quoteId={invoice.quote_id} mode="reference" />}

      {review && <ReceiptItemsReviewDialog extracted={review} onClose={() => setReview(null)} />}
    </div>
  );
}
