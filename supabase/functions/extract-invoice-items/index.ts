// POST { imageBase64: string, mediaType: string }
// Auth required (the signed-in owner). Sends a photographed past invoice
// (paper or printed) to Claude's vision and extracts structured service
// line items — what was charged, not what was bought. Companion to
// extract-receipt-items, which pulls purchased *materials* off a receipt;
// this one pulls *services billed to a customer* off an old invoice, so
// real historical pricing can seed the Price Book instead of typing it
// back in by hand. Forces a tool call so the response is always
// structured JSON, not freeform text to parse.
//
// This is a one-shot extraction only — nothing gets written to the Price
// Book here. The frontend shows the extracted items in an editable review
// dialog first, same as the receipt scanner, since reading a photographed
// invoice won't always be perfect.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const TOOL = {
  name: "extracted_invoice",
  description: "The service line items extracted from a photographed invoice.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "A short category for this line item, e.g. 'Plumbing', 'Electrical (basic)', 'Drywall & Paint' — group similar work types under the same category name.",
            },
            item_name: { type: "string", description: "The service/job description as printed, e.g. 'Faucet replacement'" },
            price: { type: "number", description: "The line item's price in dollars, e.g. 225.00" },
            unit: {
              type: "string",
              enum: ["flat", "per hour", "per sq ft", "per linear ft"],
              description: "Best guess at how this was priced, from context. Default to 'flat' if unclear.",
            },
          },
          required: ["item_name", "price"],
        },
      },
    },
    required: ["items"],
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

    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Missing imageBase64" }), { status: 400, headers: jsonHeaders });
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
        max_tokens: 1536,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "extracted_invoice" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
              },
              {
                type: "text",
                text: "Extract every billed service/labor line item from this invoice — skip subtotal/tax/total lines, discounts, customer/business info, and any purchased-materials line items (those belong in a Materials catalog, not here — only pull what was charged for work/service performed). If a price or description isn't legible, leave it out rather than guessing.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${await res.text()}`);
    }

    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const toolUse = data.content.find((b: any) => b.type === "tool_use");
    const result = toolUse?.input ?? { items: [] };

    return new Response(JSON.stringify(result), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
