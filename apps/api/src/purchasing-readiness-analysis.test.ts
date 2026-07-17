// WO-10 · readiness-real-analysis — DB-free acceptance tests.
//
// Guards the anti-tautology rule: the "production-ready" verdict is reachable
// ONLY when ALL six critical purchasing controls are detected in the repo's own
// file CONTENT. AXIS-generated artifact filenames (which max out the separate
// artifact-coverage score) must never confer it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileEntry } from "@axis/snapshots";
import {
  analyzePurchasingReadiness,
  buildCodeReadinessBlock,
  READINESS_CAVEAT,
  MAX_EVIDENCE_PER_CATEGORY,
  getReadinessCategories,
  getCriticalReadinessCategories,
  type ReadinessCategory,
} from "./purchasing-readiness-analysis.js";
import { computePurchasingReadinessScore } from "./handlers.js";
import { runPreparePurchasingPreview } from "./mcp-tool-impls.js";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

function entry(path: string, content: string): FileEntry {
  return { path, content, size: Buffer.byteLength(content, "utf-8") };
}

// H-Phase-A cycle 5: ALL_CRITICAL and CATEGORY_MARKERS below used to be
// independently hand-typed lists — a `.test.ts` file is excluded from
// apps/api/tsconfig.json's tsc pass, so even CATEGORY_MARKERS' own
// Record<ReadinessCategory, string> typing (which LOOKS exhaustive) was never
// actually checked by CI; a category added to the real union could silently
// go unlisted here with zero build error. ALL_CRITICAL now derives from the
// real, tsc-checked source (getCriticalReadinessCategories, backed by
// purchasing-readiness-analysis.ts's own exhaustive CATEGORY_DEF_SET).
// CATEGORY_MARKERS still needs hand-authored fixture content per category
// (that data can't be derived), so a canary test below asserts its key set
// matches the real category list — same "runtime tripwire" mitigation cycle
// 4 used for mcp-inband-settlement.test.ts's BILLABLE_ARGS.
const ALL_CRITICAL: ReadinessCategory[] = getCriticalReadinessCategories();

// One isolated marker per category — each matches ONLY its own category's patterns.
const CATEGORY_MARKERS: Record<ReadinessCategory, string> = {
  psp_integration: "import Stripe from 'stripe';",
  webhook_verification: "const event = stripe.webhooks.constructEvent(body, sig, secret);",
  idempotency: "headers['Idempotency-Key'] = key;",
  refund_cancel: "await stripe.refunds.create({ payment_intent: id });",
  auth: "const claims = jwt.verify(token, secret);",
  budget_guard: "if (amountCents > spendingLimit) throw new Error('over budget');",
  payment_mandate: "const mandate = { scheme: 'ap2' };",
};

describe("CATEGORY_MARKERS — stays in sync with the real ReadinessCategory set", () => {
  it("has exactly one marker per category, no more, no less", () => {
    const markerKeys = Object.keys(CATEGORY_MARKERS).sort();
    const realCategories = getReadinessCategories().sort();
    expect(markerKeys).toEqual(realCategories);
  });
});

function markerFixture(exclude: ReadinessCategory[] = []): FileEntry[] {
  return (Object.entries(CATEGORY_MARKERS) as [ReadinessCategory, string][])
    .filter(([category]) => !exclude.includes(category))
    .map(([category, marker]) => entry(`src/${category}.ts`, `${marker}\n`));
}

// Realistic multi-file fixture implementing all 6 critical controls + a mandate.
const PRODUCTION_FIXTURE: FileEntry[] = [
  entry("package.json", '{"name":"shop","dependencies":{"stripe":"^14.0.0","jsonwebtoken":"^9.0.0"}}'),
  entry(
    "src/payments.ts",
    [
      "import Stripe from 'stripe';",
      "const stripe = new Stripe(process.env.STRIPE_KEY!);",
      "export async function charge(amountCents: number) {",
      "  return stripe.paymentIntents.create({ amount: amountCents, currency: 'usd' }, { idempotencyKey: crypto.randomUUID() });",
      "}",
      "export async function refund(id: string) {",
      "  return stripe.refunds.create({ payment_intent: id });",
      "}",
    ].join("\n"),
  ),
  entry(
    "src/webhooks.ts",
    [
      "export function handleWebhook(rawBody: string, sig: string) {",
      "  return stripe.webhooks.constructEvent(rawBody, sig, process.env.WHSEC!);",
      "}",
    ].join("\n"),
  ),
  entry(
    "src/auth.ts",
    [
      "import jwt from 'jsonwebtoken';",
      "export function requireAuth(token: string) { return jwt.verify(token, process.env.JWT_SECRET!); }",
    ].join("\n"),
  ),
  entry(
    "src/budget.ts",
    [
      "const spendingLimit = 500; // cents per run (budget_per_run guard)",
      "export function checkBudget(cents: number) {",
      "  if (cents > spendingLimit) throw new Error('budget exceeded');",
      "}",
    ].join("\n"),
  ),
  entry("src/mandate.ts", "export const paymentMandate = { scheme: 'ap2', intent_mandate: true };"),
];

