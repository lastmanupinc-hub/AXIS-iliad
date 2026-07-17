// ─── WO-10 · readiness-real-analysis — content-based purchasing readiness ───
//
// Answers a DIFFERENT question than computePurchasingReadinessScore (handlers.ts):
// that function measures AXIS artifact COVERAGE by filename and is honest about it;
// this module scans the repo's OWN SOURCE CONTENT for the integration patterns an
// autonomous purchasing agent actually needs (PSP SDK, webhook signature
// verification, idempotency keys, refund/cancel paths, request auth, spend/budget
// guards, AP2/mandate handling).
//
// THE ANTI-TAUTOLOGY RULE (the verdict gate): "production-ready" is reachable ONLY
// when ALL SIX critical control categories are detected in file CONTENT. AXIS's own
// generated artifacts — which the coverage score matches by filename — can never
// confer this verdict; only real integration code in the analyzed repo can.
//
// Related-but-distinct: @axis/generator-core's detectCommerceSignals feeds artifact
// GENERATION (which hardening files to emit). This module feeds the code_readiness
// RESPONSE block at the REST-prepare / MCP-prepare / MCP-preview seams and is kept
// a pure, dependency-free, deterministic function of FileEntry[] so it can be
// unit-tested without a DB and can never drift with generation concerns.
//
// LIMITS (shipped verbatim as READINESS_CAVEAT in every response): this is static
// presence detection — regex/substring over already-uploaded file content. It is
// NOT an AST analysis, correctness proof, security audit, penetration test, or
// PCI/SCA certification, and documentation that quotes integration patterns can
// satisfy a category without working code.

import type { FileEntry } from "@axis/snapshots"; // { path: string; content: string; size: number }

export type ReadinessCategory =
  | "psp_integration"      // critical, weight 20
  | "webhook_verification" // critical, weight 20
  | "idempotency"          // critical, weight 15
  | "refund_cancel"        // critical, weight 15
  | "auth"                 // critical, weight 15
  | "budget_guard"         // critical, weight 10  (essential for AUTONOMOUS spend)
  | "payment_mandate";     // non-critical, weight 5  (AP2/UCP/x402)

export interface ReadinessEvidence {
  path: string;
  line: number;    // 1-indexed line of first match in that file
  excerpt: string; // trimmed matched line, capped at 160 chars
}

export interface CategorySignal {
  category: ReadinessCategory;
  label: string;
  weight: number;   // contribution to the 0-100 score
  critical: boolean;
  found: boolean;
  evidence: ReadinessEvidence[]; // capped at MAX_EVIDENCE_PER_CATEGORY
}

export type ReadinessVerdict =
  | "production-ready" | "substantial" | "partial" | "minimal" | "not-ready";

export interface PurchasingReadinessAnalysis {
  score: number;                      // 0-100 = sum of found category weights
  verdict: ReadinessVerdict;
  verdict_rationale: string;          // names missing critical controls, or confirms all present
  risk_level: "low" | "medium" | "high";
  signals: CategorySignal[];          // one per category, stable order
  strengths: string[];                // labels of found categories
  gaps: string[];                     // labels of missing categories
  missing_critical: ReadinessCategory[];
  caveat: string;                     // fixed honesty string (never empty)
  analyzed_file_count: number;
}

/** Max evidence entries recorded per category. */
export const MAX_EVIDENCE_PER_CATEGORY = 3;

/** Files larger than this are skipped (binary blobs, vendored bundles). */
const MAX_ANALYZED_FILE_BYTES = 512 * 1024;

/** Max excerpt length in evidence entries. */
const MAX_EXCERPT_LENGTH = 160;

/**
 * Fixed honesty caveat — ships verbatim in EVERY code_readiness response.
 * Do not soften or drop: this is the residual-honesty guarantee of WO-10.
 */
export const READINESS_CAVEAT =
  "Static presence detection: this confirms required integration patterns exist in source, " +
  "NOT that they are correct, wired together, or secure. It is not a security audit, " +
  "penetration test, or PCI/SCA certification.";

interface CategoryDef {
  category: ReadinessCategory;
  label: string;
  weight: number;
  critical: boolean;
  // Curated minimum pattern sets (WO-10 spec). Applied to file.content — which
  // includes package.json text, so dependency keys like `"stripe":` match too.
  patterns: RegExp[];
}

