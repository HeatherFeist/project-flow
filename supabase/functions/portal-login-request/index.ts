// POST { ownerId: string, email: string }
// Public (no auth). Looks up a client of this owner by email; if found,
// creates a one-time login token and emails a magic link via the owner's
// connected Gmail. Always returns a generic success message either way —
// doesn't reveal whether that email matches a client, to avoid leaking
// who's a customer of this business.

import { CORS_HEADERS, getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const GENERIC_RESPONSE = { ok: true, message: "If that email matches an account, a login link is on its way." };

  try {
    const { ownerId, email } = await req.json();
    if (!ownerId || !email) {
      return new Response(JSON.stringify({ error: "Missing ownerId or email" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = serviceClient();

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email")
      .eq("owner_id", ownerId)
      .ilike("email", email.trim())
      .maybeSingle();

    if (!client) {
      // Same response as success, deliberately — see comment above.
      return new Response(JSON.stringify(GENERIC_RESPONSE), { headers: jsonHeaders });
    }

    const { data: connection } = await supabase
      .from("google_connections")
      .select("google_email")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (!connection) {
      return new Response(
        JSON.stringify({ error: "This business hasn't connected email yet — contact them directly." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: tokenRow, error: tokenError } = await supabase
      .from("client_portal_login_tokens")
      .insert({ client_id: client.id, owner_id: ownerId })
      .select("id")
      .single();
    if (tokenError || !tokenRow) throw tokenError ?? new Error("Failed to create login token");

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("id", ownerId)
      .maybeSingle();
    const businessName = profile?.business_name || "your contractor";

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const loginUrl = `${siteUrl}/portal/${ownerId}/verify?token=${tokenRow.id}`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
        <p>Hi ${client.name},</p>
        <p>Here's your link to view your project with ${businessName} — quotes, invoices, and photos, all in one place.</p>
        <p><a href="${loginUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;">View my project</a></p>
        <p style="color:#666;font-size:13px;">This link works once and expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
      </div>`;

    const accessToken = await getFreshAccessToken(ownerId);
    await sendGmail({
      accessToken,
      fromEmail: connection.google_email ?? "",
      fromName: businessName,
      to: client.email!,
      subject: `Your ${businessName} project link`,
      html,
    });

    return new Response(JSON.stringify(GENERIC_RESPONSE), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
