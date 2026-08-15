// ─── pitch — the truth-first deck (21st program) ────────────────────────────
//
// OWNER SPEC (2026-08-08, verbatim intent): pitch decks everywhere suck because
// the AIs that make them never use the repo directly, don't correlate it with
// what the site claims, and paste marketing copy onto stock art. This program
// argues ONLY from runtime evidence — the parsed repository — and treats the
// repo's own docs as CLAIMS TO AUDIT, never as facts to repeat.
//
// THE RULE, inherited from every honesty guard in this codebase: a number
// appears on a slide only if the analyzer measured it. Anything sourced from
// README/marketing prose is labeled a claim and diffed against measurement on
// the Truth Assessment slide. Where evidence is missing, the slide SAYS SO —
// "unverified" is a first-class value here, because an investor deck that
// hides the absence of tests is the defect, not the feature.
//
// Three artifacts:
//   pitch-deck.md          the deck, slide by slide, speaker notes citing evidence
//   pitch-deck.json        machine-readable slides + per-fact source fields
//   slide-art-prompts.json deterministic per-slide art prompts (consumed by the
//                          xAI background renderer at the API layer — image
//                          GENERATION is runtime enrichment, never part of the
//                          deterministic pipeline, same split as canvas/D2)
//
// Deterministic: no clock, no randomness, no network. Same analysis ⇒
// byte-identical output. ctx.generated_at is deliberately NOT embedded
// (the architecture-diagram lesson: timestamps break Watch diffing).

import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { mdText, mdInline } from "./md-sanitize.js";
import { displayRoutes } from "./route-utils.js";

// ─── Evidence collection ────────────────────────────────────────────────────

interface Fact {
  label: string;
  value: string;
  /** ContextMap field this was measured from — every fact is traceable. */
  source: string;
}

interface DocClaim {
  file: string;
  quote: string;
  number: number;
  noun: string;
  /** Measured counterpart when the noun maps to something the analyzer measures. */
  measured?: number;
  verdict: "matches" | "contradicts" | "unverifiable";
}

function measuredFacts(ctx: ContextMap): Fact[] {
  const facts: Fact[] = [];
  const langs = (ctx.detection?.languages ?? []).map((l) => l.name).filter(Boolean);
  const fws = (ctx.detection?.frameworks ?? []).map((f) => f.name).filter(Boolean);

  facts.push({ label: "Files", value: String(ctx.structure?.total_files ?? 0), source: "structure.total_files" });
  facts.push({ label: "Lines of code", value: String(ctx.structure?.total_loc ?? 0), source: "structure.total_loc" });
  if (langs.length) facts.push({ label: "Languages", value: langs.slice(0, 5).join(", "), source: "detection.languages" });
  if (fws.length) facts.push({ label: "Frameworks", value: fws.slice(0, 5).join(", "), source: "detection.frameworks" });

  // Deduped: the parser emits per-mention rows, so raw length can be several
  // times the real surface (612 mentions vs ~166 routes on this repo itself).
  const routes = displayRoutes(ctx.routes ?? []).length;
  if (routes > 0) facts.push({ label: "HTTP routes", value: String(routes), source: "routes (deduplicated path+method)" });
  const models = (ctx.domain_models ?? []).length;
  if (models > 0) facts.push({ label: "Domain models", value: String(models), source: "domain_models" });
  const sql = (ctx.sql_schema ?? []).length;
  if (sql > 0) facts.push({ label: "SQL tables", value: String(sql), source: "sql_schema" });

  const tests = ctx.detection?.test_frameworks ?? [];
  facts.push({
    label: "Test frameworks",
    value: tests.length ? tests.join(", ") : "none detected",
    source: "detection.test_frameworks",
  });
  facts.push({
    label: "CI",
    value: ctx.detection?.ci_platform ?? "none detected",
    source: "detection.ci_platform",
  });
  return facts;
}

/** Count test files the scan actually saw — evidence, not a docs claim. */
function countTestFiles(ctx: ContextMap): number {
  return (ctx.structure?.file_tree_summary ?? []).filter((f) =>
    /\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i.test(String(f.path ?? "")),
  ).length;
}

// ─── Claims audit — the anti-marketing pass ────────────────────────────────
//
// Scans README/docs prose for numeric claims and diffs each against the
// measured value where the noun maps to something the analyzer counts.
// This is the concrete form of "do not trust dev, marketing, and markdown
// docs": their numbers are inputs to VERIFICATION, never to slides.

