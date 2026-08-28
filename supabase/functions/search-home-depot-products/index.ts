// POST { query: string }
// Auth required (the signed-in owner). Searches Home Depot's product
// catalog via SerpApi's `home_depot` search engine (SerpApi scrapes Home
// Depot's public search results — there's no official Home Depot API for
// third parties) using the owner's own SerpApi key (docs/schema_v25;
// bring-your-own-key, same reasoning as Gemini/Twilio/Stripe/PayPal —
// billed per search to their own account).
//
// NOTE ON FIELD NAMES: SerpApi's documented response fields (title,
// price/extracted_price, thumbnail, link, product_id, model_number) are
// normalized defensively below with fallbacks, since this integration
// was built without the ability to hit SerpApi's live docs/playground to
// confirm the exact current shape. If results come back visibly wrong
// (missing prices/images) after a real search, check the `raw` field in
// a failed/odd response against SerpApi's actual output and adjust
// `normalizeProduct` accordingly — that's expected to need one real
// round-trip to nail down, same as any first integration with a
// third-party API's exact response shape.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

// deno-lint-ignore no-explicit-any
function firstDefined(...values: any[]): any {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function parsePriceCents(product: any): number | null {
  const raw = firstDefined(product.extracted_price, product.price, product.price_raw);
  if (raw === null) return null;
  if (typeof raw === "number") return Math.round(raw * 100);
  const match = String(raw).replace(/,/g, "").match(/[\d.]+/);
  if (!match) return null;
  return Math.round(parseFloat(match[0]) * 100);
}

// deno-lint-ignore no-explicit-any
function normalizeProduct(product: any) {
  return {
    title: firstDefined(product.title, product.name, "Untitled product"),
    priceCents: parsePriceCents(product),
    imageUrl: firstDefined(
      product.thumbnail,
      Array.isArray(product.images) ? product.images[0] : null,
      product.image,
    ),
    productUrl: firstDefined(product.link, product.product_link, product.url),
    itemId: firstDefined(product.product_id, product.pid, product.item_id),
    modelNumber: firstDefined(product.model_number, product.model),
    rating: firstDefined(product.rating, null),
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

    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing search query" }), { status: 400, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("serpapi_key")
      .eq("id", ownerId)
      .maybeSingle();

    const apiKey = profile?.serpapi_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Add your SerpApi key in Settings first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "home_depot");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SerpApi error (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), { status: 400, headers: jsonHeaders });
    }

    const products = data.products ?? data.product_results ?? [];
    const results = products.map(normalizeProduct);

    return new Response(JSON.stringify({ results }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
