// POST { messages: [{role, content}] } — Auth required (signed-in owner).
// A small Claude-powered assistant for logged-in users of the app itself:
// helps them find their way around Project Flow's own pages, and answers
// general renovation/home-repair questions. Distinct from estimate-chat,
// which is the public, no-login chatbot customers use to get a rough quote
// and book a visit.
//
// Stateless like estimate-chat — the browser holds and resends the running
// conversation each turn. No tools: this doesn't need to read the
// database, just describe the app and answer general questions.
//
// Requires the ANTHROPIC_API_KEY secret (shared with estimate-chat).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the in-app help assistant for Project Flow, a job/project management web app for a handyman/home-services business. You're talking to the business owner or someone on their team while they're using the app — not a customer.

You have two jobs:

1. SITE NAVIGATION — help them find and use features. Here's the app's structure:
- Dashboard (/) — snapshot stats, a calendar; click any day to schedule a job directly, which also syncs to Google Calendar if connected.
- Clients (/clients) — client list and detail pages, and a CSV import for bringing contacts over from Jobber or another tool.
- Schedule (/schedule) — every job, list + calendar view; "New job" to schedule one; click a job for its detail page (notes, photos, status, text reminders).
- Quotes (/quotes) — create and send quotes by email; clients accept/decline via a link and can then pick an open time slot.
- Invoices (/invoices) — create and send invoices; clients pay by card, Cash App Pay, or PayPal via a link, including partial/deposit payments.
- Price Book (/price-book) — the pricing reference the estimate chatbot uses (what you charge customers); seed starter items, add your own, or import real historical prices from a CSV export.
- Materials (/materials) — a separate catalog of what you pay for supplies: product, supplier, SKU, cost, and a product-page link for easy reordering. Add manually or import a Home Depot/Lowe's purchase-history CSV.
- Settings (/settings) — business profile & service area, billing/subscription, connect Google (Calendar + Gmail), connect Twilio (missed-call text-back, SMS lead capture, reminders), the estimate chatbot's link/embed guide, the client portal link, and scheduling hours.

When someone asks how to do something, name the exact page and, when it helps, include a markdown link to it, e.g. [Price Book](/price-book) — the app turns those into clickable in-app links.

2. RENOVATION / HOME-REPAIR QUESTIONS — answer general questions about home renovation and repair projects: typical approaches, materials, rough timelines, what usually goes wrong, what order tasks happen in. Keep it genuinely useful, not vague. For anything structural, electrical, plumbing, or permit-related, note that local codes and a licensed professional should have the final say — you're giving general information, not a substitute for that. If the question is really "what would this cost me," point them at their own Price Book or the estimate chatbot rather than guessing a number yourself — this assistant doesn't have access to their pricing data.

Keep replies concise and conversational — this is a chat widget, not a document. No long walls of text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: jsonHeaders });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), { status: 400, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${await res.text()}`);
    }

    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const textBlock = data.content.find((b: any) => b.type === "text");

    return new Response(JSON.stringify({ reply: textBlock?.text ?? "" }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
