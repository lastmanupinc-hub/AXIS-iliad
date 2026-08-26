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
// the honest-audit slide. Where evidence is missing, the slide SAYS SO —
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

/** Count test files the scan actually saw — evidence, not a docs claim.
 *
 * Conventions covered: suffix (`*.test.ts`, `*.spec.js`, `*_test.go`) AND
 * pytest's PREFIX convention (`test_*.py`). The prefix form was missing until
 * the Avatar Foundry dogfood (2026-08-26) caught the deck printing
 * "Test files found: 0" on a repo whose scanned tree contained 459
 * `test_*.py` files — a false, unflattering measurement from the program
 * whose whole contract is measured truth. Found by generating, not review. */
function countTestFiles(ctx: ContextMap): number {
  return (ctx.structure?.file_tree_summary ?? []).filter((f) =>
    /\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|(^|\/)test_[^/]+\.py$/i.test(String(f.path ?? "")),
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
//
// STRUCTURE (v2, 2026-08-26): the deck follows the evidence-based consensus
// skeleton derived from a primary-source research pass over the fundraising
// canon (YC partner guidance, VC-firm outlines, peer-reviewed pitching
// studies, and the DocSend read-telemetry series) — see the owner's research
// synthesis "The Deck Canon on Trial". The findings this structure encodes:
//   * Seven slots recur across every prescriptive primary source:
//     Problem → Solution → Traction → Business model → Market → Team → Ask.
//     A deck must PARSE as a deck to its only audience (median investor read
//     is ~3 minutes, front-loaded, falling yearly).
//   * The title slide opens with the investment thesis (attention peaks in
//     the first minute — spend it on what must be believed, never on team).
//   * No top-down TAM, ever — bottom-up logic or an honest placeholder.
//   * Preparedness beats polish in the peer-reviewed literature, and
//     polish-picked startups underperform post-funding — so the audit slide
//     stays, as the deck's signature, not an apology.
// A repo cannot testify to a business: team, market volume, pricing, and the
// ask are NOT derivable from code. Those slots render as unmistakable
// OWNER INPUT REQUIRED placeholders — labeled, never silently filled with
// invented numbers. The honesty rule is unchanged: measured, attested, or
// absent-and-said-so.

/** Where a slide's content comes from — the deck's provenance typography. */
type SlideProvenance = "measured" | "owner_input" | "mixed";

interface Slide {
  n: number;
  title: string;
  bullets: string[];
  speaker_notes: string;
  /** Key into slide-art-prompts.json. */
  art: string;
  provenance: SlideProvenance;
  /** For owner_input/mixed slides: the named fields the founder must supply. */
  owner_inputs?: string[];
}

/** Prefix every founder-supplied slot carries — unmistakable on a projector,
 * unmissable in review. A deck presented with one of these still visible is
 * unfinished by design, not embarrassing by accident. */
const OWNER_INPUT = "OWNER INPUT REQUIRED — ";

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
  const routeCount = displayRoutes(ctx.routes ?? []).length;

  const contradicted = claims.filter((c) => c.verdict === "contradicts");
  const unverifiable = claims.filter((c) => c.verdict === "unverifiable");

  // Capability facts belong on the Solution slide; verification facts (tests,
  // CI) belong on the audit slide — measuredFacts() keeps both for the JSON.
  const solutionFacts = facts.filter((f) => f.label !== "Test frameworks" && f.label !== "CI");
  const verificationFacts = facts.filter((f) => f.label === "Test frameworks" || f.label === "CI");

  // Monetization evidence: payment SDKs visible in the dependency graph.
  // Detection only — pricing is never invented from a package name.
  // PRECISION RULES (adversarial review, 2026-08-26): the first draft used a
  // bare substring regex with no dep-type check, which false-positived on
  // "squarify" (a treemap library), "paddlejs" (Baidu's ML framework), and any
  // devDependency payment mock — planting a false business assertion in the
  // slide's measured slot. Now: known SDK names match only as the whole
  // package name, a scoped prefix (@stripe/…), or a delimiter-separated
  // prefix (paypal-rest-sdk), and development-only dependencies never count.
  const PAYMENT_SDK_NAMES = ["stripe", "braintree", "paypal", "razorpay", "adyen", "mollie", "square", "squareup", "paddle", "lemonsqueezy"];
  const isPaymentSdkName = (raw: string): boolean => {
    const n = raw.toLowerCase();
    return PAYMENT_SDK_NAMES.some((p) => n === p || n.startsWith(`@${p}/`) || n.startsWith(`${p}-`) || n.startsWith(`${p}.`) || n.startsWith(`${p}/`));
  };
  const paymentDeps = ((ctx.dependency_graph?.external_dependencies ?? []) as Array<{ name?: string; type?: string }>)
    .filter((d) => d.type !== "development")
    .map((d) => String(d.name ?? ""))
    .filter(isPaymentSdkName)
    .slice(0, 5);

  const slides: Slide[] = [];

  slides.push({
    n: 1,
    title: id?.name ?? "Untitled project",
    bullets: [
      // The one-liner is the repo's own self-description — a CLAIM, not a
      // measurement, so it renders in the deck's quoted-claim typography
      // (adversarial review, 2026-08-26: unquoted, it was the one channel a
      // marketing number could enter a slide as if it were a bare fact; the
      // absence statement is the analyzer's own finding and stays unquoted).
      one.source.startsWith("absent") ? one.text : `"${one.text}"`,
      `Primary language: ${id?.primary_language ?? "unknown"}`,
      `${OWNER_INPUT}the investment thesis: the two or three things an investor must believe to want to own this. State them up front — the audit slide is what earns them.`,
    ],
    speaker_notes: `One-liner source: ${one.source}. Open with the thesis, not the team — investor attention peaks in the first minute. Nothing on this deck is aspirational copy — every number was measured from the repository at analysis time.`,
    art: "title",
    provenance: "mixed",
    owner_inputs: ["investment_thesis"],
  });

  slides.push({
    n: 2,
    title: "The problem",
    bullets: [
      `${OWNER_INPUT}the customer pain this exists to remove, stated concretely enough that an investor can retell it.`,
      `${OWNER_INPUT}how that customer copes today, and what the coping costs them.`,
    ],
    speaker_notes:
      "The one slot every prescriptive primary source agrees on. A repository cannot testify to a customer's pain — this is founder knowledge, and inventing it here would be the exact defect this program exists to refuse.",
    art: "problem",
    provenance: "owner_input",
    owner_inputs: ["problem_statement", "current_alternatives"],
  });

  slides.push({
    n: 3,
    title: "The solution — measured",
    bullets: solutionFacts.map((f) => `${f.label}: ${f.value}`),
    speaker_notes: `What demonstrably exists in the repository. Each figure cites its analyzer field: ${solutionFacts.map((f) => `${f.label}←${f.source}`).join("; ")}.`,
    art: "solution",
    provenance: "measured",
  });

  slides.push({
    n: 4,
    title: "Traction — attested, never invented",
    bullets: [
      ...(routeCount > 0
        ? [`A live service surface exists in code: ${routeCount} HTTP routes. Code proves capability, not adoption — the distinction stays on the slide.`]
        : []),
      `${OWNER_INPUT}usage, revenue, customers, pilots — attach real numbers with their source, or state pre-revenue plainly. The analyzer cannot measure adoption, and this deck does not fill that gap with copy.`,
    ],
    speaker_notes:
      "Read-telemetry across thousands of decks puts traction among the highest-scrutiny sections — and time spent on a weak traction slide is skepticism, not interest. An honest 'pre-revenue' outperforms an inflated metric that dies in diligence.",
    art: "traction",
    provenance: "mixed",
    owner_inputs: ["traction_metrics"],
  });

  slides.push({
    n: 5,
    title: "Business model",
    bullets: [
      paymentDeps.length > 0
        ? `Payment SDK present in production dependencies: ${paymentDeps.join(", ")} — a payments rail is wired in code.`
        : "No payment integration detected in the codebase — monetization is not yet wired.",
      `${OWNER_INPUT}pricing, unit economics, who pays and for what. Detection above is evidence a rail exists, never evidence of a price.`,
    ],
    speaker_notes:
      "Funded decks place the business model early and investors spend real read-time on it. The measured half is only whether a payment rail exists in the dependency graph; everything about price is founder input.",
    art: "model",
    provenance: "mixed",
    owner_inputs: ["pricing_model"],
  });

  slides.push({
    n: 6,
    title: "Market — bottom-up only",
    bullets: [
      "POLICY — no top-down TAM appears on this deck. A percent-of-a-market-report number is noise on a market-changing product, and sophisticated readers price it as such.",
      `${OWNER_INPUT}the bottom-up case: real price × reachable buyers × honest conversion, each factor named with its source. If a factor is unknown, say unknown — that is a diligence conversation, not a slide gap.`,
    ],
    speaker_notes:
      "The most-attacked slide in the fundraising canon: the most famous funded deck of its era missed its own TAM by well over an order of magnitude and got funded anyway. Bottom-up or nothing.",
    art: "market",
    provenance: "owner_input",
    owner_inputs: ["bottom_up_market"],
  });

  slides.push({
    n: 7,
    title: "Team",
    bullets: [
      `${OWNER_INPUT}who builds this, with the evidence they can — shipped work beats titles.`,
      `${OWNER_INPUT}what this raise changes about the team. If there is a gap, price it as the thing the round buys — a named gap is a plan, a hidden one is a diligence finding.`,
    ],
    speaker_notes:
      "Investors rank team above product, model, and market in the survey data — but a repository cannot testify to the people. Placement is contested across the primary sources; what is not contested is that the slide must exist and must be concrete.",
    art: "team",
    provenance: "owner_input",
    owner_inputs: ["team", "round_unblocks"],
  });

  const auditBullets: string[] = [
    `Test files found: ${testFiles}`,
    ...verificationFacts.map((f) => `${f.label}: ${f.value}`),
    `Architecture separation score: ${ctx.architecture_signals?.separation_score ?? "n/a"}`,
    ...(hotspots.length
      ? [`Highest-coupling files: ${hotspots.map((h) => h.path).join(", ")}`]
      : []),
    ...warnings.map((w) => `⚠ ${w}`),
  ];
  if (claims.length === 0) {
    auditBullets.push("No numeric claims found in README/docs to audit.");
  } else {
    auditBullets.push(`${claims.length} numeric claims found in docs; ${contradicted.length} contradict measurement, ${unverifiable.length} cannot be verified from code.`);
    auditBullets.push(`Audit rules: on a fully-scanned repo, measurements are exact and contradictions run both directions; on a capped scan they are floors, and a contradiction is declared only where docs UNDERSTATE what provably exists. Unit mismatches (test cases vs test files) are never accusations.`);
    for (const c of contradicted.slice(0, 6)) {
      auditBullets.push(`✗ ${c.file} claims "${c.quote}" — measured ${c.measured}.`);
    }
    for (const c of unverifiable.slice(0, 4)) {
      auditBullets.push(`? "${c.quote}" (${c.file}) — not verifiable from the codebase; treat as marketing until evidenced.`);
    }
  }
  slides.push({
    n: 8,
    title: "The honest audit — docs vs. code, gaps included",
    bullets: auditBullets,
    speaker_notes:
      "The deck's signature: engineering reality and the docs-vs-code diff, stated by the deck before diligence finds them. Deliberately unflattering where the evidence is — preparedness, not polish, is what predicts funding in the peer-reviewed literature, and this slide is the reason to trust the other slides.",
    art: "truth",
    provenance: "measured",
  });

  const gaps: string[] = [];
  if (testFiles === 0) gaps.push("No tests — a verification harness is the first credible milestone.");
  if (!ctx.detection?.ci_platform) gaps.push("No CI — nothing currently proves the build on every change.");
  if ((ctx.routes ?? []).length === 0 && (ctx.entry_points ?? []).length > 0) gaps.push("Runnable code without a service surface — distribution is the open question.");
  if (contradicted.length > 0) gaps.push(`${contradicted.length} doc claims contradict the code — fix the docs before anyone else runs this audit.`);
  slides.push({
    n: 9,
    title: "The ask",
    bullets: [
      ...(gaps.length ? gaps : ["Evidence shows a working baseline; the roadmap is a product decision, not an engineering rescue."]),
      `${OWNER_INPUT}amount, runway, and the milestones it buys — sized bottom-up from an operating plan, never a round-number default. Valuation terms belong in conversation, not on a slide.`,
    ],
    speaker_notes:
      "Milestones derive from measured gaps only. No invented TAM, no hockey stick — those belong to the owner, stated in their own voice, not fabricated by a generator.",
    art: "ask",
    provenance: "mixed",
    owner_inputs: ["raise_amount", "milestones"],
  });

  return { slides, claims };
}

// ─── Generators ─────────────────────────────────────────────────────────────

export function generatePitchDeck(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const { slides, claims } = buildSlides(ctx, files);
  const lines: string[] = [];
  lines.push(`# ${mdText(ctx.project_identity?.name ?? "Untitled")} — pitch deck`);
  lines.push("");
  lines.push("> **This is the annotated diligence copy** — speaker notes, per-slide provenance,");
  lines.push("> and the full claims-audit appendix. The clean investor deck (no notes, no");
  lines.push("> annotations) renders from the same data via `POST /v1/pitch/render` with");
  lines.push('> `"variant": "clean"` — two documents, one truth.');
  lines.push(">");
  lines.push("> Structure: the evidence-based consensus skeleton (Problem → Solution →");
  lines.push("> Traction → Model → Market → Team → Ask), thesis-first, bottom-up market only.");
  lines.push("> Every number on these slides was **measured from the repository**; slots a");
  lines.push("> repo cannot testify to (team, market volume, pricing, the ask) carry");
  lines.push("> unmistakable `OWNER INPUT REQUIRED` placeholders instead of invented copy.");
  lines.push("> Docs/marketing numbers appear only on the audit slide, labeled as claims and");
  lines.push("> diffed against measurement. Where evidence is absent, the slide says so.");
  lines.push("");
  for (const s of slides) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## Slide ${s.n} — ${mdText(s.title)}`);
    lines.push("");
    for (const b of s.bullets) lines.push(`- ${mdInline(b)}`);
    lines.push("");
    // The header promises "per-slide provenance" — so the md renders it
    // (adversarial review, 2026-08-26: the first draft promised it and only
    // the JSON carried it — an md/json divergence in a program whose whole
    // contract is that its documents never misstate themselves).
    lines.push(`**Provenance:** ${s.provenance}${s.owner_inputs?.length ? ` — owner inputs: ${s.owner_inputs.join(", ")}` : ""}`);
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
    description: "Truth-first pitch deck (annotated diligence copy): evidence-based consensus skeleton, every figure measured from the repo, owner-input slots labeled instead of invented; docs numbers audited on the audit slide, never repeated as facts.",
  };
}

