import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useCreateInvoice, useDeleteInvoice, useInvoices, useUpdateInvoiceStatus } from "@/hooks/useInvoices";
import type { InvoiceStatus, LineItem } from "@/types/domain";
import { DeleteButton } from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];
const STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  paid: "success",
  overdue: "warning",
};

export default function Invoices() {
  const { user } = useAuth();
  const { data: invoices, isLoading } = useInvoices();
  const { data: clients } = useClients();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !clientId || items.length === 0) return;
    try {
      await createInvoice.mutateAsync({
        owner_id: user.id,
        client_id: clientId,
        job_id: null,
        quote_id: null,
        due_date: dueDate || null,
        items,
      });
      toast.success("Invoice created");
      setClientId("");
      setDueDate("");
      setItems([]);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    }
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
                <LineItemsEditor items={items} onChange={setItems} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createInvoice.isPending || !clientId || items.length === 0}>
                  {createInvoice.isPending ? "Saving…" : "Create invoice"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (invoices ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
              {(invoices ?? []).map((inv) => (
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
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
