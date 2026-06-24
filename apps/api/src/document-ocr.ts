// ─── E7 Document Intelligence: image OCR (tesseract.js) ─────────
//
// Engineer-mode OCR for image inputs (png/jpg/...). tesseract.js is pure WASM
// (no native build); it's lazy-imported on first real use, so importing this
// module never loads the WASM. The recognizer is injectable so the orchestration
// (size/empty guards, error→unavailable) is testable without running OCR.

export interface OcrResult {
  available: boolean;
  text: string;
}

export type Recognizer = (image: Buffer, lang: string) => Promise<string>;

const MAX_OCR_BYTES = 10 * 1024 * 1024; // 10 MiB image cap (bounds OCR work)

/** Does this mime type warrant OCR (a raster image)? */
export function isImageMime(mime: string | undefined): boolean {
  return typeof mime === "string" && /^image\/(png|jpe?g|bmp|tiff?|webp|gif)$/i.test(mime.trim());
}

/**
 * OCR an image with an injected recognizer. Guards empty/oversized buffers and
 * turns any recognizer failure into `available:false` (never throws), so the
 * caller degrades gracefully when OCR isn't usable.
 */
export async function ocrImageWith(image: Buffer, recognize: Recognizer, lang = "eng"): Promise<OcrResult> {
  if (!Buffer.isBuffer(image) || image.length === 0 || image.length > MAX_OCR_BYTES) {
    return { available: false, text: "" };
  }
  try {
    const text = await recognize(image, lang);
    return { available: true, text: (text ?? "").trim() };
  } catch {
    return { available: false, text: "" };
  }
}

interface TesseractWorker {
  recognize: (b: Buffer) => Promise<{ data?: { text?: string } }>;
  terminate: () => Promise<unknown>;
}

/** Real recognizer — lazy tesseract.js worker. Untested live (WASM/traineddata). */
export async function tesseractRecognize(image: Buffer, lang: string): Promise<string> {
  const mod = (await import("tesseract.js")) as unknown as { createWorker: (l: string) => Promise<TesseractWorker> };
  const worker = await mod.createWorker(lang);
  try {
    const { data } = await worker.recognize(image);
    return typeof data?.text === "string" ? data.text : "";
  } finally {
    await worker.terminate();
  }
}

/** OCR an image via the real tesseract recognizer (lazy WASM load on first call). */
export async function ocrImage(image: Buffer, lang = "eng"): Promise<OcrResult> {
  return ocrImageWith(image, tesseractRecognize, lang);
}
