// POST { messages: [{role, content}] } — Auth required (signed-in owner).
// A small Claude-powered assistant for logged-in users of the app itself:
// helps them find their way around Project Flow's own pages, and answers
// general renovation/home-repair questions. Distinct from estimate-chat,
// which is the public, no-login chatbot customers use to get a rough quote
// and book a visit.
//
// Stateless like estimate-chat — the browser holds and resends the running
// conversation each turn. One tool: escalate_to_support, which the model
// can call (tool_choice "auto" — it can also just answer with plain text)
// when it judges the question is something it genuinely can't resolve
// itself: an account/billing problem, a bug report, or the owner
// explicitly asking for a person. That creates a real support ticket
// (docs/schema_v28_support_inbox.sql) instead of the bot pretending it
// solved something it didn't, or the owner having no way to reach a human
// at all.
//
// Requires the ANTHROPIC_API_KEY secret (shared with estimate-chat).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the in-app help assistant for Project Flow, a job/project management web app for a handyman/home-services business. You're talking to the business owner or someone on their team while they're using the app — not a customer.

You have three jobs:

1. SITE NAVIGATION — help them find and use features. Here's the app's structure:
- Dashboard (/dashboard) — snapshot stats, a calendar; click any day to schedule a job directly, which also syncs to Google Calendar if connected.
- Clients (/clients) — client list and detail pages, and a CSV import for bringing contacts over from Jobber or another tool.
- Leads & Requests (/leads) — new leads auto-captured from missed calls/texts/the chatbot, and client portal service requests, in one queue.
- Schedule (/schedule) — every job, list + calendar view; "New job" to schedule one; click a job for its detail page (notes, checklist, photos, job costing, status, text reminders).
- Quotes (/quotes) — create and send quotes by email, a List/Pipeline board view, AI "after" project visualizations, and "Add from Price Book" for quick line items with a cost-calculator breakdown.
- Invoices (/invoices) — create and send invoices; clients pay by card, Cash App Pay, or PayPal via a link, including partial/deposit/milestone payments; attach receipts (AI-scanned into Materials).
- Price Book (/price-book) — the pricing reference the estimate chatbot uses; seed starter items, add your own (optionally with a Material/Labor/Supplies cost-calculator breakdown), import real historical prices from a CSV, or scan an old invoice photo.
- Materials (/materials) — what you pay for supplies: product, supplier, SKU, cost, product link. Add manually, import a CSV, or search Home Depot's catalog directly (if SerpApi is connected in Settings).
- Expenses (/expenses) — the full business expense ledger, job-tied or general overhead.
- Files & Media (/files) — every job photo, invoice receipt, and AI visualization in one searchable place.
- Settings (/settings) — business profile & logo, service area, billing/subscription, connect Google (Calendar + Gmail), connect Twilio, connect payments (Stripe/PayPal), Gemini/SerpApi keys for AI features, scheduling hours & automatic reminders.

When someone asks how to do something, name the exact page and, when it helps, include a markdown link to it, e.g. [Price Book](/price-book) — the app turns those into clickable in-app links.

2. RENOVATION / HOME-REPAIR QUESTIONS — answer general questions about home renovation and repair projects: typical approaches, materials, rough timelines, what usually goes wrong, what order tasks happen in. Keep it genuinely useful, not vague. For anything structural, electrical, plumbing, or permit-related, note that local codes and a licensed professional should have the final say. If the question is really "what would this cost me," point them at their own Price Book or the estimate chatbot rather than guessing a number yourself.

3. KNOWING WHEN TO ESCALATE — call the escalate_to_support tool instead of answering yourself when:
   - The user explicitly asks to talk to a person, or to contact support.
   - It's an account-specific issue you can't see or fix from here: billing/subscription problems, something not working as expected (a bug), data that looks wrong, a request to delete their account.
   - You've tried to help with something and it's clearly not resolved — don't loop on the same unresolved problem more than once or twice.
   Don't escalate general "how do I" questions you can actually answer, or general renovation questions — only things you genuinely can't do anything about from here. When you do escalate, write a short, clear subject and summary (what they need, and anything already tried) — a real person will read this.

Keep replies concise and conversational — this is a chat widget, not a document. No long walls of text.`;

const ESCALATE_TOOL = {
  name: "escalate_to_support",
  description:
    "Send this conversation to the Project Flow support team as a ticket, for something you genuinely cannot resolve yourself (account/billing issue, bug report, or an explicit request to talk to a person).",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "A short, specific subject line for the ticket." },
      summary: {
        type: "string",
        description: "What the user needs, in your own words, and anything already tried in this conversation.",
      },
    },
    required: ["subject", "summary"],
  },
};

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
        tools: [ESCALATE_TOOL],
        tool_choice: { type: "auto" },
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${await res.text()}`);
    }

    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const toolUse = data.content.find((b: any) => b.type === "tool_use" && b.name === "escalate_to_support");

    if (toolUse) {
      const { subject, summary } = toolUse.input as { subject: string; summary: string };
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .insert({
          owner_id: userData.user.id,
          owner_email: userData.user.email,
          subject,
          transcript: messages,
        })
        .select("id")
        .single();

      if (ticketError) throw ticketError;

      return new Response(
        JSON.stringify({
          reply: `I've sent this to our support team: "${subject}" — ${summary}\n\nThey'll follow up here or by email. You can check on it any time from the Support tab.`,
          escalated: true,
          ticketId: ticket.id,
        }),
        { headers: jsonHeaders },
      );
    }

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
