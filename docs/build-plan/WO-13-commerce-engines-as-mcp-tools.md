# WO-13 · commerce-engines-as-mcp-tools

**Claim it makes true:** The compliance kit outputs are presented as capabilities, not documents.

**Tier:** A_pure_software · **Effort:** L · **Package:** packages/generator-core (new engines + registry wiring) and apps/api (MCP tools + counts)

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** "(1) A real, importable verifyAp2Mandate does not exist -- it is only a string literal of generated code (commerce-integration.ts:97-113) that references module-scoped PRICE_CENTS and enforces amt>=PRICE_CENTS. Acceptance #2 as written cannot compile; the spec must specify extracting it into a callable export with a redefined signature (no/parametrized amount floor) while keeping the generated x402 copy working. (2) Reconcile the CE3 scope contradiction: generateCommerceRegistry restricts CE 3.0 to code 10.4 only (with an explicit honesty comment) whereas buildCe3Evidence targets 10.2/10.3/10.4 -- the spec must state which is canonical before calling one from the other. (3) Complete the file manifest: LAUNCH_CLAIMS.yaml (asserted by launch-claims.test.ts) and InstallPage.tsx ('29 public tools') must be bumped, plus ForAgentsPage's hardcoded per-tool <ul> gains 5 entries. (4) Define decideScaExemption currency/FX semantics when currency!='eur' (thresholds are €-denominated). (5) Specify the exact free/no-auth gating hook in the mcp-server dispatch that lets the 5 new tools bypass metering."
**Spec overclaims flagged:** target_state #1 and acceptance #2 call verifyAp2Mandate a 'shipped scaffold at commerce-integration.ts:97' that 'accepts header_value' -- it is non-callable generated string code coupled to PRICE_CENTS, not an importable function.; Claims generateCommerceRegistry becomes a verified 'single source of truth' by calling buildCe3Evidence, but buildCe3Evidence (10.2/10.3/10.4) contradicts the registry's own deliberate 10.4-only CE3 narrowing; merging ships two conflicting CE3 definitions.; doc_impact says the work makes the compliance-kit claim 'literally true' for the named engines, but the spec simultaneously leaves CLAUDE.md's 'win probability model', TAP/UCP interop, network tokenization, and VROL/RDR/CDRN dispute-lifecycle as un-tool-ized marketing -- so the umbrella claim is only partially closed.; files[] omits LAUNCH_CLAIMS.yaml and InstallPage.tsx even though acceptance #9 requires their honesty tests to pass; 'any other .tsx' hand-waves the .yaml entirely.
**Hidden external gates:** None required for the spec's own 5 free deterministic tools (pure node:crypto, read-only, no billing).; For the BROADER CLAUDE.md kit claim only: VTS/MDES network-token enrollment and Verifi/Visa CDRN/RDR enrollment would be needed to make the tokenization + dispute-lifecycle lines literally true -- the spec correctly does not attempt these, so they remain document-only.

## Current state
The "compliance kit" is documented as capabilities but most of it is only markdown, and none of it is an MCP tool.

- Callable engines that already exist: `computeComplianceGrade(files)` (generators-agentic-purchasing.ts:498), `detectCommerceSignals(files)` (:50), `buildCe3Evidence(signals, projectName)` and `buildDisputeReadiness(signals, projectName)` (apps/api/src/commerce-integration.ts:217, :318). None are exposed as MCP tools.
- SCA-exemption and AP2-mandate exist ONLY as descriptive markdown: `buildLighterScaSection` (generators-agentic-purchasing.ts:300), `buildTapInteropSection` (:354), `buildAP2ComplianceScoring` (:167). No callable decision function.
- `generateCommerceRegistry` (generators-agentic-purchasing.ts:1158-1356) RE-DERIVES score (1167-1175), CE3 requirements (1228-1242) and verification_proof (1245-1260) inline; it does NOT call the engines, so registry and (missing) tools can drift.
- MCP surface: MCP_TOOLS array (mcp-tools.ts:81+), dispatch switch (mcp-server.ts:247-345), impls in mcp-tool-impls.ts. Free/no-auth read-only tools already exist as a pattern (runSearchTools:1783, runDiscoverAgenticCommerceTools:1867, runDiscoverAgenticPurchasingNeeds:2149).
- MCP_TOOL_COUNT = 29 (counts.ts:30), pinned == MCP_TOOLS.length by counts-consistency.test.ts:17-19.
- HONESTY CONSTRAINT (verified in code): AXIS deliberately refuses win-rate prediction ("AXIS does not publish win-rate estimates", generators-agentic-purchasing.ts:296,1243; buildDisputeReadiness md at commerce-integration.ts:366-368 says it scores capture-readiness "NOT dispute-win odds"). A literal `score_dispute_win` tool would contradict the shipped stance and its honesty tests.
- TIER RATIONALE: pure software; engines are deterministic functions of already-available inputs; proofs use node:crypto (builtin); tools are free/read-only so no billing plumbing; no external partner or credential.

