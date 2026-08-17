// GET ?token=<accept_token>
// Returns open scheduling slots for the quote's owner. Slot math lives in
// _shared/scheduling.ts (shared with the estimate chatbot's tool).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { computeAvailableSlots } from "../_shared/scheduling.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

    const supabase = serviceClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, owner_id, status")
      .eq("accept_token", token)
      .single();

    if (error || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
    }

    if (quote.status !== "accepted") {
      return new Response(JSON.stringify({ error: "Quote must be accepted before scheduling." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const result = await computeAvailableSlots(quote.owner_id);
    return new Response(JSON.stringify(result), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
