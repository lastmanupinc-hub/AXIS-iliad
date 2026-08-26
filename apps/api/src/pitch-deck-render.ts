// ─── pitch — real deck rendering (.pptx) ─────────────────────────────────────
//
// generators-pitch.ts (generator-core) produces pitch-deck.md and pitch-deck
// .json — text and structured data, never a file a person can open in
// PowerPoint/Keynote/Preview and present. That gap was a real product defect
// (found 2026-08-25, user feedback: "that's not a pitch deck, that's a bunch
// of facts in chat — the deck needs to produce .pdf or .pptx"). This is the
// missing runtime half: takes the deterministic pitch-deck.json (slides +
// speaker notes + per-slide art key) and produces an ACTUAL .pptx file via
// pptxgenjs (MIT).
//
// Same architectural split as slide-art-prompts.json / xai-images.ts / D2 /
// canvas: the DATA is deterministic (generator-core), RENDERING is runtime
// enrichment. This file is NOT byte-deterministic — pptxgenjs (and the OOXML
// zip container it builds) is not guaranteed to produce identical bytes for
// identical input across versions or runs, so no determinism test exists for
// it, matching the same honest carve-out this codebase already makes for
// image/video rendering.
//
// Background images are OPTIONAL and additive: when the caller supplies a
// rendered background for a slide's `art` key (from xai-images.ts's
// generateSlideBackground, called separately — this function never calls xAI
// itself, matching the deterministic/runtime split), that slide gets the real
// image. Every other slide gets a clean, professional solid background
// matching slide-art-prompts.json's own STYLE contract (dark slate + one
// accent) — a deck with some AI art and some solid slides is a legitimate,
// honest degraded mode, not a defect, and is never silently inconsistent:
// the caller (handlePitchRender) reports exactly which slides got real art.

// pptxgenjs ships a CommonJS main with type defs under a single "types"
// export condition (no separate .d.mts) — under this repo's NodeNext
// moduleResolution, a static `import PptxGenJS from "pptxgenjs"` resolves to
// a type with no construct signature. Same CJS-interop shape as mammoth
// (document-parsing.ts) — dynamic import + a namespace-or-default cast that
// works regardless of which shape Node's CJS-interop pass produces.
type PptxGenJSCtor = new () => import("pptxgenjs").default;
async function loadPptxGenJS(): Promise<PptxGenJSCtor> {
  const mod = (await import("pptxgenjs")) as unknown as Record<string, unknown> & { default?: unknown };
  const candidate = (typeof mod === "function" ? mod : mod.default) as PptxGenJSCtor | undefined;
  if (typeof candidate !== "function") throw new Error("pptxgenjs module did not export a constructable class");
  return candidate;
}

export interface PitchSlide {
  n: number;
  title: string;
  bullets: string[];
  speaker_notes: string;
  art: string;
  /** v2 payloads carry per-slide provenance; absent on decks generated before
   * the evidence-skeleton restructure — treated as "measured" (the only kind
   * of slide v1 produced). */
  provenance?: "measured" | "owner_input" | "mixed";
}

export interface PitchDeckPayload {
  project: string | null;
  slides: PitchSlide[];
}

/**
 * The two-document contract (owner directive, 2026-08-26): one deterministic
 * pitch-deck.json, two rendered documents.
 *   "clean"     — the investor deck: no speaker notes, no provenance
 *                 annotations. The deck's context must explain itself; a
 *                 slide narrating its own credibility is a slide that
 *                 doesn't trust itself. Sourcing lives in the data room.
 *   "annotated" — the diligence copy: speaker notes attached and a small
 *                 per-slide provenance footer rendered, so the second,
 *                 slower reader can trace every figure.
 */
export type PitchRenderVariant = "clean" | "annotated";

/** Matches slide-art-prompts.json's own STYLE contract (generators-pitch.ts) so a deck with mixed real/fallback backgrounds still reads as one system. */
const BG_BASE = "0F172A"; // dark slate
const ACCENT = "38BDF8"; // single restrained accent (sky-400)
const TEXT_PRIMARY = "F8FAFC";
const TEXT_SECONDARY = "CBD5E1";