// Number syntax is REAL thousands groups or a plain integer — never a trailing
// comma. The first version used (\d[\d,]*), which matched the "2," in
// "...2, Test cases..." and produced the nonsense claim "2, Test" on a real
// customer deck (PAI'D dogfood, 2026-08-15). Found by generating, not by review.
const CLAIM_RE = /(\d{1,3}(?:,\d{3})+|\d+)\s*\+?\s*(endpoints?|routes?|tests?|users?|customers?|models?|tables?|generators?|artifacts?|integrations?|downloads?|stars?)\b/gi;

function auditDocClaims(ctx: ContextMap, files?: SourceFile[]): DocClaim[] {
  if (!files?.length) return [];
  const docs = files.filter((f) => /(^|\/)readme\.md$|^docs\/.*\.md$/i.test(f.path)).slice(0, 12);
  const claims: DocClaim[] = [];

  const measuredFor = (noun: string): number | undefined => {
    if (/^(endpoint|route)/.test(noun)) return displayRoutes(ctx.routes ?? []).length;
    if (/^test/.test(noun)) return countTestFiles(ctx);
    if (/^model/.test(noun)) return (ctx.domain_models ?? []).length;
    if (/^table/.test(noun)) return (ctx.sql_schema ?? []).length;
    return undefined; // users, customers, downloads, stars… not measurable from code
  };

  for (const doc of docs) {
    for (const m of doc.content.matchAll(CLAIM_RE)) {
      const number = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(number) || number === 0) continue;
      // Numbered-heading guard: "Section 5 User Rights" is a heading, not a
      // claim of five users (the second real false positive from the PAI'D
      // dogfood). Narrow on purpose: a CAPITALIZED SINGULAR noun immediately
      // followed by another Capitalized word is heading-shaped; "5 Users",
      // "5 users", and "5 user accounts" all still count as claims.
      const rawNoun = m[2];
      const after = doc.content.slice((m.index ?? 0) + m[0].length);
      const headingShaped = /^[A-Z]/.test(rawNoun) && !rawNoun.endsWith("s") && /^\s+[A-Z]/.test(after);
      if (headingShaped) continue;
      const noun = m[2].toLowerCase();
      const measured = measuredFor(noun);
      let verdict: DocClaim["verdict"];
      // ACCUSATION DISCIPLINE — learned by running this audit on our own repo,
      // where the first version called TRUE claims lies three different ways:
      //   * "tests" claims count CASES; the analyzer counts test FILES — a unit
      //     mismatch, so bare "tests" is unverifiable, not contradicted.
      //   * the scan is bounded (file caps), so every measurement is a FLOOR:
      //     measured 0 proves nothing, and claim > measured may just be the cap.
      //     A contradiction is only safe in the claim < measured direction —
      //     the repo demonstrably HAS more than the docs say.
      // Scan completeness decides whether measurements are EXACT or FLOORS.
      // The CLI caps scans (MAX_FILES=500), so a repo at the cap yields floor
      // measurements — but a small repo was seen in full, and there the audit
      // may accuse in both directions (a 12-file repo claiming "500 endpoints"
      // is lying, and saying so is the point of this program).
      const scanComplete = (ctx.structure?.total_files ?? 0) < 450;
      if (measured === undefined) verdict = "unverifiable";
      else if (/^test/.test(noun) && !/file/i.test(m[0])) verdict = "unverifiable"; // cases vs files, always
      else if (scanComplete) {
        if (measured === 0 && number > 0) verdict = "contradicts"; // fully scanned: zero means zero
        else if (measured > 0 && Math.abs(number - measured) / measured <= 0.1) verdict = "matches";
        else verdict = "contradicts";
      } else {
        // Capped scan: floors only. Accuse solely when docs UNDERSTATE what
        // provably exists; anything above the floor is honestly unverifiable.
        if (measured === 0) verdict = "unverifiable";
        else if (Math.abs(number - measured) / measured <= 0.1) verdict = "matches";
        else if (number < measured) verdict = "contradicts";
        else verdict = "unverifiable";
      }
      claims.push({ file: doc.path, quote: m[0].trim(), number, noun, measured, verdict });
      if (claims.length >= 40) return claims; // bounded output
    }
  }
  return claims;
}

// ─── Slide construction ─────────────────────────────────────────────────────

interface Slide {
  n: number;
  title: string;
  bullets: string[];
  speaker_notes: string;
  /** Key into slide-art-prompts.json. */
  art: string;
}

function honestOneLiner(ctx: ContextMap): { text: string; source: string } {
  const d = ctx.project_identity?.description?.trim();
  if (d) return { text: d, source: "project_identity.description (repo's own manifest/README first line)" };
  const s = ctx.ai_context?.project_summary?.trim();
  if (s) return { text: s.split(/(?<=\.)\s/)[0], source: "ai_context.project_summary (measured analysis)" };
  return { text: "No self-description found in the repository.", source: "absent — stated as absent, not invented" };
}

