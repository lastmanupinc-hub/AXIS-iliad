# WO-06 · sca-exemption-engine

**Claim it makes true:** visa_compliance_kit: "SCA Exemption Decision Matrix with 7-priority lighter SCA paths".

**Tier:** A_pure_software · **Effort:** M · **Package:** packages/generator-core

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`medium`
**Missing for codeability:** Three unspecified design decisions the agent must make: (a) the column set for renderScaExemptionMatrix -- ScaExemptionRule has no agent_action/fallback fields yet the current table shows those columns; (b) how a single no-arg renderScaExemptionMatrix():string can feed three tables with incompatible schemas (Priority|Exemption|MaxAmount|AgentAction|Fallback vs Exemption|Condition|Notes|AgentAction vs Scenario|Action|AP2Field) -- only acceptance #11 (one table) is actually enforced; (c) how generateNegotiationRules' scenario-based rows (Challenge required / Frictionless approved) map onto the 7 exemptions, since they don't. Also missing: an acceptance test that guards the load-bearing honesty caveat ('priority order is AXIS preference, not a regulatory mandate') -- without it a passing impl can present invented ordering as PSD2 law.
**Spec overclaims flagged:** target_state calls it 'the PSD2 SCA-RTS exemption hierarchy' -- PSD2/EBA RTS defines exemptions but assigns NO priority ordering; the 7-priority order is AXIS-invented (its own doc_impact admits this). The word 'hierarchy' fabricates regulatory backing.; 'a single exported SCA_EXEMPTION_ORDER constant + a renderScaExemptionMatrix helper' driving all THREE tables is mechanically impossible: the tables have different column schemas and renderScaExemptionMatrix has a fixed no-arg signature returning one string. Only one table (acceptance #11) is enforced.; merchant_initiated and one_leg_out are OUT-OF-SCOPE categories under PSD2, not RTS exemptions; the type ScaExemptionName and the 'exemption' field mislabel them inside an 'Exemption Decision Matrix'.; 'The three static SCA tables are re-rendered from the engine' overclaims for generateNegotiationRules, whose scenario rows (Challenge required/Frictionless approved) don't correspond to the 7 exemptions and are not byte-tested, so they will likely stay partly hand-typed.; doc_impact says the 'order is AXIS preference not a mandate' caveat MUST remain in rendered markdown, but NO acceptance criterion tests for it -- only the 'verify with your acquirer' line (acceptance #12) is guarded, so honest closure is not actually enforced.
**Hidden external gates:** No BUILD-time gates (pure software; external_gates/new_deps correctly empty).; Operational-only (not build) gates the WO honestly scopes out: real TRA eligibility needs the acquirer's live reference fraud rate; trusted_beneficiary needs issuer-side enrollment/opt-in; merchant_initiated needs a stored-credential + original SCA reference; secure_corporate needs an actual corporate card program. None block compiling the library, but they gate real-world efficacy of the 'exemptions'.

## Current state
The claim "SCA Exemption Decision Matrix with 7-priority lighter SCA paths" is backed only by static markdown, not a decision engine. In packages/generator-core/src/generators-agentic-purchasing.ts: buildLighterScaSection (lines 300-352) emits a hardcoded 7-row priority table (323-331) and an ASCII decision "tree" in a code fence (308-319); the only input-dependent byte is the signals.has_sca ternary at line 350. buildTapInteropSection has a second static 6-row scaExemptionRows table (355-362) under the "SCA Exemption Decision Matrix" heading (389-393). generateNegotiationRules has a third mini-table (914-920). No decideScaExemption exists (grep-confirmed). CommerceSignals (line 23) holds only repo-scan booleans (has_sca, has_recurring, etc.) -- no amount, currency, fraud-band, MIT, corporate, or one-leg-out fields -- so the engine needs a NEW context type. The exact analog to mirror already exists: computeComplianceGrade(files)->ComplianceGradeResult (lines 487-514), a pure exported function with a typed result interface, re-exported from index.ts:65-66. Render sites for buildLighterScaSection: line 677 (generateAgentPurchasingPlaybook) and line 992 (generateCheckoutFlow).

## Target state (== the claim is literally true)
A pure, deterministic decideScaExemption(ctx: ScaExemptionContext): ScaDecision implements the PSD2 SCA-RTS exemption hierarchy as an explicit 7-priority ordering (low_value, secure_corporate, merchant_initiated, recurring_fixed, trusted_beneficiary, transaction_risk_analysis, one_leg_out) plus a 3DS2 challenge fallback. It returns the chosen exemption, its priority rank (1-7), sca_required, a human-readable rationale, the next fallback, the TRA fraud-band cap when applicable, and the full applicable-candidate list in priority order. TRA caps are computed from the EBA RTS fraud-rate bands (<=1bps->EUR500, <=6bps->EUR250, <=13bps->EUR100, else ineligible) against the amount. The three static SCA tables (buildLighterScaSection priority table, buildTapInteropSection scaExemptionRows, generateNegotiationRules mini-table) are re-rendered from a single exported SCA_EXEMPTION_ORDER constant + a renderScaExemptionMatrix helper driven by the engine, so the "Decision Matrix" and "7-priority" claim is computed, not literal. Engine + constant + types re-exported from index.ts. No artifact/program counts change (it is a library function like computeComplianceGrade, not a generator).

## Files to create / edit
- packages/generator-core/src/generators-agentic-purchasing.ts
- packages/generator-core/src/index.ts
- packages/generator-core/src/generators-sca-exemption.test.ts
- packages/generator-core/src/generators-agentic-purchasing.test.ts

## Interfaces
```ts
```typescript
// New in generators-agentic-purchasing.ts -- mirror computeComplianceGrade (487-514)

export interface ScaExemptionContext {
  amount_eur: number;                 // transaction amount in EUR (required)
  is_secure_corporate?: boolean;      // dedicated/lodged corporate card program (RTS Art 16)
  is_merchant_initiated?: boolean;    // MIT w/ stored credential + original SCA reference (out of SCA scope)
  is_recurring_fixed?: boolean;       // fixed-amount subsequent collection (RTS Art 13)
  is_trusted_beneficiary?: boolean;   // merchant on cardholder trusted list (RTS Art 12)
  is_one_leg_out?: boolean;           // payer or payee outside the EEA (SCA not mandated territorially)
  has_prior_sca?: boolean;            // a prior SCA exists; REQUIRED for recurring_fixed & trusted_beneficiary
  tra_acquirer_fraud_bps?: number;    // acquirer reference fraud rate in basis points (RTS Art 15 bands)
}

export type ScaExemptionName =
  | "low_value"
  | "secure_corporate"
  | "merchant_initiated"
  | "recurring_fixed"
  | "trusted_beneficiary"
  | "transaction_risk_analysis"
  | "one_leg_out"
  | "3ds2_challenge"; // terminal fallback -- SCA required

export interface ScaExemptionRule {
  name: ScaExemptionName;
  priority: number;                   // 1..7
  label: string;
  condition: string;                  // human-readable predicate description
  max_amount_eur: number | null;      // null = unlimited / N/A
}

export interface ScaDecision {
  exemption: ScaExemptionName;        // chosen path (or "3ds2_challenge")
  priority: number;                   // rank of chosen path; 8 for the challenge fallback
  sca_required: boolean;              // true only for the "3ds2_challenge" fallback
  rationale: string;                  // why this path was chosen
  fallback: ScaExemptionName;         // next path if this exemption is refused ("3ds2_challenge" when none apply)
  tra_cap_eur?: number;              // present only when chosen/considered exemption is TRA
  candidates: ScaExemptionName[];    // all applicable exemptions, in priority order
}

// Canonical, deterministic 7-priority ordering (recommended agent-optimized order).
export const SCA_EXEMPTION_ORDER: readonly ScaExemptionRule[]; // length === 7, priorities 1..7 ascending

export function decideScaExemption(ctx: ScaExemptionContext): ScaDecision;

// EBA RTS Art 15 fraud-rate bands. Returns 500|250|100|0 (0 = not TRA-eligible).
export function traCapEur(acquirerFraudBps: number | undefined): number;

// Renders the priority matrix (markdown table rows) from SCA_EXEMPTION_ORDER -- single source for all 3 render sites.
export function renderScaExemptionMatrix(): string;
```
```

## Acceptance tests (DONE == claim true)
- decideScaExemption({ amount_eur: 12 }) returns { exemption: 'low_value', priority: 1, sca_required: false } -- low value auto-applies.
- traCapEur(1) === 500 && traCapEur(6) === 250 && traCapEur(13) === 100 && traCapEur(20) === 0 && traCapEur(undefined) === 0 -- EBA RTS fraud bands.
- decideScaExemption({ amount_eur: 200, tra_acquirer_fraud_bps: 5 }) returns exemption 'transaction_risk_analysis' with tra_cap_eur === 250 and sca_required === false (200 <= 250 band).
- decideScaExemption({ amount_eur: 400, tra_acquirer_fraud_bps: 5 }) returns exemption '3ds2_challenge', sca_required === true, priority === 8, fallback === '3ds2_challenge' -- 400 exceeds the 250 band and nothing else applies.
- Priority ordering is enforced: decideScaExemption({ amount_eur: 12, is_secure_corporate: true }) returns exemption 'low_value' (rank 1 beats secure_corporate rank 2), and its candidates array === ['low_value','secure_corporate'].
- recurring_fixed and trusted_beneficiary require has_prior_sca: decideScaExemption({ amount_eur: 100, is_recurring_fixed: true, has_prior_sca: false }) returns '3ds2_challenge' with sca_required true; the same ctx with has_prior_sca: true returns exemption 'recurring_fixed', sca_required false.
- decideScaExemption({ amount_eur: 100, is_one_leg_out: true }) returns exemption 'one_leg_out' (priority 7) with sca_required false and a rationale string mentioning EEA.
- Every ScaDecision has a non-empty rationale string; for a ctx with multiple matches the candidates array is sorted ascending by priority.
- SCA_EXEMPTION_ORDER.length === 7 and SCA_EXEMPTION_ORDER.map(r => r.priority) deep-equals [1,2,3,4,5,6,7].
- decideScaExemption is importable from the package root: `import { decideScaExemption, SCA_EXEMPTION_ORDER } from '@axis/generator-core'` type-checks and runs (re-exported in index.ts, mirroring line 65-66).
- generateCheckoutFlow(ctx, profile, files).content and generateAgentPurchasingPlaybook(ctx, profile, files).content both contain all 7 exemption names produced by renderScaExemptionMatrix(), and the priority table embedded in each doc is byte-equal to renderScaExemptionMatrix() output (no residual hand-typed duplicate of the engine rows).
- The 'verify current values/rules with your acquirer' honesty caveat text is still present in the rendered SCA sections (regression guard: engine must not turn advisory language into a guarantee).
- npm test (vitest) passes including counts-consistency.test and the existing generators-agentic-purchasing*.test files: TOTAL_GENERATORS/TOTAL_PROGRAMS unchanged (140/20), proving the engine added no generator.
- tsc --strict build of packages/generator-core succeeds with no new runtime dependency added to package.json.

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes the CLAUDE.md / visa_compliance_kit claim "SCA Exemption Decision Matrix with 7-priority lighter SCA paths" literally true: the 7 paths become the output of a real deterministic decideScaExemption engine with priority ordering + rationale + TRA fraud-band computation, and the rendered "Decision Matrix" tables are generated from SCA_EXEMPTION_ORDER rather than hand-typed. Residual honesty caveat that MUST remain in code comments and rendered markdown: (1) the priority ORDER is AXIS's recommended agent-optimized preference, not a regulatory mandate -- issuers/acquirers may apply their own order; (2) TRA caps reflect published EBA RTS thresholds but real eligibility depends on the acquirer's live reference fraud rate; (3) final exemption eligibility is decided by the acquirer/issuer, so the engine is decision-support, not an authorization oracle. Keep the existing 'verify with your acquirer' lines.
