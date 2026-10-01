// Screenshot / map-image import (browser only).
//   1. If the server has ANTHROPIC_API_KEY, Claude's vision model reads the listings.
//   2. Otherwise free on-device OCR (Tesseract.js, loaded on demand) extracts the text.
// Either way the result lands in the paste box for review before anything is imported.

declare global {
  interface Window { Tesseract?: { createWorker: (lang: string) => Promise<{ recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> } }
}

const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

// Downscale to keep uploads small and OCR fast.
export async function imageToJpeg(file: Blob, maxSide = 1800): Promise<{ dataUrl: string; base64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { dataUrl, base64: dataUrl.split(",")[1] || "" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the OCR engine"));
    document.head.appendChild(s);
  });
  if (!window.Tesseract) throw new Error("OCR engine unavailable");
  return window.Tesseract;
}

export async function ocrImage(dataUrl: string): Promise<string> {
  const T = await loadTesseract();
  const worker = await T.createWorker("eng");
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

const SKIP_LINE = /^(\d(\.\d)?\s*(★|\*|\(|$)|\(\d[\d,]*\)|open\b|opens\b|closed\b|closes\b|directions|website|call\b|save\b|share\b|sponsored|results?\b|showing\b|reviews?\b|\$+\s*$|·\s*$)/i;
const CATEGORY_ONLY = /^(cold storage facility|warehouse|refrigerated warehouse|food processing company|meat processor|meat packer|dairy|creamery|brewery|distillery|winery|manufacturer|distribution service|logistics service|wholesaler|food products supplier|ice supplier|seafood wholesaler|produce wholesaler|corporate office|factory|industrial equipment supplier|refrigeration contractor|hvac contractor)\b/i;

// Turn OCR text from a Google Maps results list (name / rating / "Category · Address" /
// hours) into one "Name — Category, Address" line per facility.
export function ocrToFacilityLines(text: string): string[] {
  const out: Array<{ name: string; category?: string; address?: string }> = [];
  const last = () => out[out.length - 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|•]+/g, "·").replace(/\s+/g, " ").trim();
    if (line.length < 3 || /^[★☆*\s\d.,()]+$/.test(line)) continue;
    const parts = line.split("·").map((x) => x.trim()).filter(Boolean);
    const addr = parts.find((x) => /^\d{1,6}\s+[A-Za-z0-9]/.test(x));
    const category = parts.find((x) => CATEGORY_ONLY.test(x));
    if (SKIP_LINE.test(line) || addr || (category && parts.length === 1)) {
      // Detail line for the facility above (rating, category, address, hours).
      const prev = last();
      if (prev) {
        if (addr && !prev.address) prev.address = addr;
        if (category && !prev.category) prev.category = category;
      }
      continue;
    }
    out.push({ name: parts[0] });
  }
  const lines = out
    .filter((f) => /[A-Za-z]{3}/.test(f.name) && f.name.length <= 80)
    .map((f) => `${f.name}${f.category ? ` — ${f.category}` : ""}${f.address ? `, ${f.address}` : ""}`);
  return [...new Set(lines)];
}
