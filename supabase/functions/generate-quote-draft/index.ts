// POST { prompt: string, images: { base64: string; mediaType: string }[] }
// Auth required (the signed-in owner). Sends the owner's own description
// of a job — plus any photos of the site/damage/materials — to Claude,
// along with their actual Price Book, and gets back a draft line-item
// estimate to review and edit before saving as a real Quote. This is an
// internal drafting tool for the owner, not the public-facing
// estimate-chat widget (which talks to customers and books visits) —
// this one hands back structured line items, not a conversation.
//
// Pricing approach mirrors estimate-chat: prefer an exact Price Book
// match; when there isn't one, fall back to the Unit Cost Method
// (estimate labor hours x a fair local rate, plus a reasonable materials
// cost) — the same buildup approach classic pricing guides like Homewyse
// use, localized to the owner's own service area.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const TOOL = {
  name: "draft_estimate",
  description: "A draft, itemized estimate for the job described, ready for the contractor to review and edit.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Line items making up the estimate.",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "What this line item is, e.g. 'Install 2 GFCI outlets'" },
            quantity: { type: "number", description: "How many units of this line item, e.g. 2" },
            unit_price: { type: "number", description: "Price per unit, in dollars, e.g. 85.00" },
          },
          required: ["description", "quantity", "unit_price"],
        },
      },
      notes: {
        type: "string",
        description:
          "A short internal note (not shown to the client) summarizing pricing assumptions — which items came from the Price Book vs. were estimated with the Unit Cost Method, and anything worth double-checking before sending.",
      },
    },
    required: ["items", "notes"],
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
    const ownerId = userData.user.id;

    const { prompt, images } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Describe the job first." }), { status: 400, headers: jsonHeaders });
    }
    const attachedImages: { base64: string; mediaType: string }[] = Array.isArray(images) ? images : [];

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

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
      ? `For anything the Price Book doesn't cover, use the Unit Cost Method: estimate the labor hours the item typically takes, multiply by a fair going labor rate for the ${serviceArea} area, and add a reasonable materials cost on top. Say so in the notes.`
      : `For anything the Price Book doesn't cover, use your best judgment for a typical, reasonable price based on the job description and photos, and say so clearly in the notes — there's no service area set in Settings to localize a labor rate to yet.`;

    const systemPrompt = `You are helping a contractor draft a rough estimate for their own review — this is an internal drafting tool, not something sent directly to a client. Read their description of the job (and look closely at any attached photos — visible damage, scope, materials, size of the area) and produce a clear, itemized draft estimate.

This business's Price Book (their own real rates from past jobs) — use an exact or close match whenever one exists:
${priceBookText}

${fallbackInstructions}

Break the job into a handful of clear, sensible line items rather than one lump sum when it makes sense to (e.g. separate labor from materials, or separate distinct tasks) — but don't over-fragment a simple job into dozens of tiny lines either. Always call draft_estimate with your result.`;

    const contentBlocks: Record<string, unknown>[] = attachedImages.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType || "image/jpeg", data: img.base64 },
    }));
    contentBlocks.push({ type: "text", text: prompt });

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
        tools: [TOOL],
        tool_choice: { type: "tool", name: "draft_estimate" },
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${await res.text()}`);
    }

    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const toolUse = data.content.find((b: any) => b.type === "tool_use");
    if (!toolUse) throw new Error("Claude didn't return a structured estimate.");

    const draft = toolUse.input as {
      items: { description: string; quantity: number; unit_price: number }[];
      notes: string;
    };

    return new Response(
      JSON.stringify({
        items: draft.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit_price_cents: Math.round(i.unit_price * 100),
        })),
        notes: draft.notes ?? "",
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
