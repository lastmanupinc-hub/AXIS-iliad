// ─── E5 Living Architecture: verified specificity pass ──────────
//
// analyze_repo's engineer-mode upgrade makes the output repo-SPECIFIC without
// surrendering the determinism guarantee. A local LLM proposes discrete claims,
// each carrying an `evidence` reference; a deterministic FactOracle verifies
// every claim against the facts already extracted by the analysis pipeline and
// DROPS any it can't ground. The verifier is the structured contract — a
// hallucinated symbol / route / dependency cannot survive into the artifact.
//
// This file holds the pure, dependency-free core (oracle + verifier + render).
// The LLM proposal step (reusing the local runCompletion) is injected, so the
// whole thing is testable without a model.

import type { ContextMap } from "@axis/context-engine";

export type ClaimType = "symbol" | "route" | "model" | "dependency" | "import";

/** What a claim asserts it is grounded on — checked against the FactOracle. */
export interface ClaimEvidence {
  file?: string;
  symbol?: string;
  line?: number;
  model?: string;
  field_count?: number;
  route?: { method: string; path: string };
  dep?: string;
  import?: { source: string; target: string };
}

export interface ArchClaim {
  type: ClaimType;
  evidence: ClaimEvidence;
  /** The repo-specific insight this claim asserts (the prose the LLM supplied). */
  insight: string;
}

export interface DroppedClaim {
  claim: ArchClaim;
  reason: string;
}

export interface VerifyResult {
  kept: ArchClaim[];
  dropped: DroppedClaim[];
}

/** Deterministic ground-truth index built once from the extracted facts. */
export interface FactOracle {
  files: Set<string>;
  /** file_path → set of symbol names declared there. */
  symbolsByFile: Map<string, Set<string>>;
  /** `${file}::${symbol}` → set of line numbers it's declared on. */
  symbolLines: Map<string, Set<number>>;
  /** `${METHOD} ${path}`. */
  routes: Set<string>;
  /** domain-model name → field_count. */
  models: Map<string, number>;
  /** external dependency names. */
  deps: Set<string>;
  /** `${source}->${target}` internal import edges. */
  imports: Set<string>;
}

export interface ExtractedSymbol {
  file_path: string;
  symbol_name: string;
  line_number: number;
}

/**
 * Build the oracle from the ContextMap (routes, models, deps, imports, files)
 * plus the line-accurate symbol index. Pure + deterministic.
 */
export function buildFactOracle(ctx: ContextMap, symbols: ExtractedSymbol[]): FactOracle {
  const files = new Set<string>();
  for (const f of ctx.structure.file_tree_summary) {
    if (f.type === "file") files.add(f.path);
  }

  const symbolsByFile = new Map<string, Set<string>>();
  const symbolLines = new Map<string, Set<number>>();
  for (const s of symbols) {
    files.add(s.file_path);
    let bucket = symbolsByFile.get(s.file_path);
    if (!bucket) {
      bucket = new Set();
      symbolsByFile.set(s.file_path, bucket);
    }
    bucket.add(s.symbol_name);

    const key = `${s.file_path}::${s.symbol_name}`;
    let lines = symbolLines.get(key);
    if (!lines) {
      lines = new Set();
      symbolLines.set(key, lines);
    }
    lines.add(s.line_number);
  }

  return {
    files,
    symbolsByFile,
    symbolLines,
    routes: new Set(ctx.routes.map((r) => `${r.method.toUpperCase()} ${r.path}`)),
    models: new Map(ctx.domain_models.map((m) => [m.name, m.field_count] as const)),
    deps: new Set(ctx.dependency_graph.external_dependencies.map((d) => d.name)),
    imports: new Set(ctx.dependency_graph.internal_imports.map((i) => `${i.source}->${i.target}`)),
  };
}

/**
 * Reason a claim should be DROPPED, or null if it verifies. Pure; the heart of
 * the contract — every branch resolves the claim's evidence against the oracle.
 */
