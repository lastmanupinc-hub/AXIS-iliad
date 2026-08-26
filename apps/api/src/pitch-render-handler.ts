// ─── pitch — POST /v1/pitch/render: the missing "give me an actual file" step ─
//
// generators-pitch.ts (generator-core) produces pitch-deck.md/.json — real,
// evidence-grounded content, but text/JSON, never a file a person can open in
// PowerPoint/Keynote/Preview and present. User feedback (2026-08-25): "that's
// not a pitch deck, that's a bunch of facts in chat — the deck needs to
// produce .pdf or .pptx." This endpoint closes that gap: reads an EXISTING
// snapshot's already-generated pitch-deck.json and renders it to a real
// .pptx via pitch-deck-render.ts.
//
// Billing: rendering is included in the same pitch-program purchase that
// already generated pitch-deck.json — this converts already-paid-for content
// into a usable format, it does not charge again. Same ownership/entitlement
// gate as get_artifact (account must own the snapshot; pitch must be enabled
// on the account), no NEW MPP charge path.
//
// AI backgrounds are opt-in and best-effort: render_backgrounds=true attempts
// one xAI call per distinct slide `art` key (bounded by MAX_BACKGROUND_CALLS,
// which tracks the evidence-skeleton's own key count) and NEVER fails the
// whole request if xAI is unconfigured or a call errors — those slides just get the clean solid-color fallback
// background pitch-deck-render.ts already provides, and the response is
// honest about exactly which slides got real art via X-Axis-Slides-With-Art.

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";
import { getSnapshot, getGeneratorResult, isProgramEnabled } from "@axis/snapshots";
import type { GeneratorResult } from "@axis/generator-core";
import { renderPitchDeckPptx, type PitchDeckPayload, type PitchRenderVariant } from "./pitch-deck-render.js";
import { generateSlideBackground } from "./xai-images.js";

const PITCH_DECK_ARTIFACT_PATH = "pitch-deck.json";
/** slide-art-prompts.json's own key set (generators-pitch.ts's buildSlides) — bounds the worst-case xAI call count per render (9 keys since the evidence-skeleton restructure). */
const MAX_BACKGROUND_CALLS = 9;

export async function handlePitchRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id;
  if (typeof snapshotId !== "string" || !snapshotId) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required — run POST /v1/pitch/generate first");
    return;
  }
  const renderBackgrounds = body.render_backgrounds === true;

  // Two-document contract (see pitch-deck-render.ts): "clean" is the investor
  // deck and the default; "annotated" is the diligence copy with speaker notes
  // and provenance footers. An unrecognized value is a caller mistake worth a
  // 400, not a silent fallback — sending the wrong document to an investor is
  // exactly the failure mode this parameter exists to prevent.
  // `=== undefined`, not `??`: an explicit `"variant": null` is a caller
  // mistake and must 400 like any other bad value, not silently mean "clean".
  const rawVariant = body.variant === undefined ? "clean" : body.variant;
  if (rawVariant !== "clean" && rawVariant !== "annotated") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, 'variant must be "clean" (investor deck, default) or "annotated" (diligence copy with speaker notes + provenance)');
    return;
  }
  const variant: PitchRenderVariant = rawVariant;

  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  // Same ownership framing as get_snapshot/get_artifact: a mismatched caller
  // learns nothing about whether the snapshot exists.
  if (snapshot.account_id && snapshot.account_id !== ctx.account!.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }

  const enabled = await isProgramEnabled(ctx.account!.account_id, "pitch");
  if (!enabled) {
    sendError(res, 402, ErrorCode.PAYMENT_REQUIRED, "The pitch program is not enabled on this account — call POST /v1/pitch/generate first, or upgrade at iliad.trustfabric.ai/billing.");
    return;
  }

  const generated = (await getGeneratorResult(snapshotId)) as GeneratorResult | undefined;
  const deckFile = generated?.files.find((f) => f.path === PITCH_DECK_ARTIFACT_PATH);
  if (!deckFile) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `No ${PITCH_DECK_ARTIFACT_PATH} artifact on this snapshot — call POST /v1/pitch/generate first.`);
    return;
  }

  let deck: PitchDeckPayload;
  try {
    deck = JSON.parse(deckFile.content) as PitchDeckPayload;
  } catch {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Stored pitch-deck.json is not valid JSON — regenerate via POST /v1/pitch/generate.");
    return;
  }
  if (!Array.isArray(deck.slides)) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Stored pitch-deck.json has no slides array — regenerate via POST /v1/pitch/generate.");
    return;
  }

  const backgrounds: Record<string, Buffer> = {};
  if (renderBackgrounds) {
    const artKeys = [...new Set(deck.slides.map((s) => s.art))].slice(0, MAX_BACKGROUND_CALLS);
    await Promise.all(
      artKeys.map(async (key) => {
        const slide = deck.slides.find((s) => s.art === key);
        if (!slide) return;
        // Reuses the slide's own deterministic prompt text — read from the
        // sibling slide-art-prompts.json artifact when present; falls back to
        // a title-derived prompt if that artifact wasn't generated this run.
        const promptsFile = generated?.files.find((f) => f.path === "slide-art-prompts.json");
        let motif = `Background for slide: ${slide.title}`;
        if (promptsFile) {
          try {
            const parsed = JSON.parse(promptsFile.content) as { prompts?: Record<string, string> };
            motif = parsed.prompts?.[key] ?? motif;
          } catch {
            // Fall through to the title-derived fallback — never fail the render over a malformed sibling artifact.
          }
        }
        const result = await generateSlideBackground(motif).catch(() => null);
        if (result && result.ok) backgrounds[key] = result.bytes;
      }),
    );
  }

  const rendered = await renderPitchDeckPptx(deck, { backgrounds, variant });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename="${(deck.project ?? "pitch-deck").replace(/[^A-Za-z0-9._-]/g, "_")}${variant === "annotated" ? "-annotated" : ""}.pptx"`);
  res.setHeader("X-Axis-Slides-With-Art", rendered.slides_with_art.join(","));
  res.setHeader("X-Axis-Slides-Total", String(rendered.slides_total));
  res.setHeader("X-Axis-Variant", rendered.variant);
  res.writeHead(200);
  res.end(rendered.buffer);
}
