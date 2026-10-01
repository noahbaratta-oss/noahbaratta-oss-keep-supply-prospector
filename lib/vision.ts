// Optional: read facility lists out of screenshots (Google Maps results, directories) with
// Claude's vision model. Only active when ANTHROPIC_API_KEY is set in Vercel; otherwise the
// browser falls back to free on-device OCR.

import { fetchText } from "./http";

export function visionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const PROMPT = `This image is a screenshot of business listings (for example Google Maps results, a directory, or a spreadsheet).
List every business or facility you can read. Output one per line in exactly this format:
Name | street address | city | state (2-letter) | category
Write "unknown" for any part that is not visible. Copy names and addresses exactly as shown; never guess or invent details.
Output only the lines, nothing else.`;

export async function extractFacilitiesFromImage(base64: string, mediaType: string): Promise<{ lines: string[]; model: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const r = await fetchText("https://api.anthropic.com/v1/messages", {
    method: "POST",
    timeout: 45000,
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!r.ok) throw new Error(`Vision request failed (HTTP ${r.status})`);
  const j = JSON.parse(r.text);
  const text: string = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|"))
    .map((l) => l.split("|").map((x) => x.trim()).filter((x) => x && !/^unknown$/i.test(x)))
    .filter((parts) => parts.length >= 1)
    .map((parts) => parts.join(", "));
  return { lines, model };
}
