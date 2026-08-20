import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage } from "@/lib/utils";
import { deleteReceipt, uploadReceipt } from "@/lib/receipts";
import type { Invoice, InvoiceMilestone, InvoiceStatus, LineItem } from "@/types/domain";

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ["invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Invoice;
    },
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      owner_id: string;
      client_id: string;
      job_id: string | null;
      quote_id: string | null;
      due_date: string | null;
      items: LineItem[];
      // Optional payment schedule (deposit + progress payments, etc.) — if
      // given, must sum to the invoice total; the client then pays these
      // one at a time, in order, instead of any partial amount at will.
      milestones?: { title: string; amount_cents: number }[];
    }) => {
      const { milestones, ...invoiceInput } = input;
      const total_cents = input.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price_cents,
        0,
      );
      const { data, error } = await supabase
        .from("invoices")
        .insert({ ...invoiceInput, status: "draft" as InvoiceStatus, total_cents })
        .select()
        .single();
      if (error) throw error;
      const invoice = data as Invoice;

      if (milestones && milestones.length > 0) {
        const rows = milestones.map((m, i) => ({
          invoice_id: invoice.id,
          owner_id: input.owner_id,
          title: m.title,
          amount_cents: m.amount_cents,
          sequence: i + 1,
        }));
        const { error: milestoneError } = await supabase.from("invoice_milestones").insert(rows);
        if (milestoneError) throw milestoneError;
      }

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  provider: string;
  milestone_id: string | null;
  status: string;
  created_at: string;
}

export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoice_payments", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InvoicePayment[];
    },
  });
}

export function useInvoiceMilestones(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoice_milestones", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_milestones")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("sequence");
      if (error) throw error;
      return data as InvoiceMilestone[];
    },
  });
}

export function useUploadReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ownerId,
      invoice,
      file,
    }: {
      ownerId: string;
      invoice: Invoice;
      file: File;
    }) => {
      const path = await uploadReceipt(ownerId, invoice.id, file);
      const { error } = await supabase
        .from("invoices")
        .update({ receipt_paths: [...invoice.receipt_paths, path] })
        .eq("id", invoice.id);
      if (error) throw error;
      return path;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", variables.invoice.id] });
    },
  });
}

export function useDeleteReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoice, path }: { invoice: Invoice; path: string }) => {
      await deleteReceipt(path);
      const { error } = await supabase
        .from("invoices")
        .update({ receipt_paths: invoice.receipt_paths.filter((p) => p !== path) })
        .eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", variables.invoice.id] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useSendInvoiceEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoiceId },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
