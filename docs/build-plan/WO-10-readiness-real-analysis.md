# WO-10 · readiness-real-analysis

**Claim it makes true:** axis-toolbox-examples README: "0/100 -> 100/100 · Production-ready · fully agent-ready for autonomous purchasing".

**Tier:** A_pure_software · **Effort:** L · **Package:** apps/api (@axis/api)

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** Nothing blocks compilation or the tests -- the pure analyzer, verdict gate, patterns, interfaces, and DB-free acceptance tests are fully specified, FileEntry is exported, and snapshot.files is in scope at all three seams. What is missing is a design decision the spec never resolves: whether to reuse/reconcile with the existing content-based detector detectCommerceSignals + buildVerificationProof + ap2ReadyScore in packages/generator-core (already imported into the same MCP prepare handler) or build a parallel one. Building parallel produces a third readiness number that can drift from the two that already exist. Also unspecified: the exact reworded marketing copy for handlers.ts:2221 and index.html:10, and whether the new code_readiness should reconcile with the engineer-mode ap2ReadyScore already computed on the same snapshot.files.
**Spec overclaims flagged:** 'No payment-integration detection exists anywhere in packages/repo-parser' is scoped-true but the target_state presents analyzePurchasingReadiness as net-new while generator-core already ships detectCommerceSignals (PSP/checkout/SCA/dispute/webhook/tokenization/mandate detection over file content), buildVerificationProof (graded PASS/FAIL checklist with evidence + honesty caveat), and ap2ReadyScore -- ~70% of the proposed analyzer already exists and is reusable, and is called in the very handler being edited (mcp-tool-impls.ts:2890).; The anti-tautology guarantee ('Proves generated artifacts alone never confer readiness') is only demonstrated for the empty-content fixture. AXIS's real generated markdown artifacts are commerce-hardening prose containing the literal target strings (ap2, ucp, budget_per_run, stripe-signature, idempotency-key, stripe.refunds.create), so a repo adopting real AXIS output could match several categories from documentation, not code -- presence-detection over content can be fooled by docs that quote the patterns.; The spec closes the over-claim by reframing/retiring the '0/100 -> 100/100 production-ready' string, not by making the literal claim true; it admits this in doc_impact, so 'fully closes' is really 'stops being dishonest', not 'delivers the impressive claim'.
**Hidden external gates:** No PSP/Stripe account, network membership, or credential is needed -- static content detection is correctly Tier A on that axis.; The marketing string at handlers.ts:2221 references an EXTERNAL repo (github.com/lastmanupinc-hub/axis-iliad-examples, '5 real repos hardened 0/100 to 100/100'); keeping that claim honest after rewording depends on those 5 external example repos actually containing the critical controls, which running AXIS does not provide -- this external-repo consistency is out of scope and unaddressed.

## Current state
The "readiness" score is a tautology that never reads repo CONTENT. `computePurchasingReadinessScore(paths: string[])` (apps/api/src/handlers.ts:1721-1753) matches AXIS's own generated-artifact filenames (`p.includes("negotiation-rules")` etc.). In the REST prepare handler (handlers.ts:2025-2026) and MCP prepare (apps/api/src/mcp-tool-impls.ts:2799-2800) it is fed `generated.files.map(f => f.path)`, and generators-agentic-purchasing.ts unconditionally emits every category, so all 7 weighted buckets always match -> score=100 (guarded by prepare-purchasing.test.ts:183-194). In the MCP preview (mcp-tool-impls.ts:1185-1190) it is fed the INPUT repo's file PATHS, which never match artifact-name patterns -> ~0/100, and `projectedScoreAfter = 100` is hardcoded (mcp-tool-impls.ts:1238). That is the literal "0/100 -> 100/100" pipeline. `interpretReadiness` (handlers.ts:1796-1801) is already honest (only strong/partial/minimal-coverage; guarded by interpret-readiness.test.ts:18-23) and documents (1788-1794) that it measures AXIS artifact COVERAGE, not readiness. The over-claim lives in marketing strings: handlers.ts:2221 ("5 real repos hardened 0/100 to 100/100") and apps/web/index.html:10. Repo content IS available but unused for scoring: `snapshot.files: FileEntry[]` = `{path, content, size}` (packages/snapshots/src/types.ts:23-27) is passed to `generateFiles({source_files})` at both seams (handlers.ts:1992, mcp-tool-impls.ts:2606). No payment-integration detection exists anywhere in packages/repo-parser.

