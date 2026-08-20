// POST { token: string, amountCents: number, milestoneId?: string }
// Public (no auth), token-scoped. Creates a Stripe Checkout session for the
// given amount (full balance or a partial/deposit payment, or — if
// milestoneId is given — that exact milestone) against the invoice
// matching the token, and returns the hosted checkout URL.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { createCheckoutSession } from "../_shared/stripe.ts";
import { validateNextMilestone } from "../_shared/milestones.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { token, amountCents, milestoneId } = await req.json();
    if (!token || !Number.isInteger(amountCents) || amountCents <= 0) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = serviceClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, client:clients(name, email)")
      .eq("pay_token", token)
      .single();

    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("id", invoice.owner_id)
      .maybeSingle();

    const remainingCents = invoice.total_cents - invoice.amount_paid_cents;
    if (remainingCents <= 0) {
      return new Response(JSON.stringify({ error: "This invoice is already paid in full." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (milestoneId) {
      try {
        await validateNextMilestone(supabase, invoice.id, milestoneId, amountCents);
      } catch (err) {
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Invalid milestone" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
    } else if (amountCents > remainingCents) {
      return new Response(JSON.stringify({ error: "That's more than the remaining balance." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const businessName = profile?.business_name || "your contractor";

    const session = await createCheckoutSession({
      amountCents,
      description: `Invoice payment — ${businessName}`,
      successUrl: `${siteUrl}/pay/${token}?paid=1`,
      cancelUrl: `${siteUrl}/pay/${token}`,
      customerEmail: invoice.client?.email ?? undefined,
      metadata: {
        invoice_id: invoice.id,
        pay_token: token,
        ...(milestoneId ? { milestone_id: milestoneId } : {}),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
