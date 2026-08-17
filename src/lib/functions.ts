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
      business: { business_name: string | null; phone: string | null; email: string | null } | null;
      job: { scheduled_at: string; address: string | null } | null;
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
      business: { business_name: string | null; phone: string | null; email: string | null } | null;
    };
  });
}

export function createInvoiceCheckout(token: string, amountCents: number) {
  return callFunction<{ url: string }>("create-invoice-checkout", {
    method: "POST",
    body: JSON.stringify({ token, amountCents }),
  });
}

export function createPaypalOrder(token: string, amountCents: number) {
  return callFunction<{ approveUrl: string }>("create-paypal-order", {
    method: "POST",
    body: JSON.stringify({ token, amountCents }),
  });
}

export function capturePaypalOrder(token: string, paypalOrderId: string) {
  return callFunction<{ ok: true; alreadyRecorded?: boolean }>("capture-paypal-order", {
    method: "POST",
    body: JSON.stringify({ token, paypalOrderId }),
  });
}