export function claimDropReason(claim: ArchClaim, oracle: FactOracle): string | null {
  const e = claim.evidence;
  switch (claim.type) {
    case "symbol": {
      if (!e.file || !e.symbol) return "symbol claim missing file/symbol";
      const bucket = oracle.symbolsByFile.get(e.file);
      if (!bucket) return `no symbols indexed for file ${e.file}`;
      if (!bucket.has(e.symbol)) return `symbol ${e.symbol} not found in ${e.file}`;
      if (e.line !== undefined) {
        const lines = oracle.symbolLines.get(`${e.file}::${e.symbol}`);
        if (!lines || !lines.has(e.line)) return `symbol ${e.symbol} is not declared at line ${e.line} in ${e.file}`;
      }
      return null;
    }
    case "route": {
      if (!e.route || !e.route.method || !e.route.path) return "route claim missing method/path";
      if (!oracle.routes.has(`${e.route.method.toUpperCase()} ${e.route.path}`)) {
        return `route ${e.route.method} ${e.route.path} not found`;
      }
      return null;
    }
    case "model": {
      if (!e.model) return "model claim missing model name";
      const fc = oracle.models.get(e.model);
      if (fc === undefined) return `model ${e.model} not found`;
      if (e.field_count !== undefined && e.field_count !== fc) {
        return `model ${e.model} has ${fc} fields, claim said ${e.field_count}`;
      }
      return null;
    }
    case "dependency": {
      if (!e.dep) return "dependency claim missing dep name";
      if (!oracle.deps.has(e.dep)) return `dependency ${e.dep} not found`;
      return null;
    }
    case "import": {
      if (!e.import || !e.import.source || !e.import.target) return "import claim missing source/target";
      if (!oracle.imports.has(`${e.import.source}->${e.import.target}`)) {
        return `import ${e.import.source} -> ${e.import.target} not found`;
      }
      return null;
    }
    default:
      return `unknown claim type ${(claim as ArchClaim).type}`;
  }
}

/** Partition claims into verified (kept) and hallucinated (dropped). Pure. */
export function verifyClaims(claims: ArchClaim[], oracle: FactOracle): VerifyResult {
  const kept: ArchClaim[] = [];
  const dropped: DroppedClaim[] = [];
  for (const claim of claims) {
    const reason = claimDropReason(claim, oracle);
    if (reason === null) kept.push(claim);
    else dropped.push({ claim, reason });
  }
  return { kept, dropped };
}

// ─── Propose step (LLM) — compact digest, prompt, defensive parse ───

const CLAIM_TYPES: ReadonlySet<string> = new Set(["symbol", "route", "model", "dependency", "import"]);
const DIGEST_CAPS = { files: 50, symbols: 80, routes: 30, models: 30, deps: 30 };

const SYSTEM_PROMPT =
  "You are a senior software architect. You describe a repository using ONLY the facts provided. " +
  "You never invent symbols, files, routes, or dependencies. Output strictly a JSON array, nothing else.";

/** Compact, bounded fact digest fed to the model (keeps within a small local-model context). */
export function buildFactDigest(ctx: ContextMap, symbols: ExtractedSymbol[]): string {
  const p = ctx.project_identity;
  const parts: string[] = [`PROJECT: ${p.name} (${p.type}, ${p.primary_language})`];

  const files = ctx.structure.file_tree_summary.filter((f) => f.type === "file").map((f) => f.path).slice(0, DIGEST_CAPS.files);
  parts.push(`FILES (${files.length}):\n${files.join("\n")}`);

  const symByFile = new Map<string, string[]>();
  for (const s of symbols.slice(0, DIGEST_CAPS.symbols)) {
    const a = symByFile.get(s.file_path) ?? [];
    a.push(`${s.symbol_name}:${s.line_number}`);
    symByFile.set(s.file_path, a);
  }
  if (symByFile.size > 0) {
    parts.push(`SYMBOLS:\n${[...symByFile.entries()].map(([f, names]) => `${f}: ${names.join(", ")}`).join("\n")}`);
  }
  if (ctx.routes.length > 0) {
    parts.push(`ROUTES:\n${ctx.routes.slice(0, DIGEST_CAPS.routes).map((r) => `${r.method} ${r.path} (${r.source_file})`).join("\n")}`);
  }
  if (ctx.domain_models.length > 0) {
    parts.push(`MODELS:\n${ctx.domain_models.slice(0, DIGEST_CAPS.models).map((m) => `${m.name} (${m.field_count} fields, ${m.source_file})`).join("\n")}`);
  }
  const deps = ctx.dependency_graph.external_dependencies.slice(0, DIGEST_CAPS.deps).map((d) => d.name);
  if (deps.length > 0) parts.push(`DEPENDENCIES: ${deps.join(", ")}`);

  return parts.join("\n\n");
}