// Exactly the AXIS-generated artifact filenames, but with doc-placeholder content
// that contains no real integration code.
const AXIS_ARTIFACT_PATHS = [
  "agent-purchasing-playbook.md",
  "product-schema.json",
  "checkout-flow.md",
  "negotiation-rules.md",
  "commerce-registry.json",
  "mcp-config.json",
];
const ARTIFACT_ONLY_FIXTURE: FileEntry[] = AXIS_ARTIFACT_PATHS.map(p =>
  entry(p, "# AXIS generated artifact\nDocumentation placeholder with no integration code.\n"),
);

// Full artifact-name set that maxes the COVERAGE score at 100 (mirrors
// prepare-purchasing.test.ts "caps at 100 for full artifact set").
const FULL_COVERAGE_PATHS = [
  "agent-purchasing-playbook.md",
  "mcp-config.json",
  "negotiation-rules.md",
  ".ai/debug-playbook.md",
  ".ai/optimization-rules.md",
  "AGENTS.md",
];

// ─── BARE REPO ───────────────────────────────────────────────────

describe("analyzePurchasingReadiness — bare repo", () => {
  it("scores 0 / not-ready / high risk with all 6 critical categories missing", () => {
    const r = analyzePurchasingReadiness([entry("README.md", "# hello")]);
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("not-ready");
    expect(r.risk_level).toBe("high");
    expect(r.missing_critical.slice().sort()).toEqual(ALL_CRITICAL.slice().sort());
    expect(r.missing_critical).toHaveLength(6);
    expect(r.caveat.length).toBeGreaterThan(0);
    expect(r.analyzed_file_count).toBe(1);
    expect(r.strengths).toEqual([]);
    expect(r.gaps).toHaveLength(7);
  });

  it("returns one signal per category in stable spec order", () => {
    const r = analyzePurchasingReadiness([entry("README.md", "# hello")]);
    expect(r.signals.map(s => s.category)).toEqual([
      "psp_integration",
      "webhook_verification",
      "idempotency",
      "refund_cancel",
      "auth",
      "budget_guard",
      "payment_mandate",
    ]);
  });

  it("is deterministic — same input, same output", () => {
    const files = [entry("README.md", "# hello")];
    expect(analyzePurchasingReadiness(files)).toEqual(analyzePurchasingReadiness(files));
  });
});

// ─── ANTI-TAUTOLOGY (load-bearing) ───────────────────────────────

describe("analyzePurchasingReadiness — anti-tautology", () => {
  it("AXIS artifact filenames with no integration code NEVER confer production-ready", () => {
    const r = analyzePurchasingReadiness(ARTIFACT_ONLY_FIXTURE);
    expect(r.verdict).not.toBe("production-ready");
    expect(r.score).toBeLessThan(95);
  });

  it("...even though those same paths earn artifact-coverage points", () => {
    // Contrast: the filename-based coverage scorer rewards these paths, the
    // content-based analyzer does not. Two independent measurements.
    const coverage = computePurchasingReadinessScore(AXIS_ARTIFACT_PATHS);
    expect(coverage.score).toBeGreaterThan(0);
    const r = analyzePurchasingReadiness(ARTIFACT_ONLY_FIXTURE);
    expect(r.verdict).toBe("not-ready");
  });
});

// ─── PRODUCTION FIXTURE ──────────────────────────────────────────

describe("analyzePurchasingReadiness — production fixture", () => {
  const r = analyzePurchasingReadiness(PRODUCTION_FIXTURE);

  it("reaches score 100 / production-ready / low risk with no missing criticals", () => {
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("production-ready");
    expect(r.missing_critical).toHaveLength(0);
    expect(r.risk_level).toBe("low");
    expect(r.gaps).toEqual([]);
    expect(r.strengths).toHaveLength(7);
  });

  it("rationale confirms all critical controls were found in source", () => {
    expect(r.verdict_rationale).toContain("All 6 critical purchasing controls");
  });

  it("MISSING-ONE-CRITICAL: dropping the webhook file demotes the verdict", () => {
    const withoutWebhooks = PRODUCTION_FIXTURE.filter(f => f.path !== "src/webhooks.ts");
    const r2 = analyzePurchasingReadiness(withoutWebhooks);
    expect(r2.verdict).not.toBe("production-ready");
    expect(r2.missing_critical).toContain("webhook_verification");
    expect(r2.verdict_rationale).toContain("Webhook signature verification");
  });
});

