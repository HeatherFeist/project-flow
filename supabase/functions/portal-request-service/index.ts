// POST { sessionToken: string, message: string }
// Public (no auth), session-scoped. Lets a client ask for additional work
// from inside the portal — logs it as a service_requests row for the
// owner to review (doesn't auto-create a Quote/Job, since scoping and
// pricing new work needs a human decision).

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { validatePortalSession } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { sessionToken, message } = await req.json();
    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ error: "Enter a message first." }), { status: 400, headers: jsonHeaders });
    }

    const supabase = serviceClient();

    let clientId: string, ownerId: string;
    try {
      ({ clientId, ownerId } = await validatePortalSession(supabase, sessionToken));
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Not signed in" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { error } = await supabase.from("service_requests").insert({
      owner_id: ownerId,
      client_id: clientId,
      message: message.trim(),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
