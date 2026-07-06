# WO-02 · inband-phase2

**Claim it makes true:** In-band settlement across the paid tool surface (not just 3 tools).

**Tier:** A_pure_software · **Effort:** M · **Package:** apps/api (@axis/api)

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** Test-harness details for the real-dispatch proof (mock resolveAuth + search store; temp GGUF file; ensure default llm model path absent) and the resolveAgentMode import in mcp-server.ts. The core decideInbandGate function and its wiring need no further design.
**Spec overclaims flagged:** The 'No-double-charge, real dispatch' acceptance test claims to prove settled-honoring by calling the REAL runWebSearch, but runWebSearch's resolveAuth(fakeReq) returns no account and throws before authorize -- the test as written cannot prove what it claims without additional un-specified mocking of resolveAuth + the search store; Wiring note says only decideInbandGate needs importing into mcp-server.ts; it silently also requires a resolveAgentMode import there; 'in-band settlement across the paid tool surface' covers 13 of 17 metered tools -- 4 (document_parsing, code_sandbox, speech_to_text, text_to_speech) remain plan-credit-only; the quoted doc claim's honesty depends entirely on a residual caveat that the claim string itself does not contain; 'becomes literally true' conflates code-capability truth with operational truth: the flag is OFF by default and the live path is Stripe-gated, so on the actual deployment nothing settles in-band until an operator enables both
**Hidden external gates:** AXIS_MCP_INBAND_SETTLEMENT feature flag defaults OFF -- with it off, NO tool settles in-band (same as Phase-1); the claim is a code-capability, not active-on-prod behavior; LIVE cash collection requires STRIPE_SECRET_KEY / mppx configured on the payment rail; settleOverageCash returns null and falls back to plan-credit metering when unconfigured; Per-tool provisioning env (R2_*, OPENAI_API_KEY, RESEND_*, FIRECRAWL_API_KEY, AXIS_LLM_MODEL_PATH+present GGUF) must be set per-instance for the config-gated tools to actually reach settle:true at runtime

## Current state
In-band cash settlement is hard-scoped to exactly 3 tools. The gate `settleMcpCallInband` (apps/api/src/mcp-server.ts:400-428) short-circuits at :411 on `INBAND_METERED_TOOLS` = {analyze_files, analyze_repo, prepare_agentic_purchasing} (mcp-server.ts:384-388), called pre-dispatch at :490. Everything downstream is ALREADY tool-agnostic and needs zero change: the WeakSet marker markInbandSettled/isInbandSettled (mcp-runtime.ts:151-157), authorizeMcpToolCredits honoring `settled` for ANY tool (mcp-runtime.ts:197-199), captureMcpToolCredits skipping the debit when settled (:225), previewMcpToolOverage (:164-174), and the shared cash tail settleOverageCash (cashier.ts:28). All 14 iliad_* runX already route through authorize/capture. The ONLY wall is the gate's 3-tool Set. The blocker to widening it: the gate must know, before dispatch, whether a call will actually meter -- because a tool that returns a free op (iliad_web_search op=index; iliad_hygiene mode=scan) or a `_not_configured` envelope (object_storage w/o R2, embeddings w/o OPENAI_API_KEY, llm w/o GGUF, web_research w/o Firecrawl, email w/o RESEND) never reaches authorize, so blindly pre-charging it would take cash for a non-result. Correcting the gap's CLAIM: price is per-tool, not per-op -- getPricingTier(tool) keys on tool name only (mpp index.ts:310-313); the operation arg decides billability (whether authorize is reached), never the amount.

