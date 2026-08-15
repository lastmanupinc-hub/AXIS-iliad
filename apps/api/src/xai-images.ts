// ─── xAI image client — slide backgrounds for the pitch program ─────────────
//
// The deterministic half of pitch lives in generator-core (slide-art-prompts
// .json — pure text, derived from repo facts). THIS is the runtime half: turn
// those prompts into actual background images via xAI's image generation API.
// Same architectural split as canvas: canvas-spec.json is deterministic, the
// D2 render shells out at runtime. Image generation is never part of the
// byte-deterministic pipeline and no test asserts image bytes.
//
// Prompt wrapping happens HERE, not in the generator: the generator's prompt
// describes the slide's motif from repo facts; the wrapper enforces the
// non-negotiables that make an image usable as a deck background regardless of
// what the motif says — and they are appended LAST so they win any conflict
// with motif text. No API key: functions throw a typed error; nothing in the
// suite calls xAI unless XAI_API_KEY is present (live tests are skipIf-gated).
//
// Endpoint pricing is an OWNER decision — there is deliberately no public
// route in this file yet. scripts/pitch-backgrounds.mjs is the operator path.

import { log } from "./logger.js";

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
// Verified against GET /v1/models on the owner's actual team (2026-08-13) —
// the first list here was written from stale knowledge ("grok-2-image…") and
// the API 404'd both entries. Quality tier FIRST: the owner's spec for this
// program is "honest sales pitch on quality slide art", and the walk-down
// covers teams that only carry the smaller models.
const XAI_IMAGE_MODELS = ["grok-imagine-image-quality", "grok-imagine-image-2.0", "grok-imagine-image"];

const REQUEST_TIMEOUT_MS = 120_000;

/** Appended AFTER the motif prompt so these constraints win any conflict. */
const BACKGROUND_CONTRACT =
  " Render as a slide BACKGROUND: 16:9, muted, low visual noise, generous empty areas safe for overlaid white text." +
  " Absolutely no words, letters, numbers, logos, watermarks, UI screenshots, or human faces.";

export interface XaiImageResult {
  ok: true;
  model: string;
  /** Raw PNG/JPEG bytes, base64-decoded. */
  bytes: Buffer;
  prompt_used: string;
}
export interface XaiImageError {
  ok: false;
  status: number | null;
  error: string;
}

/** Wrap a slide-art prompt with the background contract. Exported for tests. */
export function wrapSlidePrompt(motifPrompt: string): string {
  const trimmed = motifPrompt.trim();
  return trimmed.endsWith(".") ? `${trimmed}${BACKGROUND_CONTRACT}` : `${trimmed}.${BACKGROUND_CONTRACT}`;
}

/**
 * Generate one background image. Walks the model list on 404-ish model errors,
 * returns the first success. Never throws on API failure — callers get a typed
 * error they can surface; a deck without backgrounds is degraded, not broken.
 */
export async function generateSlideBackground(
  motifPrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XaiImageResult | XaiImageError> {
  const key = process.env.XAI_API_KEY;
  if (!key) return { ok: false, status: null, error: "XAI_API_KEY is not configured" };

  const prompt = wrapSlidePrompt(motifPrompt);
  let lastError: XaiImageError = { ok: false, status: null, error: "no model attempted" };

  for (const model of XAI_IMAGE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${XAI_BASE}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt, n: 1, response_format: "b64_json" }),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        lastError = { ok: false, status: res.status, error: text.slice(0, 500) };
        // Unknown model → try the next one; anything else is terminal for this call.
        if (res.status === 404 || /model.*(not found|does not exist|invalid)/i.test(text)) continue;
        return lastError;
      }
      const parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
      const b64 = parsed.data?.[0]?.b64_json;
      if (!b64) {
        // Some deployments return URLs even when b64 was requested — fetch it.
        const url = parsed.data?.[0]?.url;
        if (url) {
          const img = await fetchImpl(url);
          if (!img.ok) return { ok: false, status: img.status, error: `image URL fetch failed (${img.status})` };
          const buf = Buffer.from(await img.arrayBuffer());
          return { ok: true, model, bytes: buf, prompt_used: prompt };
        }
        return { ok: false, status: res.status, error: "response carried neither b64_json nor url" };
      }
      return { ok: true, model, bytes: Buffer.from(b64, "base64"), prompt_used: prompt };
    } catch (err) {
      lastError = {
        ok: false,
        status: null,
        error: err instanceof Error ? (err.name === "AbortError" ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : err.message) : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  log("warn", "xai_image_generation_failed", { status: lastError.status, error: lastError.error.slice(0, 200) });
  return lastError;
}
