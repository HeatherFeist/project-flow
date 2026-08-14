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
  quote_id: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  scheduled_at: string | null;
  address: string | null;
  google_event_id: string | null;
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
  accept_token: string;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name">;
  items?: LineItem[];
}

export interface SchedulingSettings {
  user_id: string;
  timezone: string;
  work_days: number[];
  work_start_minutes: number;
  work_end_minutes: number;
  slot_duration_minutes: number;
  booking_horizon_days: number;
}

export interface GoogleConnection {
  user_id: string;
  google_email: string | null;
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