const LAYOUT_W = 13.333;
const LAYOUT_H = 7.5;

export interface RenderPitchDeckOptions {
  /** Rendered background PNG/JPEG bytes keyed by the slide's `art` field (e.g. "title", "solution"). Slides with no entry here get the solid fallback background. */
  backgrounds?: Record<string, Buffer>;
  /** Which of the two documents to render — defaults to "clean" (the investor deck). */
  variant?: PitchRenderVariant;
}

export interface RenderPitchDeckResult {
  buffer: Buffer;
  /** Slide numbers that got a real rendered background, for the caller to report honestly (never silently claim every slide has AI art when some fell back). */
  slides_with_art: number[];
  slides_total: number;
  /** Which document was rendered, echoed so callers/report headers never guess. */
  variant: PitchRenderVariant;
}

/**
 * Render a real .pptx from the deterministic pitch-deck.json payload.
 * Pure given its inputs (no network, no xAI call) — background IMAGE BYTES
 * are passed in already-rendered, not fetched here.
 */
export async function renderPitchDeckPptx(
  deck: PitchDeckPayload,
  options: RenderPitchDeckOptions = {},
): Promise<RenderPitchDeckResult> {
  const backgrounds = options.backgrounds ?? {};
  const variant: PitchRenderVariant = options.variant ?? "clean";
  const PptxGenJS = await loadPptxGenJS();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "AXIS_WIDE", width: LAYOUT_W, height: LAYOUT_H });
  pptx.layout = "AXIS_WIDE";
  pptx.author = "AXIS Iliad";
  pptx.company = "Axis' Iliad";
  if (deck.project) pptx.title = `${deck.project} — pitch deck`;

  const slidesWithArt: number[] = [];

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    const bg = backgrounds[s.art];
    if (bg) {
      slide.background = { data: `image/png;base64,${bg.toString("base64")}` };
      slidesWithArt.push(s.n);
    } else {
      slide.background = { color: BG_BASE };
    }

    // Thin accent rule under the title — the "single restrained accent
    // color" from the art contract, present even on fallback-background
    // slides so the whole deck reads as one system either way.
    slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.15, w: 3, h: 0.04, fill: { color: ACCENT }, line: { type: "none" } });

    slide.addText(s.title, {
      x: 0.6, y: 0.5, w: LAYOUT_W - 1.2, h: 0.6,
      fontSize: 28, bold: true, color: TEXT_PRIMARY, fontFace: "Arial",
    });

    if (s.bullets.length > 0) {
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true } })),
        {
          x: 0.6, y: 1.5, w: LAYOUT_W - 1.2, h: LAYOUT_H - 2.4,
          fontSize: 16, color: TEXT_SECONDARY, fontFace: "Arial",
          valign: "top", lineSpacingMultiple: 1.3,
          // The merged audit slide can legitimately carry many bullets (facts +
          // warnings + claims diff); shrink-to-fit keeps a dense slide legible
          // instead of silently overflowing the fixed text box.
          fit: "shrink",
        },
      );
    }

    slide.addText(`${s.n} / ${deck.slides.length}`, {
      x: LAYOUT_W - 1.3, y: LAYOUT_H - 0.5, w: 1, h: 0.35,
      fontSize: 10, color: TEXT_SECONDARY, align: "right",
    });

    // Annotated (diligence) copy only: speaker notes + a provenance footer.
    // The clean investor deck carries neither — a slide narrating its own
    // credibility is a slide that doesn't trust itself (owner directive);
    // sourcing lives in this variant and the data room instead.
    if (variant === "annotated") {
      slide.addText(`provenance: ${s.provenance ?? "measured"}`, {
        x: 0.6, y: LAYOUT_H - 0.5, w: 4, h: 0.35,
        fontSize: 9, italic: true, color: TEXT_SECONDARY,
      });
      if (s.speaker_notes) slide.addNotes(s.speaker_notes);
    }
  }

  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  return {
    buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    slides_with_art: slidesWithArt,
    slides_total: deck.slides.length,
    variant,
  };
}
