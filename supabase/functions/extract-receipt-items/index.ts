// POST { imageBase64: string, mediaType: string }
// Auth required (the signed-in owner). Sends a photographed receipt to
// Claude's vision and extracts structured line items — store name, and
// per item: name, price, and SKU/item # if visible. Forces a tool call so
// the response is always structured JSON, not freeform text to parse.
//
// This is a one-shot extraction only — nothing gets written to the
// Materials table here. The frontend shows the extracted items in an
// editable review dialog first, since OCR-style extraction from a photo
// won't always be perfect (blurry receipts, cut-off totals, etc.).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001";

const TOOL = {
  name: "extracted_receipt",
  description: "The store name and line items extracted from a receipt photo.",
  input_schema: {
    type: "object",
    properties: {
      store: { type: "string", description: "The store/supplier name printed on the receipt, e.g. 'The Home Depot'" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The product name/description as printed" },
            price: { type: "number", description: "The line item's price in dollars, e.g. 12.99" },
            sku: { type: "string", description: "SKU / item # / model #, only if visibly printed" },
          },
          required: ["name", "price"],
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
        tool_choice: { type: "tool", name: "extracted_receipt" },
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
                text: "Extract every purchased line item from this receipt — skip subtotal/tax/total lines, discounts, and store loyalty messaging. If a price or item isn't legible, leave it out rather than guessing.",
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
    const result = toolUse?.input ?? { store: null, items: [] };

    return new Response(JSON.stringify(result), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