## Target state (== the claim is literally true)
Four of the five named engines become real, callable, verified MCP tools; the fifth ships under an honest name. `generateCommerceRegistry` is refactored to CALL the engines (single source of truth) and embed a reproducible proof. The claim becomes true when:

1. Two new pure decision engines exist and are deterministic: `decideScaExemption(input)` (code re-encoding of the already-published 7-priority SCA matrix) and `buildAp2Mandate(input)` (produces a mandate whose `header_value` is accepted by the shipped `verifyAp2Mandate` scaffold at commerce-integration.ts:97).
2. The two existing pure engines (`buildCe3Evidence`, `buildDisputeReadiness`) move into generator-core so `generateCommerceRegistry` can call them across the package boundary; re-exported from commerce-integration.ts for back-compat (existing commerce-integration.test.ts still imports them).
3. `generateCommerceRegistry` calls `gradeCommerceSignals`, `buildDisputeReadiness`, `buildCe3Evidence`, `decideScaExemption` and emits a `verified_decisions` block with a `proof` (sha256 over canonical inputs+outputs). No number recomputed inline.
4. Five new MCP tools registered, dispatched, implemented: `sca_exemption_decision`, `assemble_ce3_evidence`, `grade_compliance`, `build_ap2_mandate`, `score_dispute_readiness` (honest name for the 'win' engine -- returns evidence-CAPTURE readiness, never win odds, response carries that disclaimer verbatim). All free, no-auth, read-only, deterministic (no metering => no PRICING_TIERS/MeteredMcpTool changes).
5. MCP_TOOL_COUNT 29 -> 34; every "29 MCP/public tools" claim in README.md and apps/web/src/**/*.tsx bumped to 34. Full honesty + counts suite green.

RESIDUAL HONESTY CAVEAT (must be preserved, not papered over): the literal name `score_dispute_win` is NOT shipped, because AXIS's stance refuses win-rate prediction. It ships as `score_dispute_readiness`, scoring whether the caller can ASSEMBLE CE 3.0 evidence -- not win probability. The tool description and output `disclaimer` field must state this. Any "win probability model" language in CLAUDE.md stays marketing about the grading rubric, not a code capability; do not add a win-odds predictor.

Anchors: generators-agentic-purchasing.ts:1158/:498/:300/:354/:167; commerce-integration.ts:217/:318/:97; mcp-tools.ts:81; mcp-server.ts:247-345; mcp-tool-impls.ts:2149; counts.ts:30; counts-consistency.test.ts:17.

## Files to create / edit
- packages/generator-core/src/commerce-engines.ts
- packages/generator-core/src/index.ts
- packages/generator-core/src/generators-agentic-purchasing.ts
- packages/generator-core/src/commerce-engines.test.ts
- apps/api/src/commerce-integration.ts
- apps/api/src/mcp-tools.ts
- apps/api/src/mcp-server.ts
- apps/api/src/mcp-tool-impls.ts
- apps/api/src/counts.ts
- apps/api/src/mcp-commerce-tools.test.ts
- README.md
- apps/web/src/pages/ForAgentsPage.tsx

