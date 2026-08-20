// Shared helper for Google's Gemini image model ("Nano Banana" —
// gemini-2.5-flash-image) — takes a base photo + reference photos +
// a text prompt and returns a generated/edited image. Requires the
// GEMINI_API_KEY secret (from Google AI Studio — a plain API key, NOT
// the same OAuth connection used for Calendar/Gmail elsewhere in this
// app; entirely separate Google product/auth mechanism).
//
// NOTE: built against Google's documented v1beta generateContent REST
// shape (camelCase JSON: inlineData/mimeType). Google's AI APIs move
// fast — if this starts failing, check the current request/response
// shape at ai.google.dev before assuming the API key is the problem.

const MODEL = "gemini-2.5-flash-image";

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export async function generateVisualization(params: {
  prompt: string;
  baseImage: ImageInput;
  referenceImages: ImageInput[];
}): Promise<ImageInput> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const parts: Record<string, unknown>[] = [
    { text: params.prompt },
    { inlineData: { mimeType: params.baseImage.mimeType, data: params.baseImage.base64 } },
    ...params.referenceImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini image generation failed: ${await res.text()}`);
  }

  const data = await res.json();
  const resultParts: { inlineData?: { mimeType: string; data: string } }[] =
    data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = resultParts.find((p) => p.inlineData);

  if (!imagePart?.inlineData) {
    throw new Error("Gemini didn't return an image — try rewording the prompt.");
  }

  return { base64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
}
