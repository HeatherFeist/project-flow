// POST { quoteId: string }
// Auth: caller's Supabase JWT (the business owner sending the quote).
// Emails the quote to the client via the owner's connected Gmail account,
// with Accept / Decline links back into this app.

import { CORS_HEADERS, getFreshAccessToken, sendGmail, serviceClient } from "../_shared/google.ts";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = serviceClient();

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const ownerId = userData.user.id;

    const { quoteId } = await req.json();

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*, client:clients(id, name, email)")
      .eq("id", quoteId)
      .eq("owner_id", ownerId)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!quote.client?.email) {
      return new Response(JSON.stringify({ error: "This client has no email address on file." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const quoteUrl = `${siteUrl}/q/${quote.accept_token}`;
    const businessName = profile?.business_name || userData.user.email;

    const itemsHtml = (quote.items ?? [])
      .map(
        (item: { description: string; quantity: number; unit_price_cents: number }) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.description}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${item.quantity}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price_cents)}</td>
          </tr>`,
      )
      .join("");

    const logoHtml = profile?.logo_url
      ? `<img src="${profile.logo_url}" alt="${businessName}" style="max-height:56px;max-width:200px;margin-bottom:12px;" />`
      : "";

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;">
        ${logoHtml}
        <h2 style="margin-bottom:0;">Quote from ${businessName}</h2>
        <p style="color:#555;margin-top:4px;">Hi ${quote.client.name}, here's your quote${quote.notes ? `: ${quote.notes}` : "."}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #333;">Item</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #333;">Qty</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #333;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="font-size:18px;font-weight:600;text-align:right;">Total: ${formatCurrency(quote.total_cents)}</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${quoteUrl}/accept" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:12px;">Accept quote</a>
          <a href="${quoteUrl}/decline" style="background:#e5e5e5;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Decline</a>
        </div>
        <p style="color:#777;font-size:13px;">If you accept, you'll be able to pick a date and time right away and it'll go straight onto our schedule. This link is unique to you — no account needed.</p>
      </div>`;

    const accessToken = await getFreshAccessToken(ownerId);
    const { data: connection } = await supabase
      .from("google_connections")
      .select("google_email")
      .eq("user_id", ownerId)
      .single();

    await sendGmail({
      accessToken,
      fromEmail: connection?.google_email ?? userData.user.email!,
      fromName: businessName,
      to: quote.client.email,
      subject: `Quote from ${businessName}`,
      html,
    });

    await supabase
      .from("quotes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", quoteId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
