// Plain fetch helpers for the public (unauthenticated) edge functions —
// these deliberately don't use the supabase-js client so the /q/:token page
// never needs a Supabase session.

const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
  ".supabase.co",
  ".supabase.co/functions/v1",
);
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function callFunction<T>(name: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY ?? "",
      ...init?.headers,
    },
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Request to ${name} failed`);
  }
  return json as T;
}

// The client never sees pay amounts or PayPal/Cash App handles for
// subcontractors — only who's on the job and what they're doing (see
// docs/schema_v30_subcontractors.sql).
export interface PublicSubcontractor {
  id: string;
  name: string;
  scope_of_work: string;
}

export function fetchQuote(token: string) {
  return fetch(`${FUNCTIONS_URL}/quote-response?token=${encodeURIComponent(token)}`, {
    headers: { apikey: ANON_KEY ?? "" },
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load quote");
    return json as {
      quote: {
        id: string;
        status: string;
        total_cents: number;
        notes: string | null;
        items: { id: string; description: string; quantity: number; unit_price_cents: number }[];
        client: { name: string; email: string | null };
      };
      business: { business_name: string | null; phone: string | null; email: string | null; logo_url: string | null } | null;
      job: { scheduled_at: string; address: string | null } | null;
      visualizations: { id: string; prompt: string; result_url: string; created_at: string }[];
      subcontractors: PublicSubcontractor[];
    };
  });
}

export function respondToQuote(token: string, action: "accept" | "decline") {
  return callFunction<{ quote: { status: string } }>("quote-response", {
    method: "POST",
    body: JSON.stringify({ token, action }),
  });
}

export function fetchAvailableSlots(token: string) {
  return fetch(`${FUNCTIONS_URL}/available-slots?token=${encodeURIComponent(token)}`, {
    headers: { apikey: ANON_KEY ?? "" },
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load open times");
    return json as { slots: { start: string; end: string }[]; timezone: string };
  });
}

export function bookSlot(token: string, start: string, end: string) {
  return callFunction<{ job: { scheduled_at: string } }>("book-slot", {
    method: "POST",
    body: JSON.stringify({ token, start, end }),
  });
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | { type: string; [key: string]: unknown }[];
}

export function sendEstimateChatMessage(ownerId: string, messages: ChatMessage[], photoUrls: string[] = []) {
  return callFunction<{ reply: string; messages: ChatMessage[] }>("estimate-chat", {
    method: "POST",
    body: JSON.stringify({ ownerId, messages, photoUrls }),
  });
}

export interface InvoicePayMilestone {
  id: string;
  title: string;
  amount_cents: number;
  sequence: number;
  status: "pending" | "paid";
  paid_at: string | null;
}

export function fetchInvoicePayInfo(token: string) {
  return fetch(`${FUNCTIONS_URL}/invoice-pay-info?token=${encodeURIComponent(token)}`, {
    headers: { apikey: ANON_KEY ?? "" },
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load invoice");
    return json as {
      invoice: {
        id: string;
        status: string;
        total_cents: number;
        amount_paid_cents: number;
        due_date: string | null;
        items: { id: string; description: string; quantity: number; unit_price_cents: number }[];
        client: { name: string; email: string | null };
      };
      business: { business_name: string | null; phone: string | null; email: string | null; logo_url: string | null } | null;
      milestones: InvoicePayMilestone[];
      subcontractors: PublicSubcontractor[];
    };
  });
}

export function createInvoiceCheckout(token: string, amountCents: number, milestoneId?: string) {
  return callFunction<{ url: string }>("create-invoice-checkout", {
    method: "POST",
    body: JSON.stringify({ token, amountCents, milestoneId }),
  });
}

export function createPaypalOrder(token: string, amountCents: number, milestoneId?: string) {
  return callFunction<{ approveUrl: string }>("create-paypal-order", {
    method: "POST",
    body: JSON.stringify({ token, amountCents, milestoneId }),
  });
}

export function capturePaypalOrder(token: string, paypalOrderId: string, milestoneId?: string) {
  return callFunction<{ ok: true; alreadyRecorded?: boolean }>("capture-paypal-order", {
    method: "POST",
    body: JSON.stringify({ token, paypalOrderId, milestoneId }),
  });
}

export function fetchJobPhotosInfo(token: string) {
  return fetch(`${FUNCTIONS_URL}/job-photos-info?token=${encodeURIComponent(token)}`, {
    headers: { apikey: ANON_KEY ?? "" },
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load gallery");
    return json as {
      job: { title: string; client: { name: string } | null };
      business: { business_name: string | null } | null;
      photos: { id: string; url: string; caption: string | null; taken_by: string | null; created_at: string }[];
    };
  });
}

// --- Client portal ---------------------------------------------------

export function requestPortalLogin(ownerId: string, email: string) {
  return callFunction<{ ok: true; message: string }>("portal-login-request", {
    method: "POST",
    body: JSON.stringify({ ownerId, email }),
  });
}

export function verifyPortalLogin(token: string) {
  return callFunction<{ sessionToken: string }>("portal-verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface PortalMilestone {
  id: string;
  invoice_id: string;
  title: string;
  amount_cents: number;
  sequence: number;
  status: "pending" | "paid";
  paid_at: string | null;
}

export interface PortalDashboardData {
  client: { id: string; name: string; email: string | null };
  business: { business_name: string | null; phone: string | null; email: string | null; logo_url: string | null } | null;
  jobs: {
    id: string;
    title: string;
    status: string;
    scheduled_at: string | null;
    address: string | null;
    photo_share_token: string;
  }[];
  quotes: {
    id: string;
    status: string;
    total_cents: number;
    notes: string | null;
    items: { id: string; description: string; quantity: number; unit_price_cents: number }[];
    accept_token: string;
    created_at: string;
  }[];
  invoices: {
    id: string;
    status: string;
    total_cents: number;
    amount_paid_cents: number;
    due_date: string | null;
    pay_token: string;
    created_at: string;
    milestones: PortalMilestone[];
  }[];
}

export function fetchPortalDashboard(sessionToken: string) {
  return callFunction<PortalDashboardData>("portal-dashboard", {
    method: "POST",
    body: JSON.stringify({ sessionToken }),
  });
}

export function requestAdditionalService(sessionToken: string, message: string) {
  return callFunction<{ ok: true }>("portal-request-service", {
    method: "POST",
    body: JSON.stringify({ sessionToken, message }),
  });
}