// H-Phase-A cycle 5: an array literal here (or in purchasing-readiness-
// analysis.test.ts's own hand-typed CATEGORY_MARKERS/ALL_CRITICAL lists) is
// NOT exhaustiveness-checked against ReadinessCategory — a missing category
// would compile fine either way. CATEGORY_DEF_SET is the genuinely exhaustive
// Record<ReadinessCategory, ...> (a missing/extra key is a real tsc build
// error); CATEGORY_DEFS derives its array shape from it for the existing
// .map() call site below. The test file imports this set (via
// getReadinessCategories) instead of re-declaring its own category list.
const CATEGORY_DEF_SET: Record<ReadinessCategory, Omit<CategoryDef, "category">> = {
  psp_integration: {
    label: "PSP/Stripe SDK integration",
    weight: 20,
    critical: true,
    patterns: [
      /\bfrom\s+['"]stripe['"]/,
      /@stripe\//,
      /new\s+Stripe\(/,
      /"stripe"\s*:/,
      /braintree/i,
      /\badyen\b/i,
      /@paypal\//,
      /razorpay/i,
    ],
  },
  webhook_verification: {
    label: "Webhook signature verification",
    weight: 20,
    critical: true,
    patterns: [
      /webhooks?\.constructEvent/i,
      /constructEventAsync/i,
      /stripe-signature/i,
      /\bsvix\b/i,
      /verifyWebhook(Signature)?/i,
      /createHmac\([^)]*\).*(sign|signature)/i,
    ],
  },
  idempotency: {
    label: "Idempotency keys",
    weight: 15,
    critical: true,
    patterns: [
      /idempotency[_-]?key/i,
      /Idempotency-Key/,
    ],
  },
  refund_cancel: {
    label: "Refund/cancel paths",
    weight: 15,
    critical: true,
    patterns: [
      /\.refunds\.create/i,
      /createRefund/i,
      /refundPayment/i,
      /paymentIntents\.cancel/i,
      /cancelSubscription/i,
      /['"`]\/(refund|cancel)s?['"`]/,
    ],
  },
  auth: {
    label: "Request authentication",
    weight: 15,
    critical: true,
    patterns: [
      /jwt\.verify/i,
      /verifyToken/i,
      /requireAuth/i,
      /Bearer\s/,
      /headers\.authorization/i,
      /getAuthContext/,
    ],
  },
  budget_guard: {
    label: "Spend/budget guard",
    weight: 10,
    critical: true,
    patterns: [
      /spend(ing)?[_-]?(limit|cap)/i,
      /budget_per_run/i,
      /max(imum)?[_-]?amount/i,
      /perTransactionLimit/i,
      /dailyLimit/i,
      /\bbudget\b.{0,40}\b(limit|cap|guard|exceed)/i,
    ],
  },
  payment_mandate: {
    label: "AP2/payment-mandate handling",
    weight: 5,
    critical: false,
    patterns: [
      /\bap2\b/i,
      /payment[_-]?mandate/i,
      /intent[_-]?mandate/i,
      /cart[_-]?mandate/i,
      /\bx402\b/i,
      /\bucp\b/i,
    ],
  },
};

const CATEGORY_DEFS: CategoryDef[] = (Object.keys(CATEGORY_DEF_SET) as ReadinessCategory[]).map(
  (category) => ({ category, ...CATEGORY_DEF_SET[category] }),
);

/** The full ReadinessCategory list, derived from the exhaustive CATEGORY_DEF_SET —
 *  exported so tests can iterate the real set instead of hand-typing their own. */
export function getReadinessCategories(): ReadinessCategory[] {
  return Object.keys(CATEGORY_DEF_SET) as ReadinessCategory[];
}

/** The CRITICAL subset (the anti-tautology rule's "all six" — everything except
 *  the non-critical payment_mandate bonus category), derived the same way. */
export function getCriticalReadinessCategories(): ReadinessCategory[] {
  return getReadinessCategories().filter((c) => CATEGORY_DEF_SET[c].critical);
}

/** Earliest match of any pattern in `content`, or null. Pure; no /g state. */
function earliestMatch(patterns: RegExp[], content: string): { line: number; excerpt: string } | null {
  let bestIndex = -1;
  for (const pattern of patterns) {
    const m = pattern.exec(content);
    if (m && (bestIndex === -1 || m.index < bestIndex)) bestIndex = m.index;
  }
  if (bestIndex === -1) return null;
  const line = content.slice(0, bestIndex).split("\n").length;
  const lineStart = content.lastIndexOf("\n", bestIndex - 1) + 1;
  const lineEndRaw = content.indexOf("\n", bestIndex);
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw;
  const excerpt = content.slice(lineStart, lineEnd).trim().slice(0, MAX_EXCERPT_LENGTH);
  return { line, excerpt };
}

/**
 * Content-based purchasing-readiness analysis of a repo's source files.
 *
 * Verdict gate (the non-tautology rule):
 *   production-ready := missing_critical.length === 0  (all 6 critical categories
 *                       found in CONTENT; score >= 95 follows, criticals sum to 95)
 *   substantial      := score >= 70 && missing_critical.length <= 1
 *   partial          := score >= 40
 *   minimal          := score >= 15
 *   not-ready        := score < 15
 *   risk_level: production-ready|substantial -> low; partial -> medium; else high
 */
export function analyzePurchasingReadiness(files: FileEntry[]): PurchasingReadinessAnalysis {
  // Skip oversized files and binary content (NUL byte) — presence detection over
  // vendored bundles/binaries produces noise, not evidence.
  const scannable = files.filter(
    f => f.size <= MAX_ANALYZED_FILE_BYTES && !f.content.includes("\u0000"),
  );

  const signals: CategorySignal[] = CATEGORY_DEFS.map(def => {
    const evidence: ReadinessEvidence[] = [];
    for (const file of scannable) {
      if (evidence.length >= MAX_EVIDENCE_PER_CATEGORY) break;
      const hit = earliestMatch(def.patterns, file.content);
      if (hit === null) continue;
      evidence.push({ path: file.path, line: hit.line, excerpt: hit.excerpt });
    }
    return {
      category: def.category,
      label: def.label,
      weight: def.weight,
      critical: def.critical,
      found: evidence.length > 0,
      evidence,
    };
  });

  const score = signals.reduce((sum, s) => sum + (s.found ? s.weight : 0), 0);
  const strengths = signals.filter(s => s.found).map(s => s.label);
  const gaps = signals.filter(s => !s.found).map(s => s.label);
  const missing_critical = signals.filter(s => s.critical && !s.found).map(s => s.category);

  const verdict: ReadinessVerdict =
    missing_critical.length === 0 ? "production-ready"
    : score >= 70 && missing_critical.length <= 1 ? "substantial"
    : score >= 40 ? "partial"
    : score >= 15 ? "minimal"
    : "not-ready";

  const risk_level: "low" | "medium" | "high" =
    verdict === "production-ready" || verdict === "substantial" ? "low"
    : verdict === "partial" ? "medium"
    : "high";

  const missingLabels = signals
    .filter(s => missing_critical.includes(s.category))
    .map(s => s.label);
  const verdict_rationale =
    missing_critical.length === 0
      ? "All 6 critical purchasing controls were detected in this repo's own source content."
      : `Missing critical controls: ${missingLabels.join(", ")}. The "production-ready" verdict requires ALL critical controls present in the repo's own code.`;

  return {
    score,
    verdict,
    verdict_rationale,
    risk_level,
    signals,
    strengths,
    gaps,
    missing_critical,
    caveat: READINESS_CAVEAT,
    analyzed_file_count: scannable.length,
  };
}

/** Shape of the code_readiness response block shared by all three seams. */
export interface CodeReadinessBlock extends PurchasingReadinessAnalysis {
  measures: string;
  independent_of_artifact_coverage: string;
}

/**
 * The exact `code_readiness` block shipped by the REST prepare handler, the MCP
 * prepare tool, and the MCP preview tool. Single assembly point so the three
 * seams cannot drift; input MUST be the INPUT repo's files (snapshot.files /
 * submitted files), never generated artifact listings.
 */
export function buildCodeReadinessBlock(inputFiles: FileEntry[]): CodeReadinessBlock {
  const analysis = analyzePurchasingReadiness(inputFiles);
  return {
    ...analysis,
    measures: "Content scan of the submitted repo's OWN source files for real purchasing controls (with path+line+excerpt evidence per detected control).",
    independent_of_artifact_coverage:
      "Independent of the artifact-coverage score: coverage counts AXIS artifact files by name, while code_readiness only moves when real integration patterns exist in your source. Generated artifacts alone never change this verdict.",
  };
}
