// POST { address: string, heading?: number }
// Auth required (the signed-in owner). Fetches a real, eye-level exterior
// photo of a street address from Google's Street View Static API, so a
// quote's "before" photo for an exterior renovation visualization can
// come from an address instead of requiring an in-person photo first.
//
// Deliberately NOT satellite/aerial imagery — Google Maps' top-down
// satellite view doesn't show walls, siding, roofline, or a front door,
// so it's useless for a realistic exterior renovation mockup. Street
// View's ground-level photos are what the Gemini visualization step
// actually needs to work with, the same way an uploaded photo would.
// (Google also offers an "Aerial View" cinematic flyover product, but
// it has limited address coverage and isn't a static image Gemini can
// edit — not a fit here either.)
//
// Bring-your-own-key — same reasoning as Gemini/SerpApi: billed per
// request directly to whoever's Google Maps Platform key is connected.

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
    const ownerId = userData.user.id;

    const { address, heading } = await req.json();
    if (!address || typeof address !== "string" || !address.trim()) {
      return new Response(JSON.stringify({ error: "Missing address" }), { status: 400, headers: jsonHeaders });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("google_maps_api_key")
      .eq("id", ownerId)
      .maybeSingle();
    const apiKey = profile?.google_maps_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Add your Google Maps API key in Settings first." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const location = encodeURIComponent(address.trim());

    // Metadata check first (free, doesn't count against the billed image
    // quota) so a bad/uncovered address gets a clear message instead of
    // a generic "no imagery available" placeholder photo.
    const metadataRes = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${location}&key=${apiKey}`,
    );
    const metadata = await metadataRes.json();
    if (metadata.status !== "OK") {
      return new Response(
        JSON.stringify({
          error:
            metadata.status === "ZERO_RESULTS"
              ? "No Street View imagery found for that address — try uploading a photo instead."
              : `Street View lookup failed: ${metadata.status}`,
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const params = new URLSearchParams({
      size: "640x400",
      location: address.trim(),
      fov: "80",
      key: apiKey,
    });
    // Omitting heading lets Google auto-point the camera at the given
    // address — usually a good default; a specific heading (0-360, where
    // 0/360 = north) lets the owner try a different angle if the default
    // view doesn't show the right side of the building.
    if (typeof heading === "number") params.set("heading", String(heading));

    const imageRes = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params.toString()}`);
    if (!imageRes.ok) {
      throw new Error(`Street View image request failed: ${await imageRes.text()}`);
    }
    const bytes = new Uint8Array(await imageRes.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    return new Response(JSON.stringify({ base64: btoa(binary), mimeType: "image/jpeg" }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
