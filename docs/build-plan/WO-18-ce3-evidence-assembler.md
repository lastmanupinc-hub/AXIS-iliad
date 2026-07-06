# WO-18 · ce3-evidence-assembler  _(Phase 2 — compliance engines; recovered spec)_

**Claim it makes true:** visa_compliance_kit: "Compelling Evidence 3.0 auto-assembly."

**Tier:** A_pure_software · **Effort:** M · **Package:** NEW `@axis/agentic-compliance`

**Verify note:** hand-authored (workflow design stage hit the schema-retry cap). Grounded against the code below. Like the sibling compliance WOs, it `fully_closes` only the *assembly* half — actual submission to VROL stays gated on WO-08 (dispute-lifecycle).

## Current state (grounded)
`buildCompellingEvidence3Section(signals)` (`packages/generator-core/src/generators-agentic-purchasing.ts:201-258`) emits only a **static markdown template** + a JSON skeleton with placeholder `<...>` fields. It takes `CommerceSignals` (a repo keyword scan, `:23-34`) — **not** a dispute or transaction history. There is no `assembleCe3`, no matching logic, no eligibility verdict. The CE-3.0 **rule constants already exist** and must be reused (not reinvented): `min_prior_transactions:2`, `min_prior_transaction_age_days:120`, `lookback_days:365`, `min_matching_data_elements:2`, `qualified_data_elements:["device_id","ip_address","email","shipping_address","login_id"]`, and `target_reason_codes:["10.4"]` (hardcoded at `generateProductSchema:756` + `generateCommerceRegistry:1234`).

## Target state (== the claim is literally true)
A pure, deterministic `assembleCe3(dispute, txHistory)` that filters `txHistory` to **undisputed** transactions in the **120–365 day** window, counts shared **qualified data elements** per prior (>=2), requires **>=2** qualifying priors, and returns a structured CE-3.0 evidence packet + an `eligible` verdict with the matched element set (or a rejection reason). It is scoped to reason code **10.4 only** (never 10.2/10.3 — the code comments say those are card-present, out of scope), preserving the estate's existing honest restriction.

## Files to create / edit
- `packages/agentic-compliance/src/ce3.ts` (new)
- `packages/agentic-compliance/src/ce3.test.ts` (new)
- `packages/agentic-compliance/src/ce3-constants.ts` (new — export the CE-3.0 constants; then `generators-agentic-purchasing.ts` imports them instead of hardcoding, keeping one source of truth)
- (optional, if exposed as a tool) `apps/api/src/mcp-tools.ts` + `mcp-server.ts` + `mcp-tool-impls.ts`: register `assemble_ce3_evidence` (metered via mppx) — coordinate with WO-13.

## Interfaces
```ts
// packages/agentic-compliance/src/ce3.ts
export interface Txn {
  id: string;
  amount_minor: number;
  currency: string;
  created_at: string;         // ISO
  disputed: boolean;
  device_id?: string; ip_address?: string; email?: string;
  shipping_address?: string; login_id?: string;
}
export interface DisputeCtx { txn: Txn; reason_code: string; disputed_at: string; }
export interface Ce3Prior { txn_id: string; matched_elements: string[]; age_days: number; }
export interface Ce3Result {
  eligible: boolean;
  reason_code: "10.4";
  qualifying_priors: Ce3Prior[];   // the >=2 chosen, most-matching first, deterministic
  matched_element_union: string[];
  rejection_reason?: string;       // set iff !eligible (e.g. "only 1 prior in window", "reason_code not 10.4")
  evidence_packet: Record<string, unknown>;  // the structured submission-ready packet
  caveat: string;                  // fixed: "assembly only; not a submission to VROL/Verifi"
}
export function assembleCe3(dispute: DisputeCtx, txHistory: Txn[]): Ce3Result;
```

## Acceptance tests (DONE == claim true)
- Qualifying history (>=2 undisputed priors, each sharing >=2 qualified elements, within 120–365d) -> `eligible=true`, exactly the top-2+ priors returned, `matched_element_union` correct.
- Non-qualifying (only 1 prior, or priors <120d/>365d, or <2 shared elements) -> `eligible=false` with a specific `rejection_reason`; **no** false-positive.
- `reason_code !== "10.4"` -> `eligible=false, rejection_reason="CE3.0 applies to 10.4 only"`.
- Deterministic: same inputs -> byte-identical `Ce3Result` (stable prior ordering).
- The CE-3.0 constants imported here match the ones previously hardcoded in `generators-agentic-purchasing.ts` (a drift-guard test asserts equality).

## External gates
- _none for assembly._ (Submission to Visa VROL / Verifi is WO-08.)

## New runtime deps
- _none_ (pure TS, deterministic).

## Depends on
- (soft) WO-13 commerce-engines-as-mcp-tools — only if exposing `assemble_ce3_evidence` as a metered MCP tool.

## Doc impact / residual honesty caveat
Makes "Compelling Evidence 3.0 auto-assembly" **true as a real assembler**. Residual (must stay in the doc): it *assembles* a CE-3.0 packet and judges eligibility; it does **not** submit to the network (that is dispute-lifecycle, WO-08), and it is 10.4-only.