## Target state (== the claim is literally true)
A single pure decision function `decideInbandGate(tool, args, mode)` replaces the 3-tool Set as the gate's scope authority. It returns settle:true ONLY when the call is guaranteed to reach an authorize/capture point -- knowable from (args, mode, stable env-config) WITHOUT running the tool -- and settle:false otherwise (free op, unprovisioned backend, or runtime-probe metering). Wiring it into settleMcpCallInband extends in-band cash settlement from 3 to 13 of the 17 metered tools: the 3 Phase-1 tools + iliad_object_storage, iliad_vector_database, iliad_analytics, iliad_embeddings, iliad_transactional_email, iliad_llm_inference, iliad_web_search (per-op: only operation=search), iliad_hygiene (per-mode: only fix/engineer), iliad_web_research, iliad_web_research_crawl. Config-gated tools return not_provisioned (settle:false) by consulting the SAME env helpers their runX uses (readR2ConfigFromEnv, readEmbeddingsConfigFromEnv, readEmailConfigFromEnv, isLlmConfigured, isFirecrawlConfigured), so an unconfigured instance is never pre-charged for a _not_configured envelope. Per-op/per-mode tools gate on args.operation / args.mode+engineer so a free op is never settled. The claim "in-band settlement across the paid tool surface (not just 3 tools)" becomes literally true, with the operation arg correctly deciding billability (not price).

## Files to create / edit
- apps/api/src/mcp-tool-impls.ts
- apps/api/src/mcp-server.ts
- apps/api/src/mcp-inband-settlement.test.ts

## Interfaces
```ts
// NEW -- apps/api/src/mcp-tool-impls.ts (exported; co-located with runX + config helpers to prevent drift)
import type { AgentMode } from "./mpp.js";
import type { MeteredMcpTool } from "./mcp-runtime.js";

export type InbandGateDecision =
  | { settle: true; tool: MeteredMcpTool }
  | { settle: false; reason: "free_op" | "not_provisioned" | "runtime_metered" | "not_in_scope" };

/**
 * Decide whether the MCP POST gate may PRE-SETTLE a tool call's cash overage.
 * settle:true iff the call is guaranteed to reach an authorize/capture point
 * (billable op + provisioned backend), decidable from (args, mode, env-config)
 * WITHOUT running the tool. Async only for isLlmConfigured()'s fs probe.
 *   free_op          -> a non-billable operation/mode (web_search!=search, hygiene scan, invalid op)
 *   not_provisioned  -> backend env absent; runX would return _not_configured w/o charging
 *   runtime_metered  -> billability decided only by a post-run probe (see residual caveat)
 *   not_in_scope     -> free/discovery tool or unknown name
 */
export async function decideInbandGate(
  tool: string,
  args: Record<string, unknown>,
  mode: AgentMode,
): Promise<InbandGateDecision>;

// EDIT -- apps/api/src/mcp-server.ts: delete INBAND_METERED_TOOLS (384-388); in settleMcpCallInband
// replace the name-normalize + Set.has gate (410-411) with:
//   const decision = await decideInbandGate(
//     normalizeToolName(rawName),
//     (p?.arguments as Record<string, unknown>) ?? {},
//     resolveAgentMode(req),
//   );
//   if (!decision.settle) return false;   // free / not_provisioned / runtime / out-of-scope -> dispatch handles normally
//   const tool = decision.tool;
// (rest of the function -- resolveAuth, previewMcpToolOverage(req, account, tool), settleOverageCash, markInbandSettled -- is UNCHANGED)
// Import decideInbandGate from "./mcp-tool-impls.js" (mcp-server already imports runX from there, line 74).
```

