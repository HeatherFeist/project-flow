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
  logo_url: string | null;
  logo_path: string | null;
  gemini_api_key: string | null;
  serpapi_key: string | null;
  is_exempt: boolean;
  is_admin: boolean;
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

export type MessageChannel = "sms" | "call" | "email";
export type MessageDirection = "inbound" | "outbound";

export interface ClientMessage {
  id: string;
  owner_id: string;
  client_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  body: string;
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
  photo_share_token: string;
  reminder_sent_at: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name">;
}

export interface JobNote {
  id: string;
  job_id: string;
  note: string;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  owner_id: string;
  url: string;
  storage_path: string;
  taken_by: string | null;
  caption: string | null;
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
  client?: Pick<Client, "id" | "name" | "phone">;
  items?: LineItem[];
}

export interface QuoteVisualization {
  id: string;
  quote_id: string;
  owner_id: string;
  prompt: string;
  result_path: string;
  result_url: string;
  created_at: string;
}

export interface SchedulingSettings {
  user_id: string;
  timezone: string;
  work_days: number[];
  work_start_minutes: number;
  work_end_minutes: number;
  slot_duration_minutes: number;
  booking_horizon_days: number;
  reminder_hours_before: number;
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
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
}

export interface PaymentSettings {
  owner_id: string;
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  paypal_client_id: string | null;
  paypal_client_secret: string | null;
  paypal_mode: "sandbox" | "live";
  updated_at: string;
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
  // Optional cost-calculator breakdown (docs/schema_v26) — all null unless
  // an owner has opted this specific item into a Material/Labor/Supplies
  // breakdown view instead of just a single low/high range.
  description: string | null;
  material_low_cents: number | null;
  material_high_cents: number | null;
  material_quantity_label: string | null;
  labor_low_cents: number | null;
  labor_high_cents: number | null;
  labor_quantity_label: string | null;
  supplies_low_cents: number | null;
  supplies_high_cents: number | null;
}

// Separate from the Price Book: the Price Book is what you charge
// customers per job type; this is what you pay for supplies — a
// reorder-ready catalog with supplier + SKU/product link.
export interface Material {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  supplier: string | null;
  sku: string | null;
  unit: string;
  cost_cents: number;
  product_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface JobChecklistItem {
  id: string;
  owner_id: string;
  job_id: string;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
}

export type ExpenseCategory =
  | "material"
  | "labor"
  | "fuel"
  | "tools_equipment"
  | "permits_fees"
  | "vehicle"
  | "insurance"
  | "office"
  | "other";

export interface Expense {
  id: string;
  owner_id: string;
  job_id: string | null;
  material_id: string | null;
  category: ExpenseCategory;
  description: string;
  quantity: number;
  amount_cents: number;
  expense_date: string;
  created_at: string;
  job?: Pick<Job, "id" | "title"> | null;
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

export type SupportTicketStatus = "open" | "answered" | "closed";

export interface SupportTicket {
  id: string;
  owner_id: string;
  owner_email: string | null;
  subject: string;
  status: SupportTicketStatus;
  transcript: { role: "user" | "assistant"; content: string }[];
  created_at: string;
  updated_at: string;
  // Only present on the admin inbox query, which joins in the owner's business name.
  owner?: { business_name: string | null } | null;
}

export interface SupportTicketReply {
  id: string;
  ticket_id: string;
  author: "owner" | "support";
  body: string;
  created_at: string;
}

// Full record — GC-only view (Settings/Quote/Invoice detail pages while
// signed in). The client-facing shape is separate (see lib/functions.ts)
// and only ever carries name + scope_of_work.
export interface Subcontractor {
  id: string;
  owner_id: string;
  quote_id: string;
  name: string;
  scope_of_work: string;
  pay_cents: number | null;
  paypal_handle: string | null;
  cashapp_handle: string | null;
  created_at: string;
}

// A reference calculator (docs/schema_v31_pay_guidelines.sql), not an
// enforced rule — see calculatePayGuideline in hooks/usePayGuidelines.ts.
export interface PayGuidelines {
  owner_id: string;
  materials_multiplier: number;
  materials_pct: number;
  overhead_pct: number;
  gc_labor_share_pct: number;
  updated_at: string;
}
