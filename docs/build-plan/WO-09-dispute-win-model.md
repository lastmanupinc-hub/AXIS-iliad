# WO-09 · dispute-win-model

**Claim it makes true:** visa_compliance_kit: "win probability model with per-reason-code dispute optimization".

**Tier:** A_pure_software · **Effort:** M · **Package:** packages/generator-core (engine + wiring) and apps/api (MCP tool + counts)

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`medium`
**Missing for codeability:** "(1) Correct the file list: apps/api/src/budget-probe.ts does NOT exist -- the kit 'includes' array is in packages/mpp/src/index.ts (build402NegotiationBody), which is unlisted. (2) Add apps/api/src/mcp-tools.ts to files -- MCP_TOOLS + the tool inputSchema live there, not mcp-server.ts. (3) Specify the new tool's price and metering path: PRICING_TIERS entry in packages/mpp/src/index.ts (value unstated) and, to mirror prepare_agentic_purchasing exactly, extension of MeteredMcpTool union + INBAND_METERED_TOOLS in mcp-server.ts. (4) Enumerate the THIRD disclaimer at generators-agentic-purchasing.ts:296 (buildDisputeEvidenceChecklist, shared by playbook+negotiation) which the zero-occurrences acceptance forces you to edit while keeping 'operator's dispute policy'. (5) Provide/constrain actual coefficient VALUES: the agent must invent numbers satisfying all relational acceptance tests simultaneously (3DS-alone >=0.67 for 10.x, ce3 raises 10.4 more than 13.x, deliveryProof top-weight for 13.x, monotonic) -- solvable but iterative. Note the 'accept' branch (prob<0.34 AND topMissingEvidence.length===0) is near-unreachable since all-evidence-present implies high prob."
**Spec overclaims flagged:** Lists apps/api/src/budget-probe.ts as a file to edit; that file does not exist in the repo.; Says the tool is 'registered in MCP_TOOLS + dispatched' but omits mcp-tools.ts (where MCP_TOOLS + schemas actually live) from the file list.; Claims the new tool is 'metered/paid like prepare_agentic_purchasing' without listing packages/mpp/src/index.ts (PRICING_TIERS) or specifying a price, and without acknowledging prepare_agentic_purchasing is IN-BAND metered (MeteredMcpTool/INBAND_METERED_TOOLS) -- non-trivial plumbing presented as a one-line dispatch mirror.; target_state enumerates only the :771 and :1243 disclaimers, but a third identical disclaimer at :296 must also be removed to satisfy the zero-occurrences acceptance -- the seam inventory is incomplete.; Frames the deliverable as making the claim 'literally true' while the emitted probability is a fabricated hand-set number with zero empirical calibration; honesty rests entirely on a mandated caveat that itself concedes the figure is not a real win-rate -- 'win probability model' remains a stretch even after the work.
**Hidden external gates:** No credential/account/network-membership gate -- it is pure software calling nothing external (external_gates:[] is correct).; Data gate the spec punts: making it an ACTUAL win-probability model (empirically calibrated) needs real represented-outcome dispute data; the spec ships an uncalibrated hand-set heuristic and defers calibration behind WIN_PROB_MODEL_VERSION, so the shipped 'model' predicts nothing real.

## Current state
The claim "win probability model with per-reason-code dispute optimization" is currently FALSE by design; the code actively disclaims win-rate prediction. No engine, type, or source file exists (grep for scoreWinProbability/win_probability finds only COMPLIANCE_KIT_BUILD_SPEC.md and absence-asserting tests). All dispute data is inline literals in packages/generator-core/src/generators-agentic-purchasing.ts. Disclaimers: generators-agentic-purchasing.ts:771 (generateProductSchema, dispute_evidence_requirements.represent_vs_refund) and :1243 (generateCommerceRegistry, dispute_readiness.represent_vs_refund) both read "AXIS does not publish win-rate estimates." Absence-asserting tests to flip: generators-agentic-purchasing.test.ts:1066 commerce.dispute_win_probability toBeUndefined, :1086 dr.win_probability_model toBeUndefined, :1021 playbook not.toContain("Win-Probability Scoring"), :1041 negotiation not.toContain("AUTO-REPRESENT"); apps/api/src/budget-probe.test.ts:497 asserts kit includes array does NOT contain "Win probability". Reusable seams inline: CE-3.0 evidence inputs at generators-agentic-purchasing.ts:747-758 and :765-772 (thresholds 2/120/365, 5 qualified data elements, target_reason_codes ["10.4"]) are the natural EvidenceState fields. Barrel index.ts:65 re-exports generateProductSchema/generateCommerceRegistry. MCP: mcp-server.ts dispatches paid prepare_agentic_purchasing at :266-267, paid-tool list at :387; counts.ts:30 pins MCP_TOOL_COUNT=29, enforced by counts-consistency.test.ts against live MCP_TOOLS. Spec of record: COMPLIANCE_KIT_BUILD_SPEC.md WO-C3 (L63-71) + WO-C8 (L118-124); honesty ledger L134 = "transparent v0 model".