## Interfaces
```ts
// ── packages/generator-core/src/commerce-engines.ts (NEW) ──
import { createHash, createHmac } from "node:crypto";
import type { CommerceSignals } from "./generators-agentic-purchasing.js";

export interface ReproProof { algo: "sha256"; digest: string; over: string[]; }
// Canonical (sorted-key) JSON hash so identical inputs+outputs => identical digest.
export function proofDigest(over: string[], payload: unknown): ReproProof;

// 1) SCA -- pure re-encoding of the published 7-priority matrix (buildLighterScaSection).
export type ScaExemption =
  | "low_value" | "trusted_beneficiary" | "recurring_fixed" | "merchant_initiated"
  | "secure_corporate" | "transaction_risk_analysis" | "none_request_3ds2";
export interface ScaExemptionInput {
  amount_cents: number;
  currency?: string;              // default "eur" (thresholds are PSD2 €-denominated)
  merchant_trusted?: boolean;     // cardholder opted in after a prior SCA
  recurring_fixed?: boolean;      // fixed-amount subscription
  prior_sca_completed?: boolean;  // gates trusted_beneficiary / recurring_fixed
  merchant_initiated?: boolean;   // MIT w/ stored credential + original SCA ref
  secure_corporate?: boolean;     // dedicated corporate-card program
  tra_eligible?: boolean;         // acquirer TRA within its fraud-rate band
}
export interface ScaExemptionDecision {
  exemption: ScaExemption;
  sca_required: boolean;
  priority: number;               // 1..7 matching the published matrix; 0 = 3DS2 fallback
  matched_rule: string;
  reason: string;
  caveat: string;                 // "eligibility is ultimately decided by acquirer + issuer"
  proof: ReproProof;
}
export function decideScaExemption(input: ScaExemptionInput): ScaExemptionDecision;

// 2) AP2 mandate -- output consumable by verifyAp2Mandate (commerce-integration.ts:97).
export interface Ap2MandateInput {
  max_amount_cents: number;
  currency?: string;              // default "usd"
  interval?: "one_time" | "day" | "week" | "month" | "year"; // default "one_time"
  agent_id?: string;
  expires_at?: string;            // ISO8601, optional
  secret?: string;                // optional caller HMAC secret; AXIS stores no keys
}
export interface Ap2Mandate {
  mandate: {
    version: "0.1";
    constraints: { max_amount_cents: number; currency: string; interval: string };
    agent_id: string | null;
    expires_at: string | null;
  };
  encoded: string;                // base64(JSON payload incl. max_amount_cents)
  signature: string | null;       // hex HMAC-SHA256 over `encoded` when secret supplied
  header_value: string | null;    // `${encoded}.${signature}` -- drop-in X-AP2-Mandate value
  note: string;                   // signed vs "unsigned template -- sign client-side"
  proof: ReproProof;
}
export function buildAp2Mandate(input: Ap2MandateInput): Ap2Mandate;

// 3) MOVED here from commerce-integration.ts (bodies unchanged) so the registry can call them:
export interface DisputeReadiness { score: number; grade: string; dimensions: unknown[]; gaps: unknown[]; md: string; }
export function buildCe3Evidence(signals: CommerceSignals, projectName: string): { json: string; schema: string };
export function buildDisputeReadiness(signals: CommerceSignals, projectName: string): DisputeReadiness;

// ── generators-agentic-purchasing.ts: factor the 8-check grade out of computeComplianceGrade ──
export function gradeCommerceSignals(signals: CommerceSignals): ComplianceGradeResult; // NEW
// computeComplianceGrade(files) => gradeCommerceSignals(detectCommerceSignals(files))
// generateCommerceRegistry embeds:
//   verified_decisions: { compliance: gradeCommerceSignals(signals),
//                         dispute_readiness: buildDisputeReadiness(signals, name),
//                         ce3_schema_digest: <sha256 of buildCe3Evidence(...).schema>,
//                         sca_samples: [decideScaExemption({amount_cents:2000,currency:"eur"}), ...],
//                         proof: proofDigest([...], {signals, grade, readiness}) }

// ── apps/api/src/mcp-tool-impls.ts (NEW impls; pattern = runDiscoverAgenticPurchasingNeeds) ──
export function runScaExemptionDecision(args: Record<string, unknown>): string;   // -> ScaExemptionDecision JSON
export function runAssembleCe3Evidence(args: Record<string, unknown>): string;    // {files, project_name} -> {json,schema}
export function runGradeCompliance(args: Record<string, unknown>): string;        // {files} -> ComplianceGradeResult + signals
export function runBuildAp2Mandate(args: Record<string, unknown>): string;        // -> Ap2Mandate JSON
export function runScoreDisputeReadiness(args: Record<string, unknown>): string;  // {files, project_name} -> DisputeReadiness + disclaimer

// ── apps/api/src/counts.ts ──
export const MCP_TOOL_COUNT = 34; // was 29
```

