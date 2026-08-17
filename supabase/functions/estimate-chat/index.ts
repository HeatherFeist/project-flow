// POST { ownerId: string, messages: AnthropicMessage[] }
// Public (no login) — this is the /estimate/:ownerId chatbot's backend.
// A Claude-powered tool-using agent: it can look up the business's price
// book to give a rough estimate, check open scheduling slots, and book a
// free in-person estimate visit (creating the Client, the Job, and the
// real Google Calendar event). Stateless — the browser holds and resends
// the running conversation each turn.
//
// Requires the ANTHROPIC_API_KEY secret.

import {
  CORS_HEADERS,
  createCalendarEvent,
  getFreshAccessToken,
  serviceClient,
} from "../_shared/google.ts";
import { computeAvailableSlots } from "../_shared/scheduling.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const TOOLS = [
  {
    name: "get_price_book",
    description:
      "Look up this business's price book of common job types and typical price ranges, to help produce a rough estimate.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_available_slots",
    description:
      "Get open appointment slots for a free in-person estimate visit, based on the business's calendar and work hours.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "book_estimate_visit",
    description:
      "Book a free estimate visit at a specific open slot. Only call this after the customer has confirmed one specific time from get_available_slots and given their name and phone number.",
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO 8601 start time, exactly as returned by get_available_slots" },
        end: { type: "string", description: "ISO 8601 end time, exactly as returned by get_available_slots" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        customer_email: { type: "string" },
        job_description: { type: "string", description: "Brief description of the job the customer needs done" },
      },
      required: ["start", "end", "customer_name", "customer_phone", "job_description"],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>, ownerId: string) {
  const supabase = serviceClient();

  if (name === "get_price_book") {
    const { data } = await supabase
      .from("price_book_items")
      .select("category, item_name, unit, low_cents, high_cents")
      .eq("owner_id", ownerId);
    return {
      items: (data ?? []).map((i) => ({
        category: i.category,
        item: i.item_name,
        unit: i.unit,
        low: i.low_cents / 100,
        high: i.high_cents / 100,
      })),
    };
  }

  if (name === "get_available_slots") {
    const result = await computeAvailableSlots(ownerId);
    return { slots: result.slots.slice(0, 8), timezone: result.timezone };
  }

  if (name === "book_estimate_visit") {
    const start = String(input.start);
    const end = String(input.end);
    const customerName = String(input.customer_name);
    const customerPhone = String(input.customer_phone);
    const customerEmail = input.customer_email ? String(input.customer_email) : null;
    const jobDescription = String(input.job_description);

    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("phone", customerPhone)
      .maybeSingle();

    let clientId = existing?.id as string | undefined;
    if (!clientId) {
      const { data: created, error } = await supabase
        .from("clients")
        .insert({
          owner_id: ownerId,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          source: "chatbot",
        })
        .select("id")
        .single();
      if (error) throw error;
      clientId = created.id;
    }

    const { data: settings } = await supabase
      .from("scheduling_settings")
      .select("timezone")
      .eq("user_id", ownerId)
      .maybeSingle();
    const timezone = settings?.timezone ?? "America/New_York";

    let googleEventId: string | null = null;
    const { data: connection } = await supabase
      .from("google_connections")
      .select("user_id")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (connection) {
      try {
        const accessToken = await getFreshAccessToken(ownerId);
        googleEventId = await createCalendarEvent({
          accessToken,
          summary: `Estimate: ${jobDescription}`.slice(0, 120),
          description: jobDescription,
          start,
          end,
          timezone,
          attendeeEmail: customerEmail ?? undefined,
        });
      } catch {
        // Booking still succeeds in Project Flow even if the calendar push fails.
      }
    }

    const { error: jobError } = await supabase.from("jobs").insert({
      owner_id: ownerId,
      client_id: clientId,
      title: `Estimate: ${jobDescription}`.slice(0, 120),
      description: jobDescription,
      status: "scheduled",
      scheduled_at: start,
      google_event_id: googleEventId,
    });
    if (jobError) throw jobError;

    return { booked: true, scheduled_at: start };
  }

  return { error: `Unknown tool: ${name}` };
}

// deno-lint-ignore no-explicit-any
async function runAgentLoop(ownerId: string, messages: any[], systemPrompt: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const loopMessages = [...messages];

  for (let iteration = 0; iteration < 5; iteration++) {
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
        system: systemPrompt,
        messages: loopMessages,
        tools: TOOLS,
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${await res.text()}`);
    }

    const data = await res.json();

    if (data.stop_reason === "tool_use") {
      // deno-lint-ignore no-explicit-any
      const toolResults: any[] = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          try {
            const result = await executeTool(block.name, block.input, ownerId);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
          } catch (err) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: err instanceof Error ? err.message : "Tool failed",
            });
          }
        }
      }
      loopMessages.push({ role: "assistant", content: data.content });
      loopMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // deno-lint-ignore no-explicit-any
    const textBlock = data.content.find((b: any) => b.type === "text");
    loopMessages.push({ role: "assistant", content: data.content });
    return { reply: textBlock?.text ?? "", messages: loopMessages };
  }

  return {
    reply: "Sorry, I'm having trouble with that — could you try rephrasing, or call/text us directly?",
    messages: loopMessages,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const { ownerId, messages } = await req.json();
    if (!ownerId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing ownerId or messages" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const supabase = serviceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("id", ownerId)
      .maybeSingle();
    const businessName = profile?.business_name || "this business";

    const systemPrompt = `You are a friendly scheduling & estimate assistant for ${businessName}, a handyman/home-services business, texting with a potential customer.

Your job, in order:
1. Ask what they need done — keep it to 1-2 short questions, don't interrogate.
2. Call get_price_book and give a ROUGH estimate range based on it. ALWAYS make clear this is a rough, non-binding estimate and the final price depends on an in-person visit. If the price book is empty or doesn't cover their job, say you don't have pricing for that yet and someone will follow up with a quote — don't make up numbers.
3. Offer a free in-person estimate visit. If they want one, call get_available_slots and describe a few options in plain language (e.g. "Tuesday at 10am").
4. Once they've picked one specific time and given you their name and phone number, call book_estimate_visit to confirm it.

Keep replies short and conversational, like a text message — no long paragraphs, no markdown formatting.`;

    const result = await runAgentLoop(ownerId, messages, systemPrompt);
    return new Response(JSON.stringify(result), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
