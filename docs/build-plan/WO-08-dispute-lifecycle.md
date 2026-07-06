# WO-08 · dispute-lifecycle

**Claim it makes true:** visa_compliance_kit: "Visa VROL/RDR/CDRN dispute lifecycle".

**Tier:** B_client_external_gated · **Effort:** L · **Package:** packages/compliance (new `@axis/compliance` workspace pkg) + apps/api + packages/snapshots

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`medium`
**Missing for codeability:** Two required files are omitted from the files list for the metering the spec itself demands: (a) apps/api/src/mcp-runtime.ts must extend the MeteredMcpTool string-union or INBAND_METERED_TOOLS (Set<MeteredMcpTool>, strict mode) won't compile with 'assemble_representment'; (b) packages/mpp/src/index.ts PRICING_TIERS for a non-default price (getPricingTier falls back to default 50c, so not fatal). Two genuine design decisions are left open: the actual DISPUTE_TRANSITIONS edge graph (only states+events given; the acceptance test is self-referential so it pins nothing), and the Ce3Result structural shape (WO-C2 confirmed unbuilt, so the agent must invent it and accept swap/integration risk on merge). None block a capable agent, but they are further design/discovery, not turn-key.
**Spec overclaims flagged:** files[] omits mcp-runtime.ts (MeteredMcpTool union) and packages/mpp/src/index.ts (PRICING_TIERS) yet acceptance requires the tool be metered like iliad_llm_inference; the metering surface is understated; acceptance says metered through the existing 402/charge path but the in-band 402 gate (settleMcpCallInband) is flag-gated default OFF; default metering is plan-credit dispatch, not 402; 'a real dispute state machine': the spec never specifies transition edges and its own table-driven test is tautological (asserts DISPUTE_TRANSITIONS maps to itself), so correctness is unverified; 'VerifiEthocaDisputeClient ships as real code' overstates a gated stub that returns configured:false and throws NotImplemented on live submit; doc_impact implies the claim becomes honestly true only after REWRITING the manifest string; the literal 'VROL/RDR/CDRN dispute lifecycle' is not made true, so it closes only as a weaker split; 'dispatch switch (L356-373)' mischaracterizes the webhook if/else chain; minor imprecision though seams verify
**Hidden external gates:** radar.early_fraud_warning.created may require Stripe Radar enablement, not merely subscribing to the event; spec treats it as pure configuration; exercising the live Stripe dispute/representment path needs a live-mode Stripe account with actual disputes; unit fixtures cover tests but not real operation; Verifi/Ethoca acquirer provisioning and STRIPE_WEBHOOK_SECRET + event subscription are correctly disclosed by the spec

## Current state
No dispute lifecycle exists in code -- only descriptive strings. Verified: (1) `packages/mpp/src/index.ts:435` marketing bullet "VROL/RDR/CDRN pre-dispute deflection paths"; (2) `apps/api/src/handlers.ts:2254` capability keyword list `"TAP","VROL","CDRN","RDR"`; (3) `packages/generator-core/src/generators-agentic-purchasing.ts:200-296` GENERATES a CE-3.0 evidence template + dispute checklist into output markdown, but has no runtime engine. No `@axis/compliance` package, no dispute client, no state machine, no representment (glob `packages/compliance/**` + `**/*{dispute,ce3,representment}*.ts` -> zero hits). `apps/api/src/stripe.ts` has a working webhook seam: `verifyStripeSignature` (L85-113), `HANDLED_EVENTS` set (L117-123, currently only checkout/subscription/invoice), dispatch switch (L356-373), and Stripe REST via `fetch("https://api.stripe.com/v1/...")` (L462, L595). Persistence+telemetry come from `@axis/snapshots` (`upsertSubscription`/`getSubscription`/`logTierChange`/`trackEvent`, imported at stripe.ts:11-24; store at `packages/snapshots/src/stripe-store.ts`, re-exported via `index.ts`). MCP catalog is data in `apps/api/src/mcp-tools.ts` (`MCP_TOOLS`), count pinned at `apps/api/src/counts.ts` `MCP_TOOL_COUNT = 29`, asserted live by `counts-consistency.test.ts`. Target already specced verbatim as WO-C7 in `COMPLIANCE_KIT_BUILD_SPEC.md:108-116`; nothing built.

## Target state (== the claim is literally true)
A real dispute lifecycle: (1) a rail-agnostic dispute state machine, (2) Stripe dispute + early-fraud-warning webhook handlers persisting `DisputeRecord`s, (3) a representment assembler that turns a CE-3.0 packet (from WO-C2 `assembleCe3`) into Stripe dispute-evidence and submits it via the Stripe disputes API, and (4) a `StripeDisputeClient` (live) plus a `VerifiEthocaDisputeClient` (VROL/RDR/CDRN) that ships as real code but returns `{ configured:false }` unless `AXIS_ENABLE_VROL=1` and acquirer creds exist. Exposed as a metered MCP tool. After this WO the claim "Visa VROL/RDR/CDRN dispute lifecycle" is honestly true as a split: dispute lifecycle is LIVE on the Stripe rail (Visa disputes flow through Stripe today) feeding CE-3.0 representments, and the VROL/RDR/CDRN rail is integration-ready code gated behind a documented flag/acquirer contract -- with docs stating exactly that split (no claim of live raw Verifi/Ethoca operation).