## Acceptance tests (DONE == claim true)
- cd packages/generator-core: `decideScaExemption({ amount_cents: 2000, currency: 'eur' })` returns `{ exemption: 'low_value', sca_required: false, priority: 1 }`; `decideScaExemption({ amount_cents: 100000 })` (no flags) returns `{ exemption: 'none_request_3ds2', sca_required: true }`; `decideScaExemption({ amount_cents: 40000, tra_eligible: true, currency: 'eur' })` returns `transaction_risk_analysis` (<=€500) while `{ amount_cents: 60000, tra_eligible: true }` falls through to `none_request_3ds2`.
- CROSS-ENGINE proof: `const m = buildAp2Mandate({ max_amount_cents: 500, secret: 's' })`; importing `verifyAp2Mandate` from apps/api/src/commerce-integration.ts, `verifyAp2Mandate(m.header_value!, 's')` === `{ ok: true, amount_cents: 500 }`; wrong secret => `{ ok: false }`; `buildAp2Mandate({ max_amount_cents: 500 })` (no secret) => `signature === null`, `header_value === null`, `note` mentions 'unsigned'.
- DETERMINISM: two calls to `decideScaExemption` (and to `buildAp2Mandate` without a secret, and to `generateCommerceRegistry`) with identical inputs produce byte-identical `proof.digest`.
- REGISTRY WIRED: parse `generateCommerceRegistry(ctx, profile, files).content` as JSON; `parsed.verified_decisions.proof.algo === 'sha256'`; `parsed.verified_decisions.compliance.grade === computeComplianceGrade(files).grade` (same source); the old inline `ap2_compliance_assessment.verification_proof.checks_passed` === `gradeCommerceSignals(detectCommerceSignals(files)).checks_passed`.
- MCP REGISTRATION: `MCP_TOOLS.map(t => t.name)` includes `sca_exemption_decision`, `assemble_ce3_evidence`, `grade_compliance`, `build_ap2_mandate`, `score_dispute_readiness`; each has readOnlyHint:true.
- counts-consistency.test.ts passes: `MCP_TOOL_COUNT === MCP_TOOLS.length === 34`.
- DISPATCH end-to-end (mcp-server tools/call): `sca_exemption_decision` with `{amount_cents:2000,currency:'eur'}` returns text parsing to the decision; `grade_compliance` with a payment-heavy `files[]` returns grade 'A'/'B'; `assemble_ce3_evidence` returns `{json,schema}` where schema parses and has `compelling_evidence_version const '3.0'`; `build_ap2_mandate` returns a `header_value` accepted by `verifyAp2Mandate`.
- HONESTY: `score_dispute_readiness` tool description AND its JSON response both contain the assertion that it scores evidence-capture readiness and is NOT a dispute-win prediction; repo grep confirms NO tool named `score_dispute_win` and no new 'win rate'/'win probability'/'win odds' predictor code.
- count-honesty.test.ts, strategic-docs-honesty.test.ts, launch-claims.test.ts all pass after bumping README.md + apps/web ForAgentsPage (and any other .tsx) '29 MCP/public tools' -> '34'.
- `pnpm -w build && pnpm -w test` green (TypeScript strict, no new runtime deps).

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes the CLAUDE.md/README claim 'compliance kit outputs are presented as capabilities, not documents' literally true for 4 of the 5 named engines exactly as named (sca_exemption_decision, assemble_ce3_evidence, grade_compliance, build_ap2_mandate) and the 5th under the honest name score_dispute_readiness. generateCommerceRegistry's numbers become engine-derived (verified, with a reproducibility proof) instead of inline-recomputed. RESIDUAL CAVEAT that must remain in docs: there is NO score_dispute_win / win-probability tool -- AXIS still refuses win-rate prediction; the kit scores evidence-capture readiness only. Any 'win probability model' language in CLAUDE.md stays marketing describing the grading rubric, not a shipped predictor, and must not be upgraded to imply one.