## Target state (== the claim is literally true)
A real, deterministic, documented per-reason-code scorer exists as a pure module and is surfaced end-to-end so the claim is literally true. (1) New file packages/generator-core/src/dispute-win.ts exports scoreWinProbability(reasonCode, evidence)->WinScore with a documented per-reason-code logistic model: z = intercept[reasonCodeFamily] + sum(weight_i * evidenceFactor_i), probability = sigmoid(z), all weights >= 0 so more/stronger evidence never lowers probability (monotonic). Coefficients live in an exported, commented constant table (no black box). recommendedAction derived by fixed thresholds; topMissingEvidence = not-yet-present factors ordered by descending weight for that reason code. WIN_PROB_MODEL_VERSION = "win-prob-v0" ships so a later retrain on real represented-outcome data can bump it. (2) Wired into product output: generateProductSchema emits repo_commerce_profile.dispute_win_probability (a WinScore computed from detected signals for reason code 10.4) replacing the L771 disclaimer; generateCommerceRegistry emits dispute_readiness.win_probability_model replacing the L1243 disclaimer; generateAgentPurchasingPlaybook gains a "Win-Probability Scoring" section; generateNegotiationRules emits an "AUTO-REPRESENT" recommendation line when recommendedAction === "represent". (3) New metered MCP tool score_dispute_win registered in MCP_TOOLS + dispatched (runScoreDisputeWin), MCP_TOOL_COUNT bumped 29->30. (4) All absence-asserting tests flipped to presence, and budget-probe kit includes gains "Win probability model (transparent v0)". Honesty preserved: every surfaced block carries a modelVersion + a "transparent v0 heuristic, not a Visa figure, retrained on real outcomes; follow your operator's dispute policy" caveat; no "Visa-grade"/certification language is added.

## Files to create / edit
- packages/generator-core/src/dispute-win.ts
- packages/generator-core/src/dispute-win.test.ts
- packages/generator-core/src/index.ts
- packages/generator-core/src/generators-agentic-purchasing.ts
- packages/generator-core/src/generators-agentic-purchasing.test.ts
- apps/api/src/mcp-server.ts
- apps/api/src/counts.ts
- apps/api/src/mcp-server.test.ts
- apps/api/src/budget-probe.ts
- apps/api/src/budget-probe.test.ts
- apps/api/src/prepare-purchasing.test.ts

## Interfaces
```ts
// packages/generator-core/src/dispute-win.ts
export const WIN_PROB_MODEL_VERSION = "win-prob-v0";

export type RecommendedAction = "represent" | "accept" | "gather";
export type WinBand = "low" | "moderate" | "high";

/** CE-3.0 + auth evidence available for a disputed txn. Booleans default false, counts default 0. */
export interface EvidenceState {
  ce3Eligible: boolean;              // >=2 qualifying priors matched per CE-3.0 rules (10.4 only)
  matchingDataElements: number;      // 0..5 CE-3.0 elements matched (device_id/ip/email/shipping/login)
  priorUndisputedTransactions: number;
  hasDeliveryProof: boolean;
  hasAvsMatch: boolean;
  hasCvvMatch: boolean;
  has3dsAuthenticated: boolean;      // 3DS/SCA authenticated -> liability shift
  hasSignedMandate: boolean;         // AP2 signed cart/mandate present
  hasCustomerCommunication: boolean;
}

export interface WinScore {
  reasonCode: string;                // echoes input, normalized (e.g. "10.4")
  probability: number;               // 0..1, rounded to 4 dp, fully deterministic
  band: WinBand;                     // low <0.34, moderate <0.67, else high
  topMissingEvidence: string[];      // factor names, ordered by weight desc for this reason code
  recommendedAction: RecommendedAction;
  rationale: string[];               // present factors that contributed, ordered by weight desc
  modelVersion: string;              // === WIN_PROB_MODEL_VERSION
}

/** Documented, exported coefficient table keyed by reason-code family. All weights >= 0. */
export interface ReasonCodeModel {
  intercept: number;                 // negative baseline log-odds
  weights: Record<keyof EvidenceState, number>; // >= 0 each; count fields weighted per-unit with a documented cap
}
export const WIN_PROB_COEFFICIENTS: Record<string, ReasonCodeModel>; // "10.4","10.3","10.2","10.1","13.x","12.x","default"

export function scoreWinProbability(reasonCode: string, evidence: Partial<EvidenceState>): WinScore;

// apps/api/src/mcp-server.ts (new dispatch, mirrors runPreparePurchasing metering)
export function runScoreDisputeWin(args: unknown, req: IncomingMessage): Promise<string>; // JSON.stringify(WinScore); validates reasonCode:string + evidence object; metered/paid like prepare_agentic_purchasing
```