function buildClaimPrompt(digest: string): string {
  return [
    "Given these extracted facts about a repository, produce up to 12 specific architectural claims.",
    "Each claim MUST be grounded in a fact below and reference it precisely. Do not invent anything.",
    "",
    "Return ONLY a JSON array. Each element:",
    `{"type":"symbol|route|model|dependency|import","evidence":{...},"insight":"one specific sentence"}`,
    "evidence by type:",
    `- symbol:     {"file":"<path>","symbol":"<name>","line":<n optional>}`,
    `- route:      {"route":{"method":"<METHOD>","path":"<path>"}}`,
    `- model:      {"model":"<name>","field_count":<n optional>}`,
    `- dependency: {"dep":"<name>"}`,
    `- import:     {"import":{"source":"<file>","target":"<file>"}}`,
    "",
    "FACTS:",
    digest,
    "",
    "JSON array:",
  ].join("\n");
}

/**
 * Parse claims from free-form model text. Defensive: tries a direct JSON parse,
 * then the first `[`..last `]` slice; validates each element's type/insight and
 * skips anything malformed. Never throws — bad output yields fewer/zero claims,
 * and the verifier drops anything ungrounded regardless.
 */
export function parseClaims(text: string, max: number): ArchClaim[] {
  const arr = extractJsonArray(text);
  if (!Array.isArray(arr)) return [];
  const out: ArchClaim[] = [];
  for (const raw of arr) {
    if (out.length >= max) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== "string" || !CLAIM_TYPES.has(r.type)) continue;
    if (typeof r.insight !== "string" || r.insight.trim().length === 0) continue;
    const evidence = r.evidence && typeof r.evidence === "object" && !Array.isArray(r.evidence) ? (r.evidence as ClaimEvidence) : {};
    // Collapse all whitespace (incl. newlines) so a crafted insight can't inject a
    // standalone "## Verification"/"- " line that confuses the drift parser or the PR body.
    out.push({ type: r.type as ClaimType, evidence, insight: r.insight.replace(/\s+/g, " ").trim().slice(0, 500) });
  }
  return out;
}