// ─── VERDICT GATE (parameterized over every critical category) ──

describe("analyzePurchasingReadiness — verdict gate", () => {
  for (const category of ALL_CRITICAL) {
    it(`production-ready is unreachable when ${category} is missing`, () => {
      const r = analyzePurchasingReadiness(markerFixture([category]));
      expect(r.verdict).not.toBe("production-ready");
      expect(r.missing_critical).toContain(category);
    });
  }

  it("all 7 markers present => production-ready at score 100", () => {
    const r = analyzePurchasingReadiness(markerFixture());
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("production-ready");
  });

  it("missing only the NON-critical mandate category still allows production-ready (score 95)", () => {
    const r = analyzePurchasingReadiness(markerFixture(["payment_mandate"]));
    expect(r.score).toBe(95);
    expect(r.verdict).toBe("production-ready");
    expect(r.missing_critical).toHaveLength(0);
  });

  it("verdict tiers: substantial (>=70, <=1 critical missing), partial (>=40), minimal (>=15)", () => {
    // 100 - webhook_verification(20) = 80, one critical missing -> substantial/low
    const substantial = analyzePurchasingReadiness(markerFixture(["webhook_verification"]));
    expect(substantial.verdict).toBe("substantial");
    expect(substantial.risk_level).toBe("low");
    // psp(20) + webhook(20) + idempotency(15) = 55, three criticals missing -> partial/medium
    const partial = analyzePurchasingReadiness(markerFixture(["refund_cancel", "auth", "budget_guard", "payment_mandate"]));
    expect(partial.score).toBe(55);
    expect(partial.verdict).toBe("partial");
    expect(partial.risk_level).toBe("medium");
    // idempotency(15) alone -> minimal/high
    const minimal = analyzePurchasingReadiness([entry("src/i.ts", CATEGORY_MARKERS.idempotency)]);
    expect(minimal.score).toBe(15);
    expect(minimal.verdict).toBe("minimal");
    expect(minimal.risk_level).toBe("high");
  });
});

// ─── EVIDENCE SHAPE ──────────────────────────────────────────────

