export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface Profile {
  id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  owner_id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  scheduled_at: string | null;
  address: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name">;
}

export interface JobNote {
  id: string;
  job_id: string;
  note: string;
  created_at: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Quote {
  id: string;
  owner_id: string;
  client_id: string;
  job_id: string | null;
  status: QuoteStatus;
  total_cents: number;
  notes: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name">;
  items?: LineItem[];
}

export interface Invoice {
  id: string;
  owner_id: string;
  client_id: string;
  job_id: string | null;
  quote_id: string | null;
  status: InvoiceStatus;
  total_cents: number;
  due_date: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name">;
  items?: LineItem[];
}
