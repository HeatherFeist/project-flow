// POST { code: string } — Auth required (signed-in owner).
//
// Lets a tester comp their own account by entering a code from the
// Subscribe page, instead of Heather running
// `update profiles set is_exempt = true` by hand for every new tester
// (docs/schema_v37_tester_codes.sql). Redemption count and the active
// flag are only ever touched here, with the service role — a tester
// can't read other codes or forge a redemption client-side since
// tester_codes has no RLS policies at all.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

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

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Missing code" }), { status: 400, headers: jsonHeaders });
    }

    const normalized = code.trim().toUpperCase();
    const { data: ticket, error: lookupError } = await supabase
      .from("tester_codes")
      .select("*")
      .eq("code", normalized)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const isUsable =
      !!ticket &&
      ticket.active &&
      (ticket.max_redemptions === null || ticket.redemption_count < ticket.max_redemptions);

    if (!isUsable) {
      return new Response(JSON.stringify({ error: "That code isn't valid or has already been used up." }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // upsert, not update: a brand-new signup has no profiles row yet (one
    // is only ever created during Onboarding, which sits behind the
    // subscription check) — an update would silently match zero rows and
    // report success while changing nothing.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: userData.user.id, is_exempt: true });
    if (profileError) throw profileError;

    const { error: incrementError } = await supabase
      .from("tester_codes")
      .update({ redemption_count: ticket.redemption_count + 1 })
      .eq("code", normalized);
    if (incrementError) throw incrementError;

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
