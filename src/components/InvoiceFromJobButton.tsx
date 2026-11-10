import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { useInvoices, useCreateInvoice } from "@/hooks/useInvoices";
import { useQuote } from "@/hooks/useQuotes";
import { LineItemsEditor } from "@/components/LineItemsEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Job, LineItem } from "@/types/domain";
import { formatCurrency } from "@/lib/utils";

interface InvoiceFromJobButtonProps {
  job: Job;
}

function prefillItems(job: Job, quoteItems: LineItem[] | undefined): LineItem[] {
  if (quoteItems && quoteItems.length > 0) {
    return quoteItems.map((item) => ({ ...item, id: crypto.randomUUID() }));
  }
  return [
    {
      id: crypto.randomUUID(),
      description: job.title,
      quantity: 1,
      unit_price_cents: 0,
    },
  ];
}

export function InvoiceFromJobButton({ job }: InvoiceFromJobButtonProps) {
  const navigate = useNavigate();
  const { data: invoices } = useInvoices();
  const { data: quote } = useQuote(job.quote_id ?? undefined);
  const createInvoice = useCreateInvoice();
  const [open, setOpen] = useState(false);
  const [makingAnother, setMakingAnother] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);

  const existing = (invoices ?? []).filter((invoice) => invoice.job_id === job.id);

  function openDialog() {
    setItems(prefillItems(job, quote?.items));
    setMakingAnother(existing.length === 0);
    setOpen(true);
  }

  async function handleCreate() {
    const billable = items.filter((item) => item.description.trim());
    if (billable.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }
    try {
      const invoice = await createInvoice.mutateAsync({
        owner_id: job.owner_id,
        client_id: job.client_id,
        job_id: job.id,
        quote_id: job.quote_id,
        due_date: null,
        items: billable,
      });
      toast.success("Invoice created");
      setOpen(false);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Receipt /> Create invoice
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice for {job.title}</DialogTitle>
          </DialogHeader>
          {existing.length > 0 && !makingAnother ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This job already has {existing.length === 1 ? "an invoice" : `${existing.length} invoices`}.
              </p>
              <div className="space-y-2">
                {existing.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
                    onClick={() => setOpen(false)}
                  >
                    <span>{invoice.status.replace("_", " ")}</span>
                    <span className="font-medium">{formatCurrency(invoice.total_cents)}</span>
                  </Link>
                ))}
              </div>
              <Button variant="outline" onClick={() => setMakingAnother(true)}>
                Create another invoice
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {quote?.items && quote.items.length > 0
                  ? "Line items are filled in from the linked quote. Change anything before saving."
                  : "No quote is linked, so this starts from the job title. Set the price before saving."}
              </p>
              <LineItemsEditor items={items} onChange={setItems} ownerId={job.owner_id} />
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createInvoice.isPending}>
                  {createInvoice.isPending ? "Saving…" : "Create invoice"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