function extractJsonArray(text: string): unknown {
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) return direct;
  } catch {
    /* fall through to slice */
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ─── Render ─────────────────────────────────────────────────────

const TYPE_HEADINGS: Record<ClaimType, string> = {
  symbol: "Key symbols",
  route: "Routes",
  model: "Domain models",
  dependency: "Dependencies",
  import: "Module relationships",
};

// Stable fact-identity label. Drift detection keys on THIS (deterministic from
// the facts), not the LLM prose (which rewords the same fact across model
// builds). No parens — the drift parser extracts the `_(…)_` span — and no line
// numbers, so a symbol moving lines isn't mistaken for architecture drift.
function evidenceLabel(c: ArchClaim): string {
  const e = c.evidence;
  switch (c.type) {
    case "symbol":
      return `symbol ${e.symbol} in ${e.file}`;
    case "route":
      return `route ${e.route?.method?.toUpperCase()} ${e.route?.path}`;
    case "model":
      return `model ${e.model}`;
    case "dependency":
      return `dependency ${e.dep}`;
    case "import":
      return `import ${e.import?.source} → ${e.import?.target}`;
    default:
      return c.type;
  }
}

/** Render the verified claims + a verification footer. Deterministic given inputs. */
export function renderLivingArchitecture(projectName: string, kept: ArchClaim[], dropped: DroppedClaim[], proposed: number): string {
  const lines: string[] = [
    `# Living Architecture — ${projectName}`,
    "",
    "> Engineer-mode analysis. Every claim below is grounded in a real repository fact",
    "> (shown in parentheses); claims that couldn't be grounded were dropped (see Verification).",
    "",
  ];

  if (kept.length === 0) {
    lines.push("_No claims survived verification for this repository._", "");
  } else {
    for (const type of ["symbol", "route", "model", "dependency", "import"] as ClaimType[]) {
      const group = kept.filter((c) => c.type === type);
      if (group.length === 0) continue;
      lines.push(`## ${TYPE_HEADINGS[type]}`);
      for (const c of group) lines.push(`- ${c.insight.trim()} _(${evidenceLabel(c)})_`);
      lines.push("");
    }
  }

  lines.push(
    "## Verification",
    `- Claims proposed: ${proposed}`,
    `- Verified (kept): ${kept.length}`,
    `- Dropped (unverifiable): ${dropped.length}`,
  );
  if (dropped.length > 0) {
    lines.push("", "### Dropped claims");
    for (const d of dropped) lines.push(`- "${d.claim.insight.trim()}" — ${d.reason}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ─── Orchestrator ───────────────────────────────────────────────

/** Loosely-typed view of runCompletion's result (CompletionResult | NotConfiguredResult). */
export interface CompletionLike {
  text?: string;
  _not_configured?: boolean;
}

/**
 * Why the specificity pass degraded to the no-op doc — distinguishes a genuine
 * operator-configuration gap from a transient completion failure or an unexpected
 * response shape, so the paid artifact's description doesn't call every one of
 * these "no local model configured" (H-Phase-A cycle 16).
 */
export type DegradedReason = "not_configured" | "completion_threw" | "malformed_response";

export type CompletionFn = (opts: {
  prompt: string;
  system?: string;
  temperature?: number;
  seed?: number;
  max_tokens?: number;
}) => Promise<CompletionLike>;

export interface SpecificityArtifact {
  path: string;
  content: string;
  report: { configured: boolean; proposed: number; kept: number; dropped: number; degraded_reason?: DegradedReason };
}

/**
 * The engineer-mode pass: propose (LLM) → verify (oracle) → render. Always
 * returns a `living-architecture.md` artifact; when no model is configured it
 * returns a labeled degraded doc (configured:false) so the deterministic core is
 * never affected. `completion` is injected (pass runCompletion in production, a
 * fake in tests).
 */
export async function runSpecificityPass(
  ctx: ContextMap,
  symbols: ExtractedSymbol[],
  completion: CompletionFn,
  opts?: { seed?: number; maxClaims?: number },
): Promise<SpecificityArtifact> {
  const name = ctx.project_identity.name;
  let res: CompletionLike;
  let completionThrew = false;
  try {
    res = await completion({
      prompt: buildClaimPrompt(buildFactDigest(ctx, symbols)),
      system: SYSTEM_PROMPT,
      temperature: 0,
      seed: opts?.seed,
      max_tokens: 1536,
    });
  } catch {
    res = {};
    completionThrew = true;
  }

  if (!res || res._not_configured === true || typeof res.text !== "string") {
    const degraded_reason: DegradedReason = completionThrew
      ? "completion_threw"
      : res?._not_configured === true
        ? "not_configured"
        : "malformed_response";
    return {
      path: "living-architecture.md",
      content: notConfiguredDoc(name, degraded_reason),
      report: { configured: false, proposed: 0, kept: 0, dropped: 0, degraded_reason },
    };
  }

  const oracle = buildFactOracle(ctx, symbols);
  const proposed = parseClaims(res.text, opts?.maxClaims ?? 40);
  const { kept, dropped } = verifyClaims(proposed, oracle);
  return {
    path: "living-architecture.md",
    content: renderLivingArchitecture(name, kept, dropped, proposed.length),
    report: { configured: true, proposed: proposed.length, kept: kept.length, dropped: dropped.length },
  };
}

/** Why runSpecificityPass fell back to the degraded doc — see DegradedReason. */
function degradedNotice(reason: DegradedReason): string {
  if (reason === "completion_threw") {
    return (
      "> Engineer-mode specificity pass failed: the local completion call raised an unexpected\n" +
      "> error (not a configuration issue — this may be transient). The deterministic analysis\n" +
      "> artifacts are unaffected."
    );
  }
  if (reason === "malformed_response") {
    return (
      "> Engineer-mode specificity pass failed: the local completion call returned an unexpected\n" +
      "> response shape (not a configuration issue — this may be a bug). The deterministic\n" +
      "> analysis artifacts are unaffected."
    );
  }
  return (
    "> Engineer-mode specificity pass is available, but no local model is configured on\n" +
    "> this AXIS instance (set AXIS_LLM_MODEL_PATH to a GGUF model). The deterministic\n" +
    "> analysis artifacts are unaffected."
  );
}

function notConfiguredDoc(name: string, reason: DegradedReason): string {
  return [
    `# Living Architecture — ${name}`,
    "",
    degradedNotice(reason),
    "",
    // A Verification block so the drift parser reads a clean empty insight set
    // (not "the whole architecture vanished") if a degraded doc is ever committed.
    "## Verification",
    "- Claims proposed: 0",
    "- Verified (kept): 0",
    "- Dropped (unverifiable): 0",
    "",
  ].join("\n");
}
