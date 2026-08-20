export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue";

export interface Profile {
  id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  service_area: string | null;
  google_review_link: string | null;
  is_exempt: boolean;
  onboarding_completed: boolean;
  created_at: string;
}

export type SubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

export interface Subscription {
  owner_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  updated_at: string;
}

export type ClientSource = "manual" | "missed_call" | "inbound_text" | "import" | "chatbot";

export interface Client {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  source: ClientSource;
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
  photo_urls: string[];
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

export interface TwilioSettings {
  user_id: string;
  twilio_phone_number: string;
  forward_to_phone: string | null;
  missed_call_message: string;
}

export type PriceUnit = "flat" | "per hour" | "per sq ft" | "per linear ft";

export interface PriceBookItem {
  id: string;
  owner_id: string;
  category: string;
  item_name: string;
  unit: PriceUnit;
  low_cents: number;
  high_cents: number;
  notes: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  owner_id: string;
  client_id: string;
  job_id: string | null;
  quote_id: string | null;
  status: InvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
  pay_token: string;
  due_date: string | null;
  sent_at: string | null;
  receipt_paths: string[];
  created_at: string;
  client?: Pick<Client, "id" | "name">;
  items?: LineItem[];
}

export type MilestoneStatus = "pending" | "paid";

export interface InvoiceMilestone {
  id: string;
  invoice_id: string;
  owner_id: string;
  title: string;
  amount_cents: number;
  sequence: number;
  status: MilestoneStatus;
  paid_at: string | null;
  created_at: string;
}
