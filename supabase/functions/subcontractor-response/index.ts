// GET  ?token=<approve_token>              -> the sub's own approval page details
// POST { token, signedName } -> records the sub's sign-off (name typed = agreement)
// No auth — the token itself is the credential, same pattern as
// quote-response. Only ever exposes this one sub's own pay/scope, plus
// enough project context (business, other subs' name+scope, payment
// timeline) for them to know what they're agreeing to and who else is on
// the job — never the client's contact info or the full estimate pricing.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const supabase = serviceClient();
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token");
      if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

      const { data: sub, error } = await supabase
        .from("subcontractors")
        .select("id, name, scope_of_work, pay_cents, signed_name, signed_at, owner_id, quote_id")
        .eq("approve_token", token)
        .single();

      if (error || !sub) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name, phone, email, logo_url")
        .eq("id", sub.owner_id)
        .maybeSingle();

      const { data: quote } = await supabase
        .from("quotes")
        .select("status")
        .eq("id", sub.quote_id)
        .maybeSingle();

      const { data: milestones } = await supabase
        .from("quote_milestones")
        .select("id, title, amount_cents, due_date, sequence")
        .eq("quote_id", sub.quote_id)
        .order("sequence");

      const { data: otherSubs } = await supabase
        .from("subcontractors")
        .select("id, name, scope_of_work")
        .eq("quote_id", sub.quote_id)
        .neq("id", sub.id)
        .order("created_at");

      const { owner_id: _owner_id, quote_id: _quote_id, ...publicSub } = sub;
      return new Response(
        JSON.stringify({
          subcontractor: publicSub,
          business: profile ?? null,
          quote: quote ?? null,
          milestones: milestones ?? [],
          otherSubs: otherSubs ?? [],
        }),
        { headers: jsonHeaders },
      );
    }

    if (req.method === "POST") {
      const { token, signedName } = await req.json();
      if (!token || !signedName || !signedName.trim()) {
        return new Response(JSON.stringify({ error: "Please type your name to sign off." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const { data: sub, error } = await supabase
        .from("subcontractors")
        .select("id, signed_at")
        .eq("approve_token", token)
        .single();

      if (error || !sub) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders });
      }

      if (sub.signed_at) {
        return new Response(JSON.stringify({ error: "This has already been signed." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const { error: updateError } = await supabase
        .from("subcontractors")
        .update({ signed_name: signedName.trim(), signed_at: new Date().toISOString() })
        .eq("id", sub.id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