function buildSlides(ctx: ContextMap, files?: SourceFile[]): { slides: Slide[]; claims: DocClaim[] } {
  const id = ctx.project_identity;
  const facts = measuredFacts(ctx);
  const claims = auditDocClaims(ctx, files);
  const warnings = ctx.ai_context?.warnings ?? [];
  const one = honestOneLiner(ctx);
  const testFiles = countTestFiles(ctx);
  const hotspots = (ctx.dependency_graph?.hotspots ?? []).slice(0, 5);

  const contradicted = claims.filter((c) => c.verdict === "contradicts");
  const unverifiable = claims.filter((c) => c.verdict === "unverifiable");

  const slides: Slide[] = [];

  slides.push({
    n: 1,
    title: id?.name ?? "Untitled project",
    bullets: [one.text, `Primary language: ${id?.primary_language ?? "unknown"}`],
    speaker_notes: `One-liner source: ${one.source}. Nothing on this deck is aspirational copy — every number was measured from the repository at analysis time.`,
    art: "title",
  });

  slides.push({
    n: 2,
    title: "What exists — measured",
    bullets: facts.map((f) => `${f.label}: ${f.value}`),
    speaker_notes: `Each figure cites its analyzer field: ${facts.map((f) => `${f.label}←${f.source}`).join("; ")}.`,
    art: "evidence",
  });

  slides.push({
    n: 3,
    title: "Engineering reality",
    bullets: [
      `Test files found: ${testFiles}`,
      `Architecture separation score: ${ctx.architecture_signals?.separation_score ?? "n/a"}`,
      ...(hotspots.length
        ? [`Highest-coupling files: ${hotspots.map((h) => h.path).join(", ")}`]
        : []),
      ...warnings.map((w) => `⚠ ${w}`),
    ],
    speaker_notes:
      "This slide is deliberately unflattering where the evidence is. An investor who finds the gap after the deck is worse than one who sees it on the deck.",
    art: "engineering",
  });

  const truthBullets: string[] = [];
  if (claims.length === 0) {
    truthBullets.push("No numeric claims found in README/docs to audit.");
  } else {
    truthBullets.push(`${claims.length} numeric claims found in docs; ${contradicted.length} contradict measurement, ${unverifiable.length} cannot be verified from code.`);
    truthBullets.push(`Audit rules: on a fully-scanned repo, measurements are exact and contradictions run both directions; on a capped scan they are floors, and a contradiction is declared only where docs UNDERSTATE what provably exists. Unit mismatches (test cases vs test files) are never accusations.`);
    for (const c of contradicted.slice(0, 6)) {
      truthBullets.push(`✗ ${c.file} claims "${c.quote}" — measured ${c.measured}.`);
    }
    for (const c of unverifiable.slice(0, 4)) {
      truthBullets.push(`? "${c.quote}" (${c.file}) — not verifiable from the codebase; treat as marketing until evidenced.`);
    }
  }
  slides.push({
    n: 4,
    title: "Truth assessment — docs vs. measurement",
    bullets: truthBullets,
    speaker_notes:
      "The deck's own docs-vs-code diff. Contradictions are stated with both numbers; unverifiable claims are named as such rather than repeated as facts. This slide is the reason to trust the other slides.",
    art: "truth",
  });

  const gaps: string[] = [];
  if (testFiles === 0) gaps.push("No tests — a verification harness is the first credible milestone.");
  if (!ctx.detection?.ci_platform) gaps.push("No CI — nothing currently proves the build on every change.");
  if ((ctx.routes ?? []).length === 0 && (ctx.entry_points ?? []).length > 0) gaps.push("Runnable code without a service surface — distribution is the open question.");
  if (contradicted.length > 0) gaps.push(`${contradicted.length} doc claims contradict the code — fix the docs before anyone else runs this audit.`);
  slides.push({
    n: 5,
    title: "The honest ask",
    bullets: gaps.length ? gaps : ["Evidence shows a working baseline; the roadmap is a product decision, not an engineering rescue."],
    speaker_notes:
      "Derived from measured gaps only. No invented TAM, no hockey stick — those belong to the owner, stated in their own voice, not fabricated by a generator.",
    art: "ask",
  });

  return { slides, claims };
}

// ─── Generators ─────────────────────────────────────────────────────────────