export function generatePitchDeckJson(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const { slides, claims } = buildSlides(ctx, files);
  const payload = {
    project: ctx.project_identity?.name ?? null,
    structure: "evidence_first_v2",
    honesty_contract:
      "Slide figures are measured from the repository. Doc-sourced numbers appear only in claims_audit with a verdict. Slots a repo cannot testify to carry OWNER INPUT REQUIRED placeholders — never invented copy. Absent evidence is stated as absent.",
    // Everything the founder must supply before this deck is presentable,
    // aggregated so an agent (or a form) can fill the slots programmatically.
    owner_inputs: slides
      .filter((s) => (s.owner_inputs ?? []).length > 0)
      .map((s) => ({ slide: s.n, title: s.title, fields: s.owner_inputs })),
    // The two-document contract: this JSON is the single source; the renderer
    // produces both documents from it.
    render_contract: {
      endpoint: "POST /v1/pitch/render",
      variants: {
        clean: "investor-facing .pptx — no speaker notes, no provenance annotations; the deck's context must explain itself",
        annotated: "diligence copy — speaker notes attached and per-slide provenance footers rendered",
      },
    },
    slides,
    claims_audit: claims,
    facts: measuredFacts(ctx),
  };
  return {
    path: "pitch-deck.json",
    content: `${JSON.stringify(payload, null, 2)}\n`,
    content_type: "application/json",
    program: "pitch",
    description: "Machine-readable deck: evidence-skeleton slides with per-slide provenance, the owner-input manifest, per-fact analyzer sources, and the docs-vs-measurement claims audit.",
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

  // One global style clause so every slide background reads as one deck, plus the
  // hard negative constraints: backgrounds must carry NO text (slide text is
  // overlaid later) and must not fake product UI.
  const STYLE =
    "Professional pitch-deck background, 16:9, dark slate base with a single restrained accent color, " +
    "high contrast-safe for white text overlay, abstract, minimal, no gradients-kitsch.";
  const NEGATIVE =
    "No words, no letters, no numbers, no logos, no watermarks, no fake user interfaces, no screenshots, no people.";

  // One key per evidence-skeleton slide (v2). Keys must cover every Slide.art
  // buildSlides() emits — the renderer looks backgrounds up by this key.
  const prompts: Record<string, string> = {
    title: `${STYLE} Motif: a faint constellation resolving into one bright node — a codebase becoming a product. Subject hint: ${langs}. ${NEGATIVE}`,
    problem: `${STYLE} Motif: a knot of tangled lines with one taut thread pulled clear of the tangle — the pain isolated from the noise. ${NEGATIVE}`,
    solution: `${STYLE} Motif: a precise measurement grid, fine ruled lines with ${Math.max(routes, 1)} accent points arranged in rows — data measured, not imagined. ${NEGATIVE}`,
    traction: `${STYLE} Motif: a sparse trail of footprints crossing an open field, one honest path, no crowd painted in — adoption as it is, not as wished. ${NEGATIVE}`,
    model: `${STYLE} Motif: two gears of different sizes meshing at one clean contact point — value exchanged at a single honest interface. ${NEGATIVE}`,
    market: `${STYLE} Motif: concentric rings built outward from individually visible dots at the center — a market counted from the bottom up, never sketched from the top down. ${NEGATIVE}`,
    team: `${STYLE} Motif: a single load-bearing column with fresh scaffolding anchored beside it${models > 0 ? `, ${Math.min(models, 12)} junction plates at the joints` : ""} — what stands today and what the build adds next. ${NEGATIVE}`,
    truth: `${STYLE} Motif: two translucent layers being compared, one slightly offset from the other, with the mismatched edge highlighted — claims laid over evidence. ${NEGATIVE}`,
    ask: `${STYLE} Motif: an unfinished bridge span, gap clearly visible, scaffolding ready — the honest gap between present and next. ${NEGATIVE}`,
  };

  return {
    path: "slide-art-prompts.json",
    content: `${JSON.stringify(
      {
        project: id?.name ?? null,
        renderer: "xAI image generation via POST /v1/pitch/render with render_backgrounds:true (runtime, requires XAI_API_KEY server-side) or scripts/pitch-backgrounds.mjs",
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
