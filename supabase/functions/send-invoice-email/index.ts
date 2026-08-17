// POST { invoiceId: string }
// Auth: caller's Supabase JWT (the business owner). Emails the invoice to
// the client via the owner's connected Gmail account, with a "Pay Now" link.

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

    const { invoiceId } = await req.json();

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, client:clients(id, name, email)")
      .eq("id", invoiceId)
      .eq("owner_id", ownerId)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!invoice.client?.email) {
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
    const payUrl = `${siteUrl}/pay/${invoice.pay_token}`;
    const businessName = profile?.business_name || userData.user.email;
    const remainingCents = invoice.total_cents - invoice.amount_paid_cents;

    const itemsHtml = (invoice.items ?? [])
      .map(
        (item: { description: string; quantity: number; unit_price_cents: number }) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.description}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${item.quantity}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price_cents)}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;">
        <h2 style="margin-bottom:0;">Invoice from ${businessName}</h2>
        <p style="color:#555;margin-top:4px;">Hi ${invoice.client.name}, here's your invoice.</p>
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
        <p style="text-align:right;">Total: ${formatCurrency(invoice.total_cents)}</p>
        ${invoice.amount_paid_cents > 0 ? `<p style="text-align:right;color:#16a34a;">Paid so far: ${formatCurrency(invoice.amount_paid_cents)}</p>` : ""}
        <p style="font-size:18px;font-weight:600;text-align:right;">Balance due: ${formatCurrency(remainingCents)}</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${payUrl}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Pay Now</a>
        </div>
        <p style="color:#777;font-size:13px;">You can pay the full balance or a partial amount. This link is unique to you — no account needed.</p>
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
      to: invoice.client.email,
      subject: `Invoice from ${businessName}`,
      html,
    });

    await supabase
      .from("invoices")
      .update({ status: invoice.status === "draft" ? "sent" : invoice.status, sent_at: new Date().toISOString() })
      .eq("id", invoiceId);

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
