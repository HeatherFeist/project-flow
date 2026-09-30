// POST { messages: AnthropicMessage[] }
// Auth required (the signed-in owner). A conversational version of
// generate-quote-draft: instead of one text prompt producing one draft,
// the owner can chat back and forth — describe the job, attach photos as
// they come up, answer clarifying questions, ask for changes — and the
// draft estimate updates each time enough is known. The browser holds and
// resends the running conversation each turn (same pattern as
// estimate-chat), and the frontend renders the latest draft it's shown
// alongside the chat itself for review before it's used.
//
// Not to be confused with estimate-chat, which is the public, customer-
// facing chatbot (books a visit, doesn't draft structured line items) —
// this one is signed-in-owner-only and hands back structured estimate
// data via the propose_estimate tool, not just conversation.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5";

const TOOLS = [
  {
    name: "get_price_book",
    description:
      "Look up this business's price book of job types and typical price ranges, to price line items accurately.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "propose_estimate",
    description:
      "Show the contractor the current draft estimate based on the conversation so far. Call this every time you have enough information to draft or revise the line items — the first rough pass as soon as you have enough to start, and again any time something changes (a new item, a price/quantity adjustment, more detail from a photo). Don't wait until the very end to call it once.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scope_of_work: {
                type: "string",
                description:
                  "REQUIRED, at least one full sentence describing the actual steps and finish of the work — never a short label. E.g. 'Remove existing caulking and tape around window frame, then apply new exterior caulk until edge lines are smooth and even.'",
              },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Price per unit, in dollars" },
              estimated_hours: {
                type: "number",
                description: "REQUIRED. Realistic total labor hours for this line item, never 0.",
              },
            },
            required: ["scope_of_work", "quantity", "unit_price", "estimated_hours"],
          },
        },
        notes: {
          type: "string",
          description: "Short internal note (not shown to the client) on pricing assumptions.",
        },
      },
      required: ["items", "notes"],
    },
  },
];

// deno-lint-ignore no-explicit-any
async function executeTool(name: string, input: Record<string, unknown>, ownerId: string): Promise<any> {
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

  if (name === "propose_estimate") {
    // No DB side effect — this is a "show the UI the current draft" tool.
    // The caller (runAgentLoop) captures the raw input as the latest
    // proposal; we just acknowledge it so the conversation can continue.
    return { ok: true };
  }

  return { error: `Unknown tool: ${name}` };
}

interface ProposedEstimate {
  items: { scope_of_work: string; quantity: number; unit_price: number; estimated_hours: number }[];
  notes: string;
}

// deno-lint-ignore no-explicit-any
async function runAgentLoop(ownerId: string, messages: any[], systemPrompt: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const loopMessages = [...messages];
  let latestProposal: ProposedEstimate | null = null;

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
        max_tokens: 2048,
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
          if (block.name === "propose_estimate") {
            latestProposal = block.input as ProposedEstimate;
          }
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
    return { reply: textBlock?.text ?? "", messages: loopMessages, proposal: latestProposal };
  }

  return {
    reply: "Sorry, I'm having trouble pulling that together — could you try rephrasing?",
    messages: loopMessages,
    proposal: latestProposal,
  };
}

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
    const ownerId = userData.user.id;

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), { status: 400, headers: jsonHeaders });
    }

    const { data: priceBookItems } = await supabase
      .from("price_book_items")
      .select("category, item_name, unit, low_cents, high_cents")
      .eq("owner_id", ownerId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("service_area")
      .eq("id", ownerId)
      .maybeSingle();
    const serviceArea = profile?.service_area || null;

    const priceBookText =
      priceBookItems && priceBookItems.length > 0
        ? priceBookItems
            .map((i) => `- ${i.category} / ${i.item_name} (${i.unit}): $${i.low_cents / 100}–$${i.high_cents / 100}`)
            .join("\n")
        : "(empty — no price book items on file yet)";

    const fallbackInstructions = serviceArea
      ? `For anything the Price Book doesn't cover, use the Unit Cost Method: estimate the labor hours the item typically takes, multiply by a fair going labor rate for the ${serviceArea} area, and add a reasonable materials cost on top.`
      : `For anything the Price Book doesn't cover, use your best judgment for a typical, reasonable price based on what's described — there's no service area set in Settings to localize a labor rate to yet.`;

    const systemPrompt = `You are a contractor's own assistant helping them draft an estimate through conversation — this is internal, talking directly to the business owner, not a customer. Ask short, focused clarifying questions when the scope is unclear (one or two at a time, not a long interrogation) — what's the job, where, how big/how many, any specifics that change the price. Look closely at any attached photos for scope, size, and condition.

This business's Price Book (their own real rates) — use an exact or close match whenever one exists:
${priceBookText}

${fallbackInstructions}

Call propose_estimate every time you have enough to draft or update the line items — the first rough pass as soon as you reasonably can, and again whenever something changes. Every line item's scope_of_work must be at least one full sentence spelling out the actual steps and finish (never a short label), and every line item needs a real estimated_hours (never 0). Break the job into sensible line items rather than one lump sum when it makes sense to.

Keep your chat replies short and conversational — the draft itself is shown separately in the UI, so don't repeat the whole itemized breakdown back in your text reply, just confirm what changed or ask your next question.`;

    const result = await runAgentLoop(ownerId, messages, systemPrompt);
    return new Response(JSON.stringify(result), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
