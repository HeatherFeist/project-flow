// POST { quoteId, prompt, baseImage: {base64, mimeType}, referenceImages: [{base64, mimeType}] }
// Auth required (the signed-in owner). Generates an "after" visualization
// via Gemini from a room photo + optional reference/material photos +
// a text prompt, uploads the result to the public quote-visuals bucket,
// and records it against the quote so it can show on the client-facing
// /q/:token page. Uses the owner's own Gemini API key (BYOK — see
// _shared/gemini.ts) since this is a usage-billed feature.

import { CORS_HEADERS, serviceClient } from "../_shared/google.ts";
import { generateVisualization } from "../_shared/gemini.ts";

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

    const { quoteId, prompt, baseImage, referenceImages } = await req.json();
    if (!quoteId || !prompt || !baseImage?.base64) {
      return new Response(JSON.stringify({ error: "Missing quoteId, prompt, or baseImage" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id")
      .eq("id", quoteId)
      .eq("owner_id", ownerId)
      .single();
    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("gemini_api_key")
      .eq("id", ownerId)
      .maybeSingle();
    if (!profile?.gemini_api_key) {
      return new Response(
        JSON.stringify({ error: "Add your Gemini API key in Settings first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const result = await generateVisualization({
      apiKey: profile.gemini_api_key,
      prompt,
      baseImage: { base64: baseImage.base64, mimeType: baseImage.mimeType || "image/jpeg" },
      referenceImages: Array.isArray(referenceImages)
        ? referenceImages.map((img: { base64: string; mimeType?: string }) => ({
            base64: img.base64,
            mimeType: img.mimeType || "image/jpeg",
          }))
        : [],
    });

    const ext = result.mimeType.includes("png") ? "png" : "jpg";
    const path = `${ownerId}/${quoteId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("quote-visuals")
      .upload(path, bytes, { contentType: result.mimeType });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from("quote-visuals").getPublicUrl(path);

    const { data: row, error: insertError } = await supabase
      .from("quote_visualizations")
      .insert({
        quote_id: quoteId,
        owner_id: ownerId,
        prompt,
        result_path: path,
        result_url: publicUrlData.publicUrl,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ visualization: row }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