## Files to create / edit
- packages/compliance/package.json
- packages/compliance/tsconfig.json
- packages/compliance/src/index.ts
- packages/compliance/src/types.ts
- packages/compliance/src/dispute-state-machine.ts
- packages/compliance/src/dispute-state-machine.test.ts
- packages/compliance/src/representment.ts
- packages/compliance/src/representment.test.ts
- packages/compliance/src/dispute-clients.ts
- packages/compliance/src/dispute-clients.test.ts
- packages/snapshots/src/dispute-store.ts
- packages/snapshots/src/dispute-store.test.ts
- packages/snapshots/src/index.ts
- apps/api/src/stripe.ts
- apps/api/src/disputes.ts
- apps/api/src/disputes.test.ts
- apps/api/src/mcp-tools.ts
- apps/api/src/mcp-server.ts
- apps/api/src/counts.ts
- apps/api/package.json
- COMPLIANCE_KIT_BUILD_SPEC.md

## Interfaces
```ts
```ts
// packages/compliance/src/types.ts
export type DisputeRail = "stripe" | "vrol" | "rdr" | "cdrn";
export type DisputeState =
  | "needs_response" | "evidence_assembling" | "evidence_submitted"
  | "under_review" | "won" | "lost" | "accepted" | "warning_closed";
export type DisputeEvent =
  | "dispute_opened" | "evidence_ready" | "evidence_submitted"
  | "provider_won" | "provider_lost" | "operator_accepted" | "warning_closed";
export interface DisputeRecord {
  id: string;                 // provider dispute id, e.g. Stripe "dp_..."
  rail: DisputeRail;
  chargeId: string | null;
  accountId: string | null;
  reasonCode: string;         // network reason code, e.g. "10.4"
  amountMinor: number; currency: string;
  state: DisputeState;
  dueBy: string | null;       // ISO deadline
  createdAt: string; updatedAt: string;
  representmentId: string | null;
}
export interface DisputeTransition { from: DisputeState; to: DisputeState; at: string; event: DisputeEvent; }

// dispute-state-machine.ts -- pure transition table; throws on an illegal edge.
export class DisputeTransitionError extends Error {}
export function nextDisputeState(current: DisputeState, event: DisputeEvent): DisputeState;
export function isTerminal(state: DisputeState): boolean; // won|lost|accepted|warning_closed
export const DISPUTE_TRANSITIONS: Readonly<Record<DisputeState, Partial<Record<DisputeEvent, DisputeState>>>>;

// representment.ts -- Ce3Result from WO-C2; if C2 unbuilt, define minimal structural
// interface locally and swap the import on merge.
import type { Ce3Result } from "./ce3.js";
export interface EvidenceInputs {
  customerEmail?: string; shippingAddress?: string; billingAddress?: string;
  serviceDate?: string; productDescription?: string; deliveryTracking?: string;
  threeDsAuthenticated?: boolean;
}
export interface StripeRepresentmentEvidence {
  uncategorized_text?: string; customer_email_address?: string;
  shipping_address?: string; billing_address?: string;
  product_description?: string; service_date?: string;
  shipping_tracking_number?: string; customer_purchase_ip?: string;
}
export function buildStripeRepresentment(
  dispute: DisputeRecord, ce3: Ce3Result, extras: EvidenceInputs): StripeRepresentmentEvidence;

// dispute-clients.ts
export interface DisputeClient {
  rail: DisputeRail;
  fetchDispute(disputeId: string): Promise<DisputeRecord>;
  submitEvidence(disputeId: string, evidence: StripeRepresentmentEvidence, submit: boolean)
    : Promise<{ ok: boolean; state: DisputeState }>;
}
export interface NotConfigured { configured: false; rail: DisputeRail; reason: string; }
export function makeStripeDisputeClient(deps: { apiKey: string; fetchImpl?: typeof fetch }): DisputeClient;
export function makeVerifiEthocaDisputeClient(env: NodeJS.ProcessEnv): DisputeClient | NotConfigured;

// packages/snapshots/src/dispute-store.ts (mirrors stripe-store.ts)
export async function upsertDispute(rec: DisputeRecord): Promise<void>;
export async function getDispute(id: string): Promise<DisputeRecord | null>;
export async function listDisputesByAccount(accountId: string): Promise<DisputeRecord[]>;
export async function logDisputeTransition(id: string, t: DisputeTransition): Promise<void>;

