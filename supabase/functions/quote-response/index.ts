// GET  ?token=<accept_token>              -> public quote details + status
// POST { token, action: "accept"|"decline" } -> records the response;
//        on accept, also auto-generates the invoice from the quote's items.
// No auth — the token itself is the credential. Uses the service-role key
// to read/write only the single quote row matching that token.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const supabase = serviceClient();
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token");
      if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

      const { data: quote, error } = await supabase
        .from("quotes")
        .select("id, status, total_cents, notes, items, created_at, sent_at, responded_at, owner_id, client:clients(name, email)")
        .eq("accept_token", token)
        .single();

      if (error || !quote) {
        return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name, phone, email, logo_url")
        .eq("id", quote.owner_id)
        .maybeSingle();

      const { data: job } = await supabase
        .from("jobs")
        .select("scheduled_at, address")
        .eq("quote_id", quote.id)
        .maybeSingle();

      const { data: visualizations } = await supabase
        .from("quote_visualizations")
        .select("id, prompt, result_url, created_at")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false });

      // Client only ever sees who's on the job and what they're doing —
      // never pay amounts or PayPal/Cash App handles (see
      // docs/schema_v30_subcontractors.sql).
      const { data: subcontractors } = await supabase
        .from("subcontractors")
        .select("id, name, scope_of_work")
        .eq("quote_id", quote.id)
        .order("created_at");

      const { data: milestones } = await supabase
        .from("quote_milestones")
        .select("id, title, amount_cents, due_date, sequence")
        .eq("quote_id", quote.id)
        .order("sequence");

      const { owner_id: _owner_id, ...publicQuote } = quote;
      return new Response(
        JSON.stringify({
          quote: publicQuote,
          business: profile ?? null,
          job: job ?? null,
          visualizations: visualizations ?? [],
          subcontractors: subcontractors ?? [],
          milestones: milestones ?? [],
        }),
        { headers: jsonHeaders },
      );
    }

    if (req.method === "POST") {
      const { token, action } = await req.json();
      if (!token || !["accept", "decline"].includes(action)) {
        return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: jsonHeaders });
      }

      const { data: quote, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("accept_token", token)
        .single();

      if (error || !quote) {
        return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
      }

      if (quote.status === "accepted" || quote.status === "declined") {
        return new Response(JSON.stringify({ quote, alreadyResponded: true }), { headers: jsonHeaders });
      }

      const newStatus = action === "accept" ? "accepted" : "declined";
      const { data: updatedQuote, error: updateError } = await supabase
        .from("quotes")
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq("id", quote.id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (newStatus === "accepted") {
        const { data: invoice } = await supabase
          .from("invoices")
          .insert({
            owner_id: quote.owner_id,
            client_id: quote.client_id,
            job_id: null,
            quote_id: quote.id,
            status: "draft",
            total_cents: quote.total_cents,
            items: quote.items,
            due_date: null,
          })
          .select()
          .single();

        // Carry the estimate's planned payment timeline over to the
        // invoice's real (payable) milestones, so nothing has to be
        // re-entered — same title, amount, sequence, and due date.
        if (invoice) {
          const { data: quoteMilestones } = await supabase
            .from("quote_milestones")
            .select("title, amount_cents, sequence, due_date")
            .eq("quote_id", quote.id)
            .order("sequence");

          if (quoteMilestones && quoteMilestones.length > 0) {
            await supabase.from("invoice_milestones").insert(
              quoteMilestones.map((m: { title: string; amount_cents: number; sequence: number; due_date: string | null }) => ({
                invoice_id: invoice.id,
                owner_id: quote.owner_id,
                title: m.title,
                amount_cents: m.amount_cents,
                sequence: m.sequence,
                due_date: m.due_date,
              })),
            );
          }
        }
      }

      return new Response(JSON.stringify({ quote: updatedQuote }), { headers: jsonHeaders });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
