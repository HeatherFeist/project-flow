import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, CreditCard, Eye, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import {
  useCreateInvoice,
  useDeleteInvoice,
  useInvoices,
  useSendInvoiceEmail,
  useUpdateInvoiceStatus,
} from "@/hooks/useInvoices";
import type { InvoiceStatus, LineItem } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

const STATUSES: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue"];
const STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  partially_paid: "warning",
  paid: "success",
  overdue: "warning",
};
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "draft",
  sent: "sent",
  partially_paid: "partial",
  paid: "paid",
  overdue: "overdue",
};

export default function Invoices() {
  const { user } = useAuth();
  const { data: invoices, isLoading } = useInvoices();
  const { data: clients } = useClients();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const sendInvoiceEmail = useSendInvoiceEmail();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [useMilestones, setUseMilestones] = useState(false);
  const [milestones, setMilestones] = useState<{ title: string; amount: string }[]>([
    { title: "Deposit", amount: "" },
    { title: "Final payment", amount: "" },
  ]);
  const [search, setSearch] = useState("");

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoices ?? [];
    return (invoices ?? []).filter((inv) =>
      [inv.client?.name, inv.status].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [invoices, search]);

  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  const milestonesTotalCents = milestones.reduce(
    (sum, m) => sum + Math.round((Number(m.amount) || 0) * 100),
    0,
  );
  const milestonesValid = useMilestones ? milestonesTotalCents === totalCents && totalCents > 0 : true;

  function updateMilestone(i: number, patch: Partial<{ title: string; amount: string }>) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !clientId || items.length === 0 || !milestonesValid) return;
    try {
      await createInvoice.mutateAsync({
        owner_id: user.id,
        client_id: clientId,
        job_id: null,
        quote_id: null,
        due_date: dueDate || null,
        items,
        milestones: useMilestones
          ? milestones
              .filter((m) => m.title.trim() && Number(m.amount) > 0)
              .map((m) => ({ title: m.title.trim(), amount_cents: Math.round(Number(m.amount) * 100) }))
          : undefined,
      });
      toast.success("Invoice created");
      setClientId("");
      setDueDate("");
      setItems([]);
      setUseMilestones(false);
      setMilestones([
        { title: "Deposit", amount: "" },
        { title: "Final payment", amount: "" },
      ]);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    }
  }

  async function handleSend(invoiceId: string) {
    try {
      await sendInvoiceEmail.mutateAsync(invoiceId);
      toast.success("Invoice emailed to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice email");
    }
  }

  function copyLink(payToken: string) {
    const url = `${window.location.origin}/pay/${payToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Payment link copied");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground">Bill clients and track payments.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!clients || clients.length === 0}>
              <Plus /> New invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>New invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
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
                <Label htmlFor="due">Due date</Label>
                <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Line items</Label>
                <LineItemsEditor items={items} onChange={setItems} ownerId={user?.id} />
              </div>

              <div className="space-y-2 border-t pt-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={useMilestones} onCheckedChange={(c) => setUseMilestones(!!c)} />
                  Split into payment milestones (deposit + progress payments)
                </label>
                {useMilestones && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      The client pays these in order — each one unlocks after the previous is paid. Amounts
                      must add up to the invoice total ({formatCurrency(totalCents)}).
                    </p>
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder="Milestone name"
                          value={m.title}
                          onChange={(e) => updateMilestone(i, { title: e.target.value })}
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="w-28"
                          value={m.amount}
                          onChange={(e) => updateMilestone(i, { amount: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setMilestones((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMilestones((prev) => [...prev, { title: "", amount: "" }])}
                    >
                      <Plus /> Add milestone
                    </Button>
                    <p className={milestonesValid ? "text-xs text-success" : "text-xs text-destructive"}>
                      Milestones total: {formatCurrency(milestonesTotalCents)}{" "}
                      {!milestonesValid && `— must equal ${formatCurrency(totalCents)}`}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createInvoice.isPending || !clientId || items.length === 0 || !milestonesValid}
                >
                  {createInvoice.isPending ? "Saving…" : "Create invoice"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoices by client, status…"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Send</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (invoices ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (invoices ?? []).length > 0 && filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No invoices match "{search}".
                  </TableCell>
                </TableRow>
              )}
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    {inv.client ? (
                      <Link to={`/clients/${inv.client.id}`} className="font-medium hover:underline">
                        {inv.client.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell>{formatCurrency(inv.total_cents)}</TableCell>
                  <TableCell className={inv.amount_paid_cents > 0 ? "text-success" : "text-muted-foreground"}>
                    {formatCurrency(inv.amount_paid_cents)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={inv.status}
                      onValueChange={(v) => updateStatus.mutate({ id: inv.id, status: v as InvoiceStatus })}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <Badge variant={STATUS_VARIANT[inv.status]} className="border-0 p-0">
                          <SelectValue />
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
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
                        disabled={sendInvoiceEmail.isPending || inv.status === "paid"}
                        onClick={() => handleSend(inv.id)}
                      >
                        <CreditCard /> {inv.status === "draft" ? "Send" : "Resend"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Copy payment link"
                        onClick={() => copyLink(inv.pay_token)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="View invoice" asChild>
                        <Link to={`/invoices/${inv.id}`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DeleteButton
                      itemLabel={`invoice for ${inv.client?.name ?? "this client"}`}
                      onConfirm={async () => {
                        try {
                          await deleteInvoice.mutateAsync(inv.id);
                          toast.success("Invoice deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
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
    </div>
  );
}