## Acceptance tests (DONE == claim true)
- dispute-win.test.ts: DETERMINISM -- scoreWinProbability("10.4", full) deep-equals a second call; probability is a fixed literal (toBeCloseTo(x,4)).
- dispute-win.test.ts: MONOTONICITY -- for every reason code and every boolean factor, flipping that factor false->true yields probability2 >= probability1 (never decreases); same for incrementing matchingDataElements 0..5 and priorUndisputedTransactions.
- dispute-win.test.ts: PER-REASON-CODE OPTIMIZATION -- for 10.4, ce3Eligible=true raises probability more than for 13.x (CE-3.0 is 10.4-scoped); for 13.x, hasDeliveryProof is the top weight; has3dsAuthenticated pushes 10.x fraud codes to band 'high'.
- dispute-win.test.ts: ACTIONS -- probability>=0.67 => 'represent'; probability<0.34 AND topMissingEvidence.length===0 => 'accept'; else 'gather'. topMissingEvidence excludes present factors and is ordered by that reason code's weights desc.
- dispute-win.test.ts: HONESTY -- every WinScore.modelVersion === 'win-prob-v0'; probability within [0,1]; unknown reasonCode falls back to WIN_PROB_COEFFICIENTS.default without throwing.
- generators-agentic-purchasing.test.ts:1062-1071 (rewritten): commerce.dispute_win_probability DEFINED with .probability (number in [0,1]), .recommendedAction, .modelVersion==='win-prob-v0'; ce3_* evidence-requirement assertions still pass.
- generators-agentic-purchasing.test.ts:1082-1090 (rewritten): dr.win_probability_model DEFINED with .modelVersion and .probability; dr.represent_vs_refund no longer contains 'does not publish win-rate estimates' but still contains "operator's dispute policy".
- generators-agentic-purchasing.test.ts:1016-1022 (rewritten): playbook content toContain('Win-Probability Scoring').
- generators-agentic-purchasing.test.ts:1037-1042 (rewritten): negotiation rules content toContain('AUTO-REPRESENT') for the represent path.
- grep of generators-agentic-purchasing.ts finds ZERO occurrences of 'does not publish win-rate estimates'.
- budget-probe.test.ts:487-500 (rewritten): kit includes .some(s => s.includes('Win probability')) === true; methodology_note still contains 'not a certification'; NO 'Visa-grade' string added.
- counts-consistency.test.ts passes with MCP_TOOL_COUNT===30===live MCP_TOOLS length; mcp-server.test.ts count assertions bumped 29->30; prepare-purchasing.test.ts MCP_TOOLS length assertion updated.
- mcp-server.test.ts: tools/call name 'score_dispute_win' with {reasonCode,evidence} returns JSON parseable to a WinScore; tool gated behind auth/metering exactly like prepare_agentic_purchasing.
- Full suite green: npm test / pnpm -w test and build under TypeScript strict mode, no new runtime dependency added.

## External gates (code alone can't satisfy)
_none_

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes CLAUDE.md / visa_compliance_kit claim "win probability model with per-reason-code dispute optimization" literally true: a real scoreWinProbability engine with documented per-reason-code coefficients is surfaced in product-schema, commerce-registry, playbook, negotiation-rules, and a metered score_dispute_win MCP tool. Residual honesty caveat that MUST remain in every surfaced block and the COMPLIANCE_KIT_BUILD_SPEC.md honesty ledger (L134): the model is a transparent v0 HEURISTIC with hand-set coefficients, NOT empirically calibrated to real Visa dispute outcomes and NOT a Visa/network figure; it is retrainable (modelVersion) once real represented-outcome data exists. Do not add 'Visa-grade'/certification/accuracy language. Keep the 'follow your operator's dispute policy' guidance alongside the score.
