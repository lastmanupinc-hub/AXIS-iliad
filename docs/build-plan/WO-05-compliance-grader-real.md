# WO-05 · compliance-grader-real

**Claim it makes true:** visa_compliance_kit: "8-check compliance grading".

**Tier:** A_pure_software · **Effort:** M · **Package:** packages/generator-core (function + types + tests); apps/api (call-site swap)

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** Nothing blocks coding. The spec is unusually complete: exact line refs verified, regex-level pass/warn/fail rules for all 8 validators, weights summing to 100, grade thresholds, full interfaces, and an acceptance suite the agent both writes and controls. Remaining work (title/remediation strings, concrete regexes, fixtures) is mechanical, not architectural. To FULLY close the doc claim the agent would additionally need to migrate the parallel buildVerificationProof surface (out of the spec's stated scope).
**Spec overclaims flagged:** doc_impact says it makes '8-check compliance grading' / verification_checks:8 'literally true', but there is a SECOND 8-check grade surface the spec never touches: buildVerificationProof (:118-147) computes its own A/B/C/D 'Compliance grade' from 8 equal-weight keyword booleans, embeds it in generated playbooks, and backs ap2_compliance_assessment.verification_proof.checks_total (asserted at generators-agentic-purchasing.test.ts:844). Only the API compliance_grade path is upgraded; the artifact-facing grade stays keyword-boolean.; Back-compat framed as 'existing {grade, checks_passed} readers are unaffected' -- structurally true, but the grade VALUE semantics change (count-based -> weighted-score), so a repo previously graded 'A' can now be 'C'. This is a live API behavior change the spec understates.; Acceptance criterion 6 (each single-signal fixture warns its own check while the other 7 stay 'fail') assumes zero keyword cross-contamination across validators; achievable because the agent controls the fixtures, but loose tokens like /lite/i in budget_negotiation risk real-repo false positives that the spec doesn't caveat.


## Current state
`computeComplianceGrade(files)` at `packages/generator-core/src/generators-agentic-purchasing.ts:498-514` reduces 8 booleans from `detectCommerceSignals` (`:50-93`) to a count, returning `ComplianceGradeResult = {grade, checks_passed, checks_total: 8}` (`:487-491`). Every "check" is one keyword regex over `path + content` (matchers `:71-78`); all equal-weight boolean pass/fail, no warn tier, no per-check status, no evidence, no remediation. Overlap with target: SCA, tokenization, dispute (3 of 8). Missing as real validators: AP2 mandate validity, CE-3.0 readiness, idempotency/receipt hygiene, budget-negotiation conformance, refund/cancel path. Self-labels "keyword-signal scan, NOT a certification" at `:141`, `:711`. Exported at `index.ts:65-66`; consumed at `apps/api/src/handlers.ts:587` (201 body) and `:627` (200 body). No test currently imports `computeComplianceGrade`; `compliance_grade` is not asserted in any `*.test.ts`. Deterministic -- no LLM/mppx charge in this path.

## Target state (== the claim is literally true)
A single deterministic `gradeCompliance(files)` runs exactly 8 distinct multi-signal validators (SCA readiness, AP2 mandate validity, tokenization posture, CE-3.0 readiness, dispute-rail wiring, idempotency/receipt hygiene, budget-negotiation conformance, refund/cancel path), each returning `{name, title, status: pass|warn|fail, weight, score, evidence[], remediation}`. Result carries a weighted 0–100 `score`, a threshold `grade`, the full `checks[]` array, back-compat `checks_passed`/`checks_total: 8`, and a `methodology` honesty string. Each validator combines >=2 signals so pass != single-keyword; warn is a real intermediate tier with concrete remediation. `computeComplianceGrade` remains a superset-compatible alias so the two handler call sites keep working; API `compliance_grade` gains `checks[]`, `score`, `methodology`. Makes "8-check compliance grading" literally true (8 real per-check validators, weighted grade, remediation) while staying honest: static source-signal analysis, not a live certification.

## Files to create / edit
- packages/generator-core/src/generators-agentic-purchasing.ts
- packages/generator-core/src/index.ts
- apps/api/src/handlers.ts
- packages/generator-core/src/generators-agentic-purchasing-compliance.test.ts

## Interfaces
```ts
// packages/generator-core/src/generators-agentic-purchasing.ts

export type CheckStatus = "pass" | "warn" | "fail";

export interface ComplianceCheck {
  name:
    | "sca_readiness"
    | "ap2_mandate_validity"
    | "tokenization_posture"
    | "ce3_readiness"
    | "dispute_rail_wiring"
    | "idempotency_receipt"
    | "budget_negotiation"
    | "refund_cancel_path";
  title: string;
  status: CheckStatus;
  weight: number;        // integer; the 8 weights sum to 100
  score: number;         // weight (pass) | round(weight/2) (warn) | 0 (fail)
  evidence: string[];    // concrete matched signals / file paths; [] when fail
  remediation: string;   // always non-empty; actionable when warn/fail
}

// Superset of the OLD shape -- old {grade, checks_passed, checks_total} keys preserved.
export interface ComplianceGradeResult {
  grade: "A" | "B" | "C" | "D";
  checks_passed: number;       // count of status === "pass" (0..8)
  checks_total: 8;
  score: number;               // sum of check.score, 0..100
  checks: ComplianceCheck[];   // length === 8, stable order
  methodology: string;         // honesty caveat; contains "not a certification"
}

// NEW canonical entrypoint. Safe on undefined/empty -> grade "D", score 0, 8 fails.
export function gradeCompliance(files: SourceFile[] | undefined): ComplianceGradeResult;

// Back-compat alias: delegates to gradeCompliance (return is a superset, so existing
// {grade, checks_passed, checks_total} readers are unaffected). Keep exported.
export function computeComplianceGrade(files: SourceFile[] | undefined): ComplianceGradeResult;

// Each validator is a pure fn (files/derived signals) -> ComplianceCheck. Suggested weights:
// sca_readiness 18, ap2_mandate_validity 16, tokenization_posture 16, dispute_rail_wiring 14,
// idempotency_receipt 12, ce3_readiness 10, refund_cancel_path 8, budget_negotiation 6  (= 100)
// Grade thresholds on weighted score: A>=85, B>=65, C>=40, else D.
// Validator pass/warn/fail rule (each needs >=2 co-signals for pass):
//  sca_readiness:        pass = 3ds/psd2 AND (frictionless|challenge|exemption|TRA); warn = one; fail = none
//  ap2_mandate_validity: pass = mandate id/type AND (max_amount|spending_limit|expires|valid_until|scope); warn = mandate kw only; fail = none
//  tokenization_posture: pass = (network_token|dpan|mdes|vts) AND NOT raw-PAN-store antipattern; warn = provider-vaulted token only; fail = raw PAN store OR none
//  ce3_readiness:        pass = >=2 of {prior_transaction, device/ip fingerprint, avs/delivery confirmation, compelling_evidence|ce3}; warn = 1; fail = 0
//  dispute_rail_wiring:  pass = dispute/chargeback AND (webhook|rdr|cdrn|vrol) AND evidence-submission; warn = dispute kw + one; fail = dispute kw only or none
//  idempotency_receipt:  pass = idempotency_key AND (receipt|confirmation|txn_id emission); warn = one; fail = none
//  budget_negotiation:   pass = (x-agent-budget|budget_per_run|budget_cents) AND (x-agent-mode|lite|budget_aware); warn = one; fail = none
//  refund_cancel_path:   pass = (refund|reversal) AND (cancel|void|revoke_mandate); warn = one; fail = none

// packages/generator-core/src/index.ts
export { gradeCompliance /* + keep computeComplianceGrade, detectCommerceSignals */ } from "./generators-agentic-purchasing.js";
export type { ComplianceGradeResult, ComplianceCheck, CheckStatus, CommerceSignals } from "./generators-agentic-purchasing.js";

// apps/api/src/handlers.ts (:587, :627) swap computeComplianceGrade(...) -> gradeCompliance(snapshot.files)
```

## Acceptance tests (DONE == claim true)
- New file `packages/generator-core/src/generators-agentic-purchasing-compliance.test.ts` imports { gradeCompliance, computeComplianceGrade } from './generators-agentic-purchasing.js' and passes under `pnpm --filter @axis/generator-core test`.
- gradeCompliance(undefined) and gradeCompliance([]) each return grade === 'D', score === 0, checks_total === 8, checks_passed === 0, checks.length === 8, and every check.status === 'fail' with check.evidence.length === 0 and check.remediation.length > 0.
- The 8 check.name values equal exactly the set {sca_readiness, ap2_mandate_validity, tokenization_posture, ce3_readiness, dispute_rail_wiring, idempotency_receipt, budget_negotiation, refund_cancel_path} with no duplicates; checks are returned in a stable order across calls.
- Sum of all check.weight === 100; and result.score === checks.reduce((s,c)=>s+c.score,0) for every fixture.
- A hand-built 'rich' SourceFile[] fixture that satisfies the pass rule of all 8 validators (3ds2+frictionless exemption; mandate_id+max_amount+valid_until; network_token/vts without raw-PAN storage; prior_transaction+device fingerprint+avs; chargeback+dispute webhook(rdr)+evidence submission; idempotency_key+receipt; X-Agent-Budget+X-Agent-Mode lite; refund+cancel) yields grade === 'A', score >= 85, checks_passed === 8, and every check.status === 'pass' with check.score === check.weight and check.evidence.length >= 1.
- For each validator individually: a fixture hitting only ONE of its two required co-signals yields that check.status === 'warn' with check.score === Math.round(check.weight/2) and non-empty remediation, while the other 7 checks stay 'fail' (proves warn is a real tier and each validator needs >=2 signals to pass, not single-keyword).
- A fixture containing a raw-PAN storage antipattern (e.g. `card_number:` persisted) forces tokenization_posture.status === 'fail' even when a network_token keyword is also present (proves a real posture check, not keyword match).
- computeComplianceGrade(fixture) deep-equals gradeCompliance(fixture) for >=3 fixtures, AND the returned object still contains keys grade, checks_passed, checks_total===8 (back-compat superset preserved).
- result.methodology is a non-empty string containing 'not a certification' (case-insensitive) and containing neither 'certified' nor 'audited' (honesty caveat retained, no overclaim).
- Determinism: gradeCompliance(fixture) called twice deep-equals itself for the rich, empty, and each single-signal fixture.
- Repo-wide `pnpm test` stays green -- counts.consistency/count-honesty and strategic-docs-honesty guards still pass (checks_total literal 8 and generator/program counts unchanged); existing generators-agentic-purchasing*.test.ts unaffected.

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes CLAUDE.md / MCP manifest claim `visa_compliance_kit: "8-check compliance grading"` and `"verification_checks":8` literally true: 8 distinct multi-signal validators with per-check pass/warn/fail, weighted 0-100 grade, and remediation -- not 8 equal-weight keyword booleans. Residual honesty caveat that MUST remain in `methodology` and docs: this is deterministic STATIC source-signal analysis of submitted files, not a live compliance audit, PCI assessment, or card-network certification; it cannot verify runtime behavior, real network-token enrollment, or cryptographically-signed mandates. Do not upgrade doc wording to 'certified'/'audited'.