## Acceptance tests (DONE == claim true)
- Per-op headline: `decideInbandGate("iliad_web_search",{operation:"search",query:"x"},"standard")` resolves `{settle:true,tool:"iliad_web_search"}`; `{operation:"index",document:{}}` resolves `{settle:false,reason:"free_op"}`; `{operation:"count"}` and `{operation:"delete",doc_id:"d"}` also resolve free_op.
- Per-mode: hygiene `{mode:"scan"}`+standard -> free_op; `{mode:"fix"}`+standard -> settle:true; `{}`+engineer -> settle:true (engineer forces fix).
- Config gate (env-driven): with the backend env UNSET each of iliad_object_storage / iliad_embeddings / iliad_web_research / iliad_web_research_crawl / iliad_llm_inference resolves `{settle:false,reason:"not_provisioned"}` for an otherwise-billable arg set; with the env SET (R2_*, OPENAI_API_KEY, FIRECRAWL/env, AXIS_LLM_MODEL_PATH pointing at a present file) the same call resolves settle:true. iliad_transactional_email: `{to,subject}`+standard is not_provisioned w/o RESEND_* but settle:true with RESEND_*; `{domain:"x.com"}`+engineer is settle:true even w/o RESEND_* (pure-generation Deliverability path).
- Always-billable local tools: iliad_vector_database `{operation:"upsert",vectors:[...]}` and `{operation:"query",query:{}}`, and iliad_analytics `{operation:"capture",event:{}}` and `{operation:"query",query:{kind:"count"}}` all resolve settle:true regardless of env; an invalid operation resolves free_op.
- Phase-1 regression: analyze_files, analyze_repo, prepare_agentic_purchasing each resolve settle:true (in-band behavior for the original 3 is preserved).
- Excluded set: iliad_document_parsing, iliad_code_sandbox, iliad_speech_to_text, iliad_text_to_speech each resolve `{settle:false,reason:"runtime_metered"}`.
- Out of scope: a free/discovery name (e.g. "list_programs") and an unknown name resolve `{settle:false,reason:"not_in_scope"}`.
- Total-classification invariant: iterate the full MeteredMcpTool union (17 names from mcp-runtime.ts:110-127) through a representative billable-arg fixture map; assert exactly 13 yield settle:true and the other 4 yield reason:"runtime_metered" -- union(covered)∪union(runtime)==all 17, proving no metered tool silently falls through, and asserting the count is 13 (not 3).
- No-double-charge, real dispatch (headline proof): mock @axis/snapshots previewUsageCredits->overage and spy consumeUsageCredits; call the REAL runWebSearch with a req passed through markInbandSettled and `{operation:"search",query:"x"}` -> consumeUsageCredits NOT called (settled charge honored) and no throw; same req with `{operation:"index",document:{...}}` -> authorize never reached, consumeUsageCredits NOT called, no throw (index is free regardless of settled marker).
- Source guard: `INBAND_METERED_TOOLS` has zero remaining references in apps/api/src (grep clean) -- decideInbandGate is the sole gate-scope authority.
- Build+test green: `pnpm --filter @axis/api build` (tsc strict, no `any` on the new function) passes and `pnpm test` runs the extended apps/api/src/mcp-inband-settlement.test.ts fully green.

## External gates (code alone can't satisfy)
- None to make the claim code-true (the gate + tests mock/degrade the payment rail). The LIVE cash path -- actually collecting the overage -- requires STRIPE_SECRET_KEY/mppx and the AXIS_MCP_INBAND_SETTLEMENT flag ON, exactly as already true for the Phase-1 3-tool path; settleOverageCash returns null and the gate falls back to plan-credit metering when unconfigured, so no new external dependency is introduced.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes 'in-band settlement across the paid tool surface (not just 3 tools)' literally true for 13 of 17 metered tools (3->13). REQUIRED residual honesty caveats that must stay in any doc: (1) 4 tools -- iliad_document_parsing, iliad_code_sandbox, iliad_speech_to_text, iliad_text_to_speech -- are NOT covered by in-band cash and continue to meter via plan credits post-run, because their metering decision is a post-run runtime probe (unreachable URL / unsupported mime / docker daemon / piper / whisper availability) not knowable at the pre-dispatch gate; safely adding them needs either a refund primitive on the payment rail (external/Stripe-gated) or threading the ServerResponse through 14 runX signatures (rejected -- it defeats the WeakSet design). (2) Correct the CLAIM wording: the operation arg decides BILLABILITY, not price -- pricing is per-tool (getPricingTier keys on tool name). (3) Pre-existing, not introduced by this WO: like the Phase-1 gate, decideInbandGate gates at config+operation granularity and does not replicate deep arg-shape validation, so a malformed-args call to a configured/billable tool can still be settled-then-error (same property the 3 Phase-1 tools already have).