## Target state (== the claim is literally true)
A real content analyzer, `analyzePurchasingReadiness(files: FileEntry[])`, scans actual repo source for genuine autonomous-purchasing controls (PSP/Stripe SDK integration, webhook signature verification via constructEvent/HMAC, idempotency keys, refund/cancel paths, spend/budget guards, request auth, AP2/payment-mandate handling) and returns a defensible `verdict` reaching `"production-ready"` ONLY when ALL critical controls are actually present in code, with per-signal `evidence` (path+line+excerpt). Wired into all three seams (REST prepare, MCP prepare, MCP preview) as a NEW `code_readiness` block alongside the existing honest coverage `score`; the hardcoded `projectedScoreAfter = 100` is replaced with the real analyzed value. A fixture proves non-tautology: a repo containing only AXIS-generated artifact filenames (coverage score 100) yields `code_readiness.verdict !== "production-ready"`, while a fixture repo genuinely implementing all critical controls yields `"production-ready"` / score 100. The marketing over-claim strings are reworded to distinguish artifact coverage from code readiness. A fixed honesty caveat ships in every response: static presence-detection, not a correctness/security/PCI audit. RATIONALE FOR TIER A: the analyzer reads FileEntry.content already fetched, uploaded and passed to both seams today; no PSP account, network, or external credential is needed to detect integration patterns statically; regex/substring over strings needs no new dependency. Do NOT pull in an AST/parser lib (repo-parser has no payment detection; adding one is out of scope).

## Files to create / edit
- apps/api/src/purchasing-readiness-analysis.ts (new)
- apps/api/src/purchasing-readiness-analysis.test.ts (new)
- apps/api/src/handlers.ts (edit: import + add code_readiness block in handlePrepareForAgenticPurchasing near line 2026; reword over-claim string at line 2221)
- apps/api/src/mcp-tool-impls.ts (edit: import + add code_readiness in prepare near 2800; replace hardcoded projectedScoreAfter=100 at 1238 with analyzed value + add code_readiness in preview near 1190-1244)
- apps/web/index.html (edit: reword meta description at line 10)

