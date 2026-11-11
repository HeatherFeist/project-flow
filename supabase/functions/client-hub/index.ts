// GET  ?token=<clients.hub_token>
// POST { token, action: "request_work", message }
// POST { token, action: "start_deposit", quoteId }
//
// Public. The token is the credential for one client. Shows their quotes
// and invoices, logs a work request, and prepares a deposit invoice so the
// existing pay link can charge it. Accept/decline stays on quote-response
// (the same path as the public quote link, including quote-to-job).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };
  const supabase = serviceClient();

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token");
      const loaded = await loadClient(supabase, token);
      if (!loaded) return new Response(JSON.stringify({ error: "Link not found" }), { status: 404, headers: jsonHeaders });
      const payload = await hubPayload(supabase, loaded.client);
      return new Response(JSON.stringify(payload), { headers: jsonHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const loaded = await loadClient(supabase, body.token);
      if (!loaded) return new Response(JSON.stringify({ error: "Link not found" }), { status: 404, headers: jsonHeaders });
      const { client } = loaded;

      if (body.action === "request_work") {
        const message = String(body.message ?? "").trim();
        if (!message) {
          return new Response(JSON.stringify({ error: "Enter what you need done." }), { status: 400, headers: jsonHeaders });
        }
        const { error } = await supabase.from("service_requests").insert({
          owner_id: client.owner_id,
          client_id: client.id,
          message,
        });
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
      }

      if (body.action === "start_deposit") {
        const result = await startDeposit(supabase, client, body.quoteId);
        return new Response(JSON.stringify(result), { headers: jsonHeaders });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jsonHeaders });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "No deposit" || message === "Quote not found" ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
  }
});

// deno-lint-ignore no-explicit-any
async function loadClient(supabase: any, token: string | null) {
  if (!token) return null;
  const { data: client } = await supabase
    .from("clients")
    .select("id, owner_id, name")
    .eq("hub_token", token)
    .maybeSingle();
  return client ? { client } : null;
}

// deno-lint-ignore no-explicit-any
async function hubPayload(supabase: any, client: { id: string; owner_id: string; name: string }) {
  const [{ data: profile }, { data: quotes }, { data: invoices }] = await Promise.all([
    supabase.from("profiles").select("business_name, phone, email, logo_url, logo_width_px").eq("id", client.owner_id).maybeSingle(),
    supabase
      .from("quotes")
      .select("id, status, total_cents, notes, items, accept_token, deposit_cents, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, status, total_cents, amount_paid_cents, due_date, pay_token, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    client: { name: client.name },
    business: profile ?? null,
    quotes: quotes ?? [],
    invoices: invoices ?? [],
  };
}

// deno-lint-ignore no-explicit-any
async function startDeposit(supabase: any, client: { id: string; owner_id: string }, quoteId: string) {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, total_cents, deposit_cents, items, client_id, owner_id")
    .eq("id", quoteId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!quote) throw new Error("Quote not found");
  const deposit = quote.deposit_cents as number | null;
  if (!deposit || deposit <= 0) throw new Error("No deposit");

  let invoice = (
    await supabase
      .from("invoices")
      .select("id, pay_token, total_cents")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: true })
      .limit(1)
  ).data?.[0];

  if (!invoice) {
    const { data: created, error } = await supabase
      .from("invoices")
      .insert({
        owner_id: quote.owner_id,
        client_id: quote.client_id,
        quote_id: quote.id,
        job_id: null,
        status: "draft",
        total_cents: quote.total_cents,
        items: quote.items ?? [],
        due_date: null,
      })
      .select("id, pay_token, total_cents")
      .single();
    if (error) throw error;
    invoice = created;
  }

  const { data: milestones } = await supabase
    .from("invoice_milestones")
    .select("id, title, amount_cents, sequence, status")
    .eq("invoice_id", invoice.id)
    .order("sequence");

  let depositMilestone = (milestones ?? []).find(
    (m: { title: string; status: string }) => m.title === "Deposit" && m.status !== "paid",
  );

  if (!milestones || milestones.length === 0) {
    const amount = Math.min(deposit, invoice.total_cents);
    const remainder = invoice.total_cents - amount;
    const rows = [
      {
        invoice_id: invoice.id,
        owner_id: quote.owner_id,
        title: "Deposit",
        amount_cents: amount,
        sequence: 1,
      },
    ];
    if (remainder > 0) {
      rows.push({
        invoice_id: invoice.id,
        owner_id: quote.owner_id,
        title: "Balance",
        amount_cents: remainder,
        sequence: 2,
      });
    }
    const { data: inserted, error } = await supabase.from("invoice_milestones").insert(rows).select("id, title, amount_cents, status");
    if (error) throw error;
    depositMilestone = (inserted ?? [])[0];
  }

  if (!depositMilestone) throw new Error("Deposit is already paid");
  return {
    payToken: invoice.pay_token,
    amountCents: depositMilestone.amount_cents,
    milestoneId: depositMilestone.id,
  };
}