// apps/api/src/stripe.ts (additive):
//   HANDLED_EVENTS += "charge.dispute.created","charge.dispute.updated",
//     "charge.dispute.closed","radar.early_fraud_warning.created"
//   dispatch switch += branches -> these (reuse verifyStripeSignature + trackEvent):
async function handleDisputeCreated(obj: any): Promise<void>;    // upsertDispute(state:"needs_response")
async function handleDisputeUpdated(obj: any): Promise<void>;    // nextDisputeState + logDisputeTransition
async function handleDisputeClosed(obj: any): Promise<void>;     // status->won|lost|warning_closed
async function handleEarlyFraudWarning(obj: any): Promise<void>; // pre-dispute EFW + trackEvent

// apps/api/src/disputes.ts (MCP tool handler, metered like iliad_llm_inference)
export async function handleAssembleRepresentment(args: {
  dispute_id: string; evidence_inputs?: EvidenceInputs;
}): Promise<{ dispute: DisputeRecord; evidence: StripeRepresentmentEvidence; ce3_eligible: boolean; submitted: boolean }>;
```
```

## Acceptance tests (DONE == claim true)
- dispute-state-machine.test.ts: table-driven test asserts every entry in DISPUTE_TRANSITIONS yields the mapped target via nextDisputeState, every illegal (state,event) pair throws DisputeTransitionError, and nextDisputeState is deterministic. isTerminal true for exactly {won,lost,accepted,warning_closed}.
- representment.test.ts: given a qualifying Ce3Result (>=2 matched elements, eligible:true) buildStripeRepresentment returns an object whose uncategorized_text names the prior undisputed transactions and whose customer_email_address/shipping_address/product_description come from EvidenceInputs; a non-eligible Ce3Result still returns evidence with uncategorized_text recording that no CE-3.0 priors qualified (no crash, deterministic).
- dispute-clients.test.ts: with a mocked fetchImpl, StripeDisputeClient.submitEvidence('dp_x', ev, true) issues exactly one POST to https://api.stripe.com/v1/disputes/dp_x with a form-encoded body containing submit=true and evidence[customer_email_address]=..., plus an Authorization: Bearer header. makeVerifiEthocaDisputeClient({}) returns {configured:false,rail:'vrol'} and makes NO network call; with AXIS_ENABLE_VROL=1 + VERIFI_* creds it returns a DisputeClient (may throw NotImplemented on live submit but never silently fakes a submission).
- disputes.test.ts: POST a Stripe-signed 'charge.dispute.created' fixture to the webhook route (valid signature via verifyStripeSignature) => getDispute(dp_id) returns state 'needs_response' with dueBy from evidence_details.due_by; a signed 'radar.early_fraud_warning.created' fixture calls trackEvent with the EFW type; a 'charge.dispute.closed' status:'won' fixture drives getDispute state to 'won'.
- disputes.test.ts: handleAssembleRepresentment({dispute_id}) returns {dispute, evidence, ce3_eligible, submitted}; when auto-submit is enabled the mocked Stripe client receives the built evidence; the MCP tool is metered through the existing 402/charge path.
- counts-consistency.test.ts passes after MCP_TOOL_COUNT is bumped 29->30 and 'assemble_representment' is added to MCP_TOOLS in mcp-tools.ts (MCP_TOOL_COUNT === MCP_TOOLS.length).
- npm run build (tsc strict; no new class components) and npm test are green; grep confirms no new entry under "dependencies" in any package.json (only the workspace @axis/compliance link + node:crypto/global fetch).

## External gates (code alone can't satisfy)
- Stripe rail (live now): requires STRIPE_WEBHOOK_SECRET and subscribing charge.dispute.*/radar.early_fraud_warning.created events in the Stripe dashboard -- configuration, not code.
- VROL/RDR (Verifi) + CDRN (Ethoca): require the acquirer/PSP to provision access + credentials -- a business contract, not buildable by code. Ships behind AXIS_ENABLE_VROL and refuses to act (configured:false) until creds land.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
- WO-C2 (assembleCe3 / Ce3Result -- the CE-3.0 packet the representment consumes; if unbuilt, define the minimal Ce3Result structural interface locally and swap the import on merge)

## Doc impact / residual honesty caveat
Makes CLAUDE.md's `visa_compliance_kit.dispute_lifecycle: \"VROL+RDR+CDRN\"` and COMPLIANCE_KIT_BUILD_SPEC.md WO-C7 honestly true -- but ONLY as a split: dispute lifecycle LIVE on the Stripe rail (feeding CE-3.0 representments); VROL/RDR/CDRN integration-ready behind AXIS_ENABLE_VROL. REQUIRED honesty edit to the manifest/marketing string: read it as \"dispute lifecycle live via Stripe; VROL/RDR/CDRN integration-ready, gated on acquirer (Verifi/Ethoca) access\" -- do NOT let it imply live raw VROL/RDR/CDRN operation. Residual caveat that must stay: the raw Verifi/Ethoca clients are code-complete but non-operational without acquirer provisioning, and the CE-3.0 assembly they feed makes no guarantee about issuer outcomes (keep the generator's existing 'AXIS does not publish win-rate estimates' line intact).