## Interfaces
```ts
// apps/api/src/purchasing-readiness-analysis.ts
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
  evidence: ReadinessEvidence[]; // capped at MAX_EVIDENCE_PER_CATEGORY = 3
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

export const READINESS_CAVEAT: string;   // exported constant, reused by callers
export function analyzePurchasingReadiness(files: FileEntry[]): PurchasingReadinessAnalysis;

// Verdict gate (the non-tautology rule):
//   production-ready := missing_critical.length === 0   (all 6 critical categories found; score >= 95)
//   substantial      := score >= 70 && missing_critical.length <= 1
//   partial          := score >= 40
//   minimal          := score >= 15
//   not-ready        := score < 15
//   risk_level: production-ready|substantial -> "low"; partial -> "medium"; minimal|not-ready -> "high"
// Detection = per-category array of case-insensitive RegExp over file.content (skip files > 512KB or with NUL byte;
//   also match package.json dependency keys). A category is `found` iff any pattern matches any file.
// Curated minimum pattern sets:
//   psp_integration:      /\bfrom\s+['"]stripe['"]/, /@stripe\//, /new\s+Stripe\(/, /"stripe"\s*:/, /braintree/i, /\badyen\b/i, /@paypal\//, /razorpay/i
//   webhook_verification: /webhooks?\.constructEvent/i, /constructEventAsync/i, /stripe-signature/i, /\bsvix\b/i, /verifyWebhook(Signature)?/i, /createHmac\([^)]*\).*(sign|signature)/i
//   idempotency:          /idempotency[_-]?key/i, /Idempotency-Key/
//   refund_cancel:        /\.refunds\.create/i, /createRefund/i, /refundPayment/i, /paymentIntents\.cancel/i, /cancelSubscription/i, /['"`]\/(refund|cancel)s?['"`]/
//   auth:                 /jwt\.verify/i, /verifyToken/i, /requireAuth/i, /Bearer\s/, /headers\.authorization/i, /getAuthContext/
//   budget_guard:         /spend(ing)?[_-]?(limit|cap)/i, /budget_per_run/i, /max(imum)?[_-]?amount/i, /perTransactionLimit/i, /dailyLimit/i, /\bbudget\b.{0,40}\b(limit|cap|guard|exceed)/i
//   payment_mandate:      /\bap2\b/i, /payment[_-]?mandate/i, /intent[_-]?mandate/i, /cart[_-]?mandate/i, /\bx402\b/i, /\bucp\b/i
```

## Acceptance tests (DONE == claim true)
- `pnpm --filter @axis/api test purchasing-readiness-analysis` passes.
- BARE REPO: analyzePurchasingReadiness([{path:'README.md',content:'# hello',size:7}]) => score===0, verdict==='not-ready', missing_critical has all 6 critical categories, risk_level==='high', caveat.length>0.
- ANTI-TAUTOLOGY (load-bearing): a file list whose paths are exactly the AXIS-generated artifacts (agent-purchasing-playbook.md, product-schema.json, checkout-flow.md, negotiation-rules.md, commerce-registry.json, mcp-config.json) but whose CONTENT contains no real integration code => verdict !== 'production-ready' AND score < 95. Proves generated artifacts alone never confer readiness.
- PRODUCTION FIXTURE: a fixture FileEntry[] genuinely implementing all 6 critical controls (a src file with `import Stripe from 'stripe'`, `stripe.webhooks.constructEvent(`, `idempotencyKey:`, `stripe.refunds.create(`, a `spendingLimit`/`budget_per_run` guard, `jwt.verify(` auth) plus a mandate reference => score===100, verdict==='production-ready', missing_critical.length===0, risk_level==='low'.
- MISSING-ONE-CRITICAL: take the production fixture and delete the webhook-verification file => verdict !== 'production-ready', missing_critical includes 'webhook_verification'.
- EVIDENCE SHAPE: for every signal with found===true, evidence.length>=1 and every entry has non-empty path, line>=1, non-empty excerpt with length<=160; evidence.length<=3 per category.
- SEAM (REST): a DB-free unit test of the code_readiness assembly shows that when INPUT snapshot.files is a bare repo, response.code_readiness.verdict==='not-ready' EVEN THOUGH the coverage `score` (computePurchasingReadinessScore on generated paths) is 100 -- coverage and code_readiness are independent fields.
- PREVIEW: mcp-tool-impls preview no longer presents a hardcoded projected 100 as an input-repo readiness claim -- assert the preview response surfaces code_readiness.verdict/score derived from analyzePurchasingReadiness(fileContents), and any 'projected' value is labeled as artifact-coverage projection, not code readiness.
- HONESTY: grep asserts the new module and the reworded handlers.ts:2221 / index.html:10 strings do NOT assert every/any repo is unconditionally 'production-ready'; the 'production-ready' verdict is reachable ONLY through the all-critical-present gate. Existing interpret-readiness.test.ts and prepare-purchasing.test.ts still pass unchanged (coverage scorer untouched).
- `pnpm --filter @axis/api build` (tsc strict) passes; no new dependency added to apps/api/package.json.

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes 'production-ready for autonomous purchasing' EARNED only when the repo's own code contains all critical controls, not a guaranteed output of running AXIS. Coverage score (existing) and code_readiness (new) become clearly separated. RESIDUAL HONESTY CAVEAT (ships verbatim in every response and in reworded docs): this is STATIC PRESENCE DETECTION -- it confirms required integration patterns exist in source, NOT that they are correct, wired together, or secure; not a security audit, penetration test, or PCI/SCA certification. The README's '0/100 -> 100/100 · Production-ready' may remain ONLY if reworded to mean 'all required purchasing-control patterns detected in code' and only for repos that actually pass the gate; the blanket 'every repo reaches 100/100 production-ready' framing (handlers.ts:2221, index.html:10) must be dropped. The claim is fully closable as a defensible presence-verdict; it cannot be closed as a correctness/security guarantee by code alone.