export function generatePitchDeck(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const { slides, claims } = buildSlides(ctx, files);
  const lines: string[] = [];
  lines.push(`# ${mdText(ctx.project_identity?.name ?? "Untitled")} — pitch deck`);
  lines.push("");
  lines.push("> Every number on these slides was **measured from the repository**.");
  lines.push("> Numbers found in docs/marketing prose appear only on the Truth Assessment");
  lines.push("> slide, labeled as claims and diffed against measurement. Where evidence is");
  lines.push("> absent, the slide says so — this deck does not fill gaps with copy.");
  lines.push("");
  for (const s of slides) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## Slide ${s.n} — ${mdText(s.title)}`);
    lines.push("");
    for (const b of s.bullets) lines.push(`- ${mdInline(b)}`);
    lines.push("");
    lines.push(`**Speaker notes:** ${mdText(s.speaker_notes)}`);
    lines.push("");
    lines.push(`*Background art: see \`slide-art-prompts.json\` → \`${s.art}\`.*`);
    lines.push("");
  }
  if (claims.length) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## Appendix — full claims audit (${claims.length})`);
    lines.push("");
    lines.push("| Doc | Claim | Measured | Verdict |");
    lines.push("|---|---|---|---|");
    for (const c of claims) {
      // Claims stay QUOTED even in the appendix — quoted-claim vs bare-fact is
      // the deck's typography for "asserted by docs" vs "measured by analyzer".
      lines.push(`| ${mdInline(c.file)} | "${mdInline(c.quote)}" | ${c.measured ?? "—"} | ${c.verdict} |`);
    }
    lines.push("");
  }
  return {
    path: "pitch-deck.md",
    content: `${lines.join("\n")}\n`,
    content_type: "text/markdown",
    program: "pitch",
    description: "Truth-first pitch deck: every figure measured from the repo; docs numbers audited on the Truth slide, never repeated as facts.",
  };
}

export function generatePitchDeckJson(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const { slides, claims } = buildSlides(ctx, files);
  const payload = {
    project: ctx.project_identity?.name ?? null,
    honesty_contract:
      "Slide figures are measured from the repository. Doc-sourced numbers appear only in claims_audit with a verdict. Absent evidence is stated as absent.",
    slides,
    claims_audit: claims,
    facts: measuredFacts(ctx),
  };
  return {
    path: "pitch-deck.json",
    content: `${JSON.stringify(payload, null, 2)}\n`,
    content_type: "application/json",
    program: "pitch",
    description: "Machine-readable deck: slides, per-fact analyzer sources, and the docs-vs-measurement claims audit.",
  };
}

// Art prompts are deterministic TEXT derived from repo facts. Rendering them
// into images happens at the API layer (xAI) — runtime enrichment, same
// architecture split as canvas-spec.json (deterministic) vs D2 render (binary).
export function generateSlideArtPrompts(ctx: ContextMap, _files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const langs = (ctx.detection?.languages ?? []).map((l) => l.name).slice(0, 3).join(", ") || "software";
  const routes = (ctx.routes ?? []).length;
  const models = (ctx.domain_models ?? []).length;

  // One global style clause so all five backgrounds read as one deck, plus the
  // hard negative constraints: backgrounds must carry NO text (slide text is
  // overlaid later) and must not fake product UI.
  const STYLE =
    "Professional pitch-deck background, 16:9, dark slate base with a single restrained accent color, " +
    "high contrast-safe for white text overlay, abstract, minimal, no gradients-kitsch.";
  const NEGATIVE =
    "No words, no letters, no numbers, no logos, no watermarks, no fake user interfaces, no screenshots, no people.";

  const prompts: Record<string, string> = {
    title: `${STYLE} Motif: a faint constellation resolving into one bright node — a codebase becoming a product. Subject hint: ${langs}. ${NEGATIVE}`,
    evidence: `${STYLE} Motif: a precise measurement grid, fine ruled lines with ${Math.max(routes, 1)} accent points arranged in rows — data measured, not imagined. ${NEGATIVE}`,
    engineering: `${STYLE} Motif: structural cross-section, load-bearing beams with visible joints${models > 0 ? `, ${Math.min(models, 12)} junction plates` : ""} — engineering shown honestly, including the unfinished edge. ${NEGATIVE}`,
    truth: `${STYLE} Motif: two translucent layers being compared, one slightly offset from the other, with the mismatched edge highlighted — claims laid over evidence. ${NEGATIVE}`,
    ask: `${STYLE} Motif: an unfinished bridge span, gap clearly visible, scaffolding ready — the honest gap between present and next. ${NEGATIVE}`,
  };

  return {
    path: "slide-art-prompts.json",
    content: `${JSON.stringify(
      {
        project: id?.name ?? null,
        renderer: "xAI image generation via POST /v1/pitch/backgrounds (runtime, requires XAI_API_KEY server-side) or scripts/pitch-backgrounds.mjs",
        style_contract: { base: STYLE, negative: NEGATIVE },
        prompts,
      },
      null,
      2,
    )}\n`,
    content_type: "application/json",
    program: "pitch",
    description: "Deterministic per-slide art prompts derived from repo facts — rendered to images at runtime by xAI; prompts carry no-text/no-logo/no-fake-UI constraints.",
  };
}
