// GET ?token=<photo_share_token>
// Public (no auth) — returns a job's title, business info, and its photo
// gallery (from job_photos, not the legacy jobs.photo_urls array) for the
// no-login /job-gallery/:token page, so a client can be sent a link to
// see progress photos without ever creating an account.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: jsonHeaders });

    const supabase = serviceClient();

    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, title, owner_id, client:clients(name)")
      .eq("photo_share_token", token)
      .single();

    if (error || !job) {
      return new Response(JSON.stringify({ error: "Gallery not found" }), { status: 404, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("id", job.owner_id)
      .maybeSingle();

    const { data: photos } = await supabase
      .from("job_photos")
      .select("id, url, caption, taken_by, created_at")
      .eq("job_id", job.id)
      .order("created_at");

    return new Response(
      JSON.stringify({
        job: { title: job.title, client: job.client ?? null },
        business: profile ?? null,
        photos: photos ?? [],
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