describe("analyzePurchasingReadiness — evidence", () => {
  it("every found signal carries 1..3 evidence entries with path, 1-indexed line, <=160-char excerpt", () => {
    const r = analyzePurchasingReadiness(PRODUCTION_FIXTURE);
    for (const signal of r.signals) {
      if (!signal.found) continue;
      expect(signal.evidence.length).toBeGreaterThanOrEqual(1);
      expect(signal.evidence.length).toBeLessThanOrEqual(MAX_EVIDENCE_PER_CATEGORY);
      for (const ev of signal.evidence) {
        expect(ev.path.length).toBeGreaterThan(0);
        expect(ev.line).toBeGreaterThanOrEqual(1);
        expect(ev.excerpt.length).toBeGreaterThan(0);
        expect(ev.excerpt.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it("evidence points at the actual matching line", () => {
    const r = analyzePurchasingReadiness(PRODUCTION_FIXTURE);
    const webhook = r.signals.find(s => s.category === "webhook_verification")!;
    expect(webhook.evidence[0].path).toBe("src/webhooks.ts");
    expect(webhook.evidence[0].line).toBe(2);
    expect(webhook.evidence[0].excerpt).toContain("constructEvent");
  });

  it("caps evidence at 3 per category even when more files match", () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      entry(`src/f${i}.ts`, "const h = req.headers['Idempotency-Key'];"),
    );
    const r = analyzePurchasingReadiness(files);
    const idem = r.signals.find(s => s.category === "idempotency")!;
    expect(idem.found).toBe(true);
    expect(idem.evidence).toHaveLength(3);
  });

  it("truncates long matched lines to 160 chars", () => {
    const longLine = `const x = jwt.verify(token, secret); // ${"y".repeat(400)}`;
    const r = analyzePurchasingReadiness([entry("src/a.ts", longLine)]);
    const auth = r.signals.find(s => s.category === "auth")!;
    expect(auth.found).toBe(true);
    expect(auth.evidence[0].excerpt.length).toBe(160);
  });
});

// ─── SKIP RULES ──────────────────────────────────────────────────

describe("analyzePurchasingReadiness — skip rules", () => {
  it("skips files larger than 512KB", () => {
    const oversized: FileEntry = { path: "vendor/bundle.js", content: "import Stripe from 'stripe';", size: 600 * 1024 };
    const r = analyzePurchasingReadiness([oversized]);
    expect(r.analyzed_file_count).toBe(0);
    expect(r.signals.find(s => s.category === "psp_integration")!.found).toBe(false);
  });

  it("skips binary content containing a NUL byte", () => {
    const nul = String.fromCharCode(0);
    const binary = entry("bin/blob", `import Stripe from 'stripe';${nul}xxxx`);
    const r = analyzePurchasingReadiness([binary]);
    expect(r.analyzed_file_count).toBe(0);
    expect(r.score).toBe(0);
  });
});

// ─── SEAM (REST): code_readiness independent of coverage score ──

describe("code_readiness assembly (REST/MCP prepare seam, DB-free)", () => {
  it("bare INPUT repo => code_readiness.verdict === 'not-ready' EVEN THOUGH coverage score is 100", () => {
    // What the prepare handlers do: coverage from GENERATED artifact paths,
    // code_readiness from the INPUT snapshot.files. Independent by construction.
    const coverage = computePurchasingReadinessScore(FULL_COVERAGE_PATHS);
    expect(coverage.score).toBe(100);

    const block = buildCodeReadinessBlock([entry("README.md", "# hello")]);
    expect(block.verdict).toBe("not-ready");
    expect(block.score).toBe(0);
    expect(block.caveat).toBe(READINESS_CAVEAT);
    expect(block.independent_of_artifact_coverage.length).toBeGreaterThan(0);
  });

  it("ships the fixed honesty caveat verbatim in every block", () => {
    expect(READINESS_CAVEAT.length).toBeGreaterThan(0);
    expect(buildCodeReadinessBlock([]).caveat).toBe(READINESS_CAVEAT);
    expect(buildCodeReadinessBlock(PRODUCTION_FIXTURE).caveat).toBe(READINESS_CAVEAT);
  });
});

// ─── PREVIEW seam ────────────────────────────────────────────────

describe("prepare_agentic_purchasing_preview — code_readiness + labeled projection", () => {
  function preview(files: { path: string; content: string }[]): Record<string, any> {
    return JSON.parse(runPreparePurchasingPreview({ project_name: "wo10-preview", files }));
  }

  it("no longer hardcodes projected_score_after_axis=100 as an input-repo readiness claim", () => {
    const r = preview([{ path: "README.md", content: "# hello" }]);
    expect(r.projected_score_after_axis).toBeUndefined();
    // Any projected value is explicitly an artifact-coverage projection...
    expect(typeof r.projected_artifact_coverage_after_axis).toBe("number");
    expect(String(r.projected_meaning)).toContain("Artifact-coverage projection");
    expect(String(r.conversion.projected_score_after)).toContain("artifact coverage");
    expect(String(r.conversion.projected_score_after)).toContain("not code readiness");
  });

  it("surfaces code_readiness derived from the submitted file CONTENTS (bare repo)", () => {
    const r = preview([{ path: "README.md", content: "# hello" }]);
    expect(r.code_readiness.verdict).toBe("not-ready");
    expect(r.code_readiness.score).toBe(0);
    expect(r.code_readiness.caveat).toBe(READINESS_CAVEAT);
    expect(r.code_readiness.missing_critical).toHaveLength(6);
  });

  it("code_readiness responds to real integration content, not filenames", () => {
    const r = preview(PRODUCTION_FIXTURE.map(f => ({ path: f.path, content: f.content })));
    expect(r.code_readiness.verdict).toBe("production-ready");
    expect(r.code_readiness.score).toBe(100);
  });

  it("artifact-only filenames do not move code_readiness in the preview either", () => {
    const r = preview(ARTIFACT_ONLY_FIXTURE.map(f => ({ path: f.path, content: f.content })));
    expect(r.code_readiness.verdict).toBe("not-ready");
  });
});

// ─── HONESTY (source-level greps) ────────────────────────────────

describe("honesty — reworded over-claim strings", () => {
  it("handlers.ts no longer claims '5 real repos hardened 0/100 to 100/100'", () => {
    const src = readFileSync(join(SRC_DIR, "handlers.ts"), "utf-8");
    expect(src).not.toContain("5 real repos hardened");
    expect(src).not.toContain("hardened 0/100 to 100/100");
  });

  it("apps/web/index.html meta description no longer sells 'production-ready artifacts'", () => {
    const html = readFileSync(join(SRC_DIR, "..", "..", "web", "index.html"), "utf-8");
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toContain("production-ready");
  });

  it("mcp-tool-impls.ts no longer contains the hardcoded projected-100 line", () => {
    const src = readFileSync(join(SRC_DIR, "mcp-tool-impls.ts"), "utf-8");
    expect(src).not.toContain("projectedScoreAfter = 100");
  });

  it("the analyzer never emits 'production-ready' unconditionally: bare and artifact-only repos are gated out", () => {
    // Behavioral form of the grep: the ONLY path to the verdict is the
    // all-critical-present gate (parameterized suite above covers each category).
    expect(analyzePurchasingReadiness([]).verdict).toBe("not-ready");
    expect(analyzePurchasingReadiness(ARTIFACT_ONLY_FIXTURE).verdict).not.toBe("production-ready");
  });
});
