import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody } from "./router.js";
import { resolveAuth } from "./billing.js";
import { settleOverageCash } from "./cashier.js";
import { getClientIp } from "./rate-limiter.js";
import { anonProvisionEnabled, allowChallenge, buildProvisioningChallenge } from "./anon-frontdoor.js";
import { compensateAndSummarize } from "./compensator.js";
import { log, shouldEmitRuntimeLogs } from "./logger.js";
import {
  getPersistenceBalance,
  getUsageCreditSummary,
  recordMcpUsage,
  recordCompensationOwed,
  recordPaymentFunnelEvent,
} from "@axis/snapshots";
import { ARTIFACT_COUNT, PROGRAM_COUNT, API_VERSION } from "./counts.js";
import { classifyProbe, captureIntent, detectMcpSource } from "./intent.js";
// MCP tool catalog + planned-capability machinery live in mcp-tools.ts; MCP_TOOLS is
// re-exported so importers of mcp-server keep working.
import { MCP_TOOLS, PLANNED_CAPABILITIES, PLANNED_CAPABILITY_NAMES } from "./mcp-tools.js";
export { MCP_TOOLS };
import {
  REGISTRY_DISPLAY_NAME,
  SERVER_SLUG,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_PARAMS,
  RPC_INTERNAL_ERROR,
  rpcOk,
  rpcErr,
  toolOk,
  toolErr,
  categorizeError,
  readIdempotencyKey,
  hashToolRequest,
  inbandSettlementEnabled,
  previewMcpToolOverage,
  markInbandSettled,
  getInbandSettledAmount,
  gateIdempotency,
  resolveIdempotencyClaim,
  releaseIdempotencyClaim,
  METERED_MCP_TOOLS,
  type RpcSuccess,
  type RpcError,
} from "./mcp-runtime.js";
import {
  runPlannedCapability,
  runObjectStorage,
  runTransactionalEmail,
  runEmbeddings,
  runVectorDatabase,
  runAnalytics,
  runLlmInference,
  runDocumentParsingDispatch,
  runWebSearch,
  runTextToSpeech,
  runSpeechToText,
  runCodeSandbox,
  runWebResearch,
  runWebResearchCrawl,
  runPreparePurchasingPreview,
  runHygiene,
  runAnalyzeFiles,
  runAnalyzeRepo,
  runSearchTools,
  runDiscoverAgenticCommerceTools,
  runImproveMyAgent,
  runDiscoverAgenticPurchasingNeeds,
  runDiscoverEstateTools,
  runGetReferralCode,
  runCheckReferralCredits,
  runListPrograms,
  runGetSnapshot,
  runGetArtifact,
  runCloser,
  runDeploy,
  runPreparePurchasing,
  runScaExemptionDecision,
  runGradeCompliance,
  runAssembleCe3Evidence,
  runBuildAp2Mandate,
  runScoreDisputeReadiness,
  runNetworkTokenization,
  decideInbandGate,
  runPingPayment,
} from "./mcp-tool-impls.js";
import { runAssembleRepresentment } from "./disputes.js";
import { resolveAgentMode, getPricingTier } from "./mpp.js";
import { applyLiteCaps } from "./lite-caps.js";
// Re-exported for callers that import these tool entrypoints from mcp-server.
export { runSearchTools, runPreparePurchasingPreview };

export const MCP_PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "axis-iliad";
const SERVER_VERSION = API_VERSION;

interface McpCallCounters {
  total: number;
  today: number;
  todayDate: string;
  byTool: Record<string, number>;
  startedAt: string;
}

const _counters: McpCallCounters = {
  total: 0,
  today: 0,
  todayDate: new Date().toISOString().slice(0, 10),
  byTool: {},
  startedAt: new Date().toISOString(),
};


export async function logMcpCall(toolName: string, userId: string | null, ip: string, headers?: Record<string, string | string[] | undefined>): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (today !== _counters.todayDate) {
    _counters.today = 0;
    _counters.todayDate = today;
  }
  _counters.total += 1;
  _counters.today += 1;
  _counters.byTool[toolName] = (_counters.byTool[toolName] ?? 0) + 1;
  const ua = typeof headers?.["user-agent"] === "string" ? headers["user-agent"] : "unknown";
  const ref = headers?.["referer"] ?? headers?.["referrer"] ?? "none";
  const uaForDetect = ua === "unknown" ? "" : ua;
  const probeClass = classifyProbe(uaForDetect);
  captureIntent(toolName, null, uaForDetect);
  // Persist the call so totals survive restarts (in-memory _counters do not).
  // Telemetry must never break the request path, so swallow any failure.
  try {
    await recordMcpUsage({
      account_id: userId,
      tool: toolName,
      source: detectMcpSource(uaForDetect),
      probe_class: probeClass,
      user_agent: ua,
    });
  } catch {
    /* telemetry is best-effort */
  }
  if (shouldEmitRuntimeLogs()) {
    console.log(`[MCP CALL] tool=${toolName} user=${userId ?? "anonymous"} ip=${ip} probe=${probeClass} ua=${ua} ref=${ref} time=${now.toISOString()}`);
  }
}

export function getMcpCallCounters(): McpCallCounters {
  return { ..._counters, byTool: { ..._counters.byTool } };
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
}

type RpcResponse = RpcSuccess | RpcError;

const LEGACY_TOOL_ALIASES: Record<string, string> = {
  prepare_for_agentic_purchasing: "prepare_agentic_purchasing",
  discover_agentic_commerce_tools: "discover_commerce_tools",
  check_referral_credits: "get_referral_credits",
};

function normalizeToolName(toolName: string): string {
  return LEGACY_TOOL_ALIASES[toolName] ?? toolName;
}


// ─── Sibling-process delegation note ────────────────────────────
//
// Image generation (and broader visual asset creation) is deliberately
// NOT exposed as an Iliad-OWNED capability. The capability is owned at the
// AXIS platform level by the AXIS Foundry sibling process — an AI-native 3D
// resources foundry (avatars + props + vehicles + environments + VFX +
// weapons/armor + character accessories + 2D images). Foundry has its own
// MCP surface, its own CanonicalAssetContract provenance system, its own
// pricing, and its own 12.4k-test regression suite. Today, agents that need
// visual generation should call Foundry directly
// (https://github.com/lastmanupinc-hub/AXIS-Foundry) — there is still no
// iliad_image_generation tool, and there never will be one under that name
// claiming Iliad ownership of the capability.
//
// REVISED 2026-08-22 (est_02, docs/ESTATE_FEDERATION_STRATEGY.md): the OLD
// version of this note stated, as an absolute, that Iliad never mints a
// tool for a sibling-owned capability. That is no longer the platform-wide
// rule. Owner directive: sibling AXIS properties become callable through
// the Iliad MCP as ESTATE-FLAGGED proxy tools (McpToolCatalogEntry.estate)
// — a relay Iliad hosts and stays honest about, not a claim of owning the
// capability. discover_estate_tools (free, no auth) already lists every
// sibling and its own direct MCP endpoint. The FLAG, not the name, is what
// keeps a proxy visibly marked — a simple pass-through relay (est_03/04's
// Wave 1/2 stubs: axis_validate, axis_inspect, and the rest) keeps
// Foundry's OWN tool name verbatim, since it IS that call, one hop later;
// only a genuinely NEW, Iliad-wrapped product (est_04/05's
// estate_foundry_generate, which adds its own pricing tier on top of
// Foundry's) gets an "estate_"-prefixed name distinct from anything Foundry
// itself calls it. Neither shape is ever a bare "iliad_image_generation"
// tool pretending to be Iliad-owned — that specific name stays permanently
// unminted regardless of which shape a Foundry proxy eventually takes.
//
// This pattern (sibling delegation, now with an estate-proxy exception) is
// also how the broader AXIS platform composes: each process stays focused,
// each ships independently.
//
// ─── Catalog-honesty endgame ─────────────────────────────────────
//

// ─── Method dispatch ─────────────────────────────────────────────

export async function dispatch(
  method: string,
  params: unknown,
  id: string | number | null,
  req: IncomingMessage,
): Promise<RpcResponse> {
  switch (method) {
    case "initialize": {
      return rpcOk(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          `Axis' Iliad — analyze any GitHub repo or file set, get ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs. Use analyze_repo or analyze_files to start. Auth: Authorization: Bearer <api_key>. Need a capability Iliad doesn't own (payments, 3D generation)? Call discover_estate_tools (free, no auth) for sibling AXIS properties and their own MCP endpoints.`,
      });
    }

    case "notifications/initialized":
      return rpcOk(id, null);

    case "ping":
      return rpcOk(id, {});

    case "tools/list":
      // Catalog honesty (revised): every tool in MCP_TOOLS appears in
      // tools/list. Honesty means we ship what we advertise — not that we
      // redact the advertised catalog when the build lags. As each
      // remaining planned-capability stub gets an owned implementation,
      // it moves from "returns _planned envelope" to "returns real
      // result"; the visible name set stays stable.
      return rpcOk(id, { tools: MCP_TOOLS });

    case "tools/call": {
      const p = params as Record<string, unknown> | null;
      const toolName = p?.name;
      const rawToolArgs = (p?.arguments as Record<string, unknown>) ?? {};
      /* v8 ignore next — both arms tested; v8 misses the || short-circuit arm for empty-string toolName */
      if (typeof toolName !== "string" || !toolName) {
        return rpcErr(id, RPC_INVALID_PARAMS, "tools/call requires 'name' as string");
      }
      const canonicalToolName = normalizeToolName(toolName);
      const auth = await resolveAuth(req);
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
      await logMcpCall(canonicalToolName, auth.anonymous ? null : (auth.account?.account_id ?? null), ip, req.headers as Record<string, string | string[] | undefined>);

      // Anonymous front door (flag-gated, default OFF; docs/x402/STRATEGY.md's
      // PAI'D-routing design). An anonymous caller hitting a metered tool gets a
      // PROVISIONING challenge — a routing pointer to a real, reachable API key —
      // instead of today's dead-end auth error. Deliberately branches on
      // auth.anonymous, NOT !auth.account: an invalid/revoked key must still fall
      // through unchanged to the existing per-handler wall below (this door is not
      // a key-validity oracle). Adds NO anonymous settlement path anywhere —
      // settleMcpCallInband's own anonymous short-circuit is untouched — which is
      // what keeps this MTL-safe by construction (see [[paid-mtl-risk-finding]]).
      if (anonProvisionEnabled() && auth.anonymous && (METERED_MCP_TOOLS as readonly string[]).includes(canonicalToolName)) {
        if (!allowChallenge(getClientIp(req))) {
          return rpcOk(id, {
            ...toolErr("Too many provisioning requests from this network. Wait a moment and retry."),
            _error: { code: "quota", retryable: true },
          });
        }
        try {
          await recordPaymentFunnelEvent({ account_id: null, tool: canonicalToolName, kind: "challenge" });
        } catch {
          /* funnel telemetry is best-effort — must never block the challenge response */
        }
        return rpcOk(id, {
          ...toolOk(buildProvisioningChallenge(canonicalToolName, req)),
          _provision_required: true,
        });
      }

      // Lite-mode cap enforcement (revenue-leak fix): a caller paying the lite
      // price must GET lite behavior. Applied BEFORE the idempotency hash so a
      // stored/replayed result is keyed by — and reflects — the args that
      // actually ran, and BEFORE any possible charge: every charge on this
      // path happens inside the tool impls in the switch below, and the
      // in-band settlement gate (settleMcpCallInband) applies these same caps
      // and never settles a call this table rejects.
      const liteCapped = applyLiteCaps(canonicalToolName, resolveAgentMode(req), rawToolArgs);
      if (liteCapped.rejection) {
        // Mirror the pre-dispatch tool-error shape used by the idempotency
        // in-progress return below: an isError:true tool result inside a
        // JSON-RPC success envelope, never a thrown exception. Nothing has
        // been charged or claimed yet, and the Idempotency-Key (if any) stays
        // unused so a corrected retry can reuse it.
        return rpcOk(id, {
          ...toolErr(liteCapped.rejection),
          _error: { code: "validation", retryable: false },
        });
      }
      const toolArgs = liteCapped.args;

      // Idempotency: a retry carrying the same Idempotency-Key returns the
      // original result and never re-charges. Only successful results are stored
      // (a failed call doesn't charge, so it stays retryable).
      //
      // H2.6 (red-team fix, WAVE-0 finding #1, CRITICAL): gateIdempotency
      // ATOMICALLY claims the key before any charge or work — the old plain
      // read here left a window where two concurrent requests sharing one key
      // both saw "nothing yet" and both charged + ran the billable tool. If
      // the in-band settlement gate (settleMcpCallInband) already claimed this
      // request's key, this call is a no-op read of that same claim (no
      // redundant DB round-trip, and never a self-conflict).
      const idempotencyKey = readIdempotencyKey(req);
      const requestHash = idempotencyKey ? hashToolRequest(canonicalToolName, toolArgs) : "";
      if (idempotencyKey && auth.account) {
        const gate = await gateIdempotency(req, auth.account.account_id, idempotencyKey, requestHash);
        if (gate.outcome === "hash_mismatch") {
          return rpcErr(id, RPC_INVALID_PARAMS, "Idempotency-Key already used with different arguments");
        }
        if (gate.outcome === "replay") {
          return rpcOk(id, {
            ...toolOk(gate.response),
            _usage: {
              tier: auth.anonymous ? "anonymous" : (auth.account?.tier ?? "unknown"),
              credits_remaining: await getPersistenceBalance(auth.account.account_id),
              usage_credits: await getUsageCreditSummary(auth.account.account_id, auth.account.tier),
              // H2.4: lazy compensator — claims + grants any owed compensation
              // for this account, then reports the running totals.
              compensation: await compensateAndSummarize(auth.account.account_id),
              tool: canonicalToolName,
            },
            _idempotent_replay: true,
          });
        }
        if (gate.outcome === "in_progress") {
          return rpcOk(id, {
            ...toolErr("This Idempotency-Key is already being processed by another in-flight request. Retry in a moment — do not change the request body."),
            _error: { code: "quota", retryable: true },
          });
        }
        // "claimed" — this request now atomically owns the key; proceed.
      }

      try {
        let text: string;
        switch (canonicalToolName) {
          case "analyze_files":
            text = await runAnalyzeFiles(toolArgs, req);
            break;
          case "analyze_repo":
            text = await runAnalyzeRepo(toolArgs, req);
            break;
          case "list_programs":
            text = runListPrograms();
            break;
          case "get_snapshot":
            text = await runGetSnapshot(toolArgs, req);
            break;
          case "get_artifact":
            text = await runGetArtifact(toolArgs, req);
            break;
          case "prepare_agentic_purchasing_preview":
            text = runPreparePurchasingPreview(toolArgs);
            break;
          case "prepare_agentic_purchasing":
            text = await runPreparePurchasing(toolArgs, req);
            break;
          case "closer":
            text = await runCloser(toolArgs, req);
            break;
          case "deploy":
            text = await runDeploy(toolArgs, req);
            break;
          case "search_and_discover_tools":
            text = runSearchTools(toolArgs);
            break;
          case "discover_commerce_tools":
            text = runDiscoverAgenticCommerceTools();
            break;
          case "ping_payment":
            text = await runPingPayment(toolArgs, req);
            break;
          case "improve_my_agent_with_axis":
            text = await runImproveMyAgent(toolArgs, req);
            break;
          case "discover_agentic_purchasing_needs":
            text = runDiscoverAgenticPurchasingNeeds(toolArgs);
            break;
          case "discover_estate_tools":
            text = runDiscoverEstateTools();
            break;
          case "get_referral_code":
            text = await runGetReferralCode(req);
            break;
          case "get_referral_credits":
            text = await runCheckReferralCredits(req);
            break;
          case "iliad_object_storage":
            text = await runObjectStorage(toolArgs, req);
            break;
          case "iliad_vector_database":
            text = await runVectorDatabase(toolArgs, req);
            break;
          case "iliad_embeddings":
            text = await runEmbeddings(toolArgs, req);
            break;
          case "iliad_transactional_email":
            text = await runTransactionalEmail(toolArgs, req);
            break;
          case "iliad_analytics":
            text = await runAnalytics(toolArgs, req);
            break;
          case "iliad_llm_inference":
            text = await runLlmInference(toolArgs, req);
            break;
          case "iliad_code_sandbox":
            text = await runCodeSandbox(toolArgs, req);
            break;
          case "iliad_speech_to_text":
            text = await runSpeechToText(toolArgs, req);
            break;
          case "iliad_text_to_speech":
            text = await runTextToSpeech(toolArgs, req);
            break;
          case "iliad_web_search":
            text = await runWebSearch(toolArgs, req);
            break;
          case "iliad_document_parsing":
            text = await runDocumentParsingDispatch(toolArgs, req);
            break;
          case "iliad_hygiene":
            text = await runHygiene(toolArgs, req);
            break;
          case "iliad_web_research":
            text = await runWebResearch(toolArgs, req);
            break;
          case "iliad_web_research_crawl":
            text = await runWebResearchCrawl(toolArgs, req);
            break;
          // Commerce engines as tools (WO-13) — free, no auth, deterministic.
          case "sca_exemption_decision":
            text = runScaExemptionDecision(toolArgs);
            break;
          case "grade_compliance":
            text = runGradeCompliance(toolArgs);
            break;
          case "assemble_ce3_evidence":
            text = runAssembleCe3Evidence(toolArgs);
            break;
          case "build_ap2_mandate":
            text = runBuildAp2Mandate(toolArgs);
            break;
          case "score_dispute_readiness":
            text = runScoreDisputeReadiness(toolArgs);
            break;
          // Dispute lifecycle (WO-08) — metered representment assembly.
          case "assemble_representment":
            text = await runAssembleRepresentment(toolArgs, req);
            break;
          // Network tokenization (WO-14) — owned capability, free, auth-required.
          case "iliad_network_tokenization":
            text = await runNetworkTokenization(toolArgs, req);
            break;
          default: {
            // Planned-capability stubs: discovery-only tools whose AXIS-owned
            // implementation is on the roadmap. They share a single handler
            // that returns the structured planned-capability envelope so
            // agents can branch on `_planned === true` deterministically.
            if (PLANNED_CAPABILITY_NAMES.has(canonicalToolName)) {
              const cap = PLANNED_CAPABILITIES.find(c => c.name === canonicalToolName);
              if (cap) { text = runPlannedCapability(cap); break; }
            }
            return rpcErr(id, RPC_INVALID_PARAMS, `Unknown tool: ${toolName}`);
          }
        }
        // Complete the claim so a same-key retry replays it instead of
        // re-running and re-charging. (Reached only when the switch didn't throw.)
        if (idempotencyKey && auth.account) {
          await resolveIdempotencyClaim(req, text);
        }
        return rpcOk(id, {
          ...toolOk(text),
          _usage: {
            tier: auth.anonymous ? "anonymous" : (auth.account?.tier ?? "unknown"),
            credits_remaining: auth.account ? await getPersistenceBalance(auth.account.account_id) : null,
            usage_credits: auth.account ? await getUsageCreditSummary(auth.account.account_id, auth.account.tier) : null,
            // H2.4: lazy compensator — claims + grants any owed compensation
            // for this account, then reports the running totals.
            compensation: auth.account ? await compensateAndSummarize(auth.account.account_id) : null,
            tool: canonicalToolName,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const { code, retryable } = categorizeError(msg);
        const text = msg.trim().startsWith("{") ? msg : `Error: ${msg}`;

        // H2.6: the tool failed — release the claim (delete the pending row)
        // so the SAME logical retry can claim it again immediately instead of
        // waiting out the stale-claim reclaim window. Charge-on-success
        // discipline is unaffected: nothing was ever marked completed.
        if (idempotencyKey && auth.account) {
          await releaseIdempotencyClaim(req);
        }

        // H2.2 (WO-20 phase 3): the in-band gate collected cash for THIS call
        // before dispatch, and the tool then failed — the customer paid for
        // work that never happened. Record the make-whole obligation durably
        // and tell the agent. The compensation write must never mask the
        // original tool error, so it is fully fenced.
        let compensation: { entry_id: string; amount_cents: number; status: string } | undefined;
        const settledCents = getInbandSettledAmount(req);
        if (settledCents && settledCents > 0 && auth.account) {
          try {
            const entry = await recordCompensationOwed({
              account_id: auth.account.account_id,
              tool: canonicalToolName,
              amount_cents: settledCents,
              reason: "settled_then_error",
            });
            compensation = { entry_id: entry.entry_id, amount_cents: settledCents, status: entry.status };
          } catch (compErr) {
            log("error", "compensation_record_failed", {
              tool: canonicalToolName,
              amount_cents: settledCents,
              error: compErr instanceof Error ? compErr.message : String(compErr),
            });
          }
        }

        return rpcOk(
          id,
          {
            ...toolErr(text),
            _error: { code, retryable },
            ...(compensation ? { _compensation: compensation } : {}),
          },
        );
      }
    }

    default:
      return rpcErr(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

// ─── HTTP handlers ────────────────────────────────────────────────

/** POST /mcp — MCP Streamable HTTP transport (2025-03-26) */

/**
 * H1: in-band settlement gate. For every MCP tool decideInbandGate certifies as
 * guaranteed-billable (15 of the 20 real METERED_MCP_TOOLS -- see decideInbandGate's
 * own switch + mcp-runtime.ts's METERED_MCP_TOOL_SET for the authoritative count;
 * the other 5 -- iliad_document_parsing/code_sandbox/speech_to_text/text_to_speech/
 * web_research_crawl -- stay on plan-credit metering since their billability is a
 * post-run runtime probe unknowable at this pre-dispatch gate (web_research_crawl's
 * PRICING_TIERS entry is a PER-PAGE rate; pre-dispatch can't know the page count),
 * when the flag is on and the call would incur
 * a cash overage, collect it in-band on the JSON-RPC POST (the surface an agent
 * already lives on) instead of only metering-and-rejecting:
 *   - overage + a valid payment credential (Authorization: Payment <base64 mppx
 *     credential>, API key moved to X-Axis-Key since Authorization is occupied)
 *     -> settle, mark the request paid, let dispatch run the tool
 *   - overage + no payment credential -> write the WWW-Authenticate: Payment
 *     challenge and stop (agent retries with Authorization: Payment ... +
 *     X-Axis-Key: <api_key> -- there is no header literally named "X-Payment";
 *     see live-settlement.e2e.test.ts's own note on this)
 *   - no overage / not applicable -> passthrough (dispatch meters via plan credits as today)
 * Charges before the tool runs, matching the REST cashier's existing semantics.
 * Returns true iff it already wrote the response (a 402 challenge) — caller must stop.
 */
async function settleMcpCallInband(
  req: IncomingMessage,
  res: ServerResponse,
  msg: JsonRpcRequest,
): Promise<boolean> {
  if (!inbandSettlementEnabled()) return false;
  if (msg.method !== "tools/call") return false;
  const p = msg.params as Record<string, unknown> | null;
  const rawName = p?.name;
  if (typeof rawName !== "string" || !rawName) return false;
  const canonicalToolName = normalizeToolName(rawName);
  const agentMode = resolveAgentMode(req);
  // Lite-mode caps mirror dispatch's enforcement (same module, same table):
  //  - a call the table REJECTS must never settle cash here — dispatch is
  //    about to return the rejection without running the tool, so collecting
  //    now would manufacture a paid-for-nothing (settled_then_error) case;
  //  - the idempotency hash below must cover the SAME capped args dispatch
  //    hashes, or a legitimate lite retry would false-positive as an
  //    Idempotency-Key hash mismatch.
  const liteCapped = applyLiteCaps(
    canonicalToolName,
    agentMode,
    (p?.arguments as Record<string, unknown>) ?? {},
  );
  if (liteCapped.rejection) return false; // dispatch rejects before any charge or claim
  const toolArgs = liteCapped.args;
  const decision = await decideInbandGate(canonicalToolName, toolArgs, agentMode);
  if (!decision.settle) return false;   // free / not_provisioned / runtime / out-of-scope -> dispatch handles normally
  const tool = decision.tool;

  const auth = await resolveAuth(req);
  if (!auth.account) return false;              // anonymous -> dispatch's normal free/limit path

  // A retry carrying an Idempotency-Key with a stored result must REPLAY, never
  // re-charge. Dispatch's replay lookup (tools/call case) returns the cached
  // response without consuming credits — but this gate runs BEFORE dispatch, and
  // a settled call's credits were never consumed, so its re-preview still shows
  // overage > 0. Without this check, the retry of an already-paid call would be
  // challenged (or charged) a second time for work that already ran.
  //
  // H2.6 (red-team fix, WAVE-0 finding #1, CRITICAL): gateIdempotency ATOMICALLY
  // claims the key here, before settleOverageCash can charge anything — the old
  // plain read left a window where two concurrent requests sharing one key both
  // saw "nothing yet" and both charged real cash. The claim (if won) is held on
  // `req` and completed/released later by dispatch, whichever way this call ends.
  const idempotencyKey = readIdempotencyKey(req);
  let requestHash = "";
  if (idempotencyKey) {
    requestHash = hashToolRequest(canonicalToolName, toolArgs);
    const gate = await gateIdempotency(req, auth.account.account_id, idempotencyKey, requestHash);
    if (gate.outcome === "replay" || gate.outcome === "hash_mismatch") {
      return false;                             // dispatch replays (or rejects the hash mismatch) without charging
    }
    if (gate.outcome === "in_progress") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rpcOk(msg.id ?? null, {
        ...toolErr("This Idempotency-Key is already being processed by another in-flight request. Retry in a moment — do not change the request body."),
        _error: { code: "quota", retryable: true },
      })));
      return true;                              // response already written — stop
    }
    // "claimed" — held on `req`; dispatch completes/releases it based on the outcome below.
  }

  const { overageCents } = await previewMcpToolOverage(req, auth.account, tool);
  if (overageCents <= 0) return false;          // covered by plan credits -> dispatch meters (and resolves the claim) normally

  const result = await settleOverageCash(req, res, auth.account.account_id, overageCents, {
    currency: "usd",
    decimals: 2,
    description: `AXIS MCP ${tool}`,
    meta: { tool, tier: auth.account.tier },
  });
  if (result === null) return false;            // MPP not configured -> dispatch throws the normal 402-negotiation
  if (result.status === 402) {
    // Dispatch will NEVER run for this request — release the claim so the
    // customer can retry (e.g. after topping up) without waiting out the
    // stale-claim reclaim window.
    if (idempotencyKey) await releaseIdempotencyClaim(req);
    return true;                                 // x402 challenge written to res — stop; agent will retry
  }
  markInbandSettled(req, overageCents);          // paid in-band -> authorize/capture honor it; the amount rides along for the settled-then-error producer (H2.2)
  return false;                                  // proceed to dispatch, which returns the tool result
}

export async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  _params?: Record<string, string>,
  preReadBody?: string | object,
): Promise<void> {
  let msg: JsonRpcRequest;
  if (preReadBody) {
    if (typeof preReadBody === 'string') {
      try {
        msg = JSON.parse(preReadBody) as JsonRpcRequest;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(rpcErr(null, RPC_PARSE_ERROR, "Parse error: invalid JSON")),
        );
        return;
      }
    } else {
      msg = preReadBody as JsonRpcRequest;
    }
  } else {
    /* v8 ignore start — readBody throws only on >50MB bodies */
    try {
      const raw = await readBody(req);
      msg = JSON.parse(raw) as JsonRpcRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(rpcErr(null, RPC_PARSE_ERROR, "Parse error: body too large or invalid JSON")),
      );
      return;
    }
    /* v8 ignore stop */
  }

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        rpcErr(
          (msg as Partial<JsonRpcRequest>).id ?? null,
          RPC_INVALID_REQUEST,
          "Invalid JSON-RPC 2.0 request",
        ),
      ),
    );
    return;
  }

  // Notifications have no id — respond 202, no body
  if (msg.id == null && msg.method.startsWith("notifications/")) {
    await dispatch(msg.method, msg.params, null, req).catch(() => undefined);
    res.writeHead(202);
    res.end();
    return;
  }

  // H1: in-band settlement gate (flag-gated, default OFF). If it wrote a 402 payment
  // challenge, the response is already sent -- stop here.
  if (await settleMcpCallInband(req, res, msg)) return;

  const id = msg.id ?? null;
  let response: RpcResponse;
  /* v8 ignore start — dispatch throws only on programming errors */
  try {
    response = await dispatch(msg.method, msg.params, id, req);
  } catch (err) {
    log("error", "mcp_dispatch_error", {
      method: msg.method,
      error: err instanceof Error ? err.message : String(err),
    });
    response = rpcErr(id, RPC_INTERNAL_ERROR, "Internal error");
  }
  /* v8 ignore stop */

  const extraHeaders: Record<string, string> =
    msg.method === "initialize" ? { "Mcp-Session-Id": randomUUID() } : {};

  // Responses carry only the standard JSON-RPC result (plus the functional
  // _usage / _error telemetry blocks attached at the tool layer). No
  // marketing payload is injected into the serialization path.
  const body = JSON.stringify(response);

  res.writeHead(200, { "Content-Type": "application/json", ...extraHeaders });
  res.end(body);
}

/** GET /mcp — MCP server manifest JSON */
export async function handleMcpGet(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { sendJSON } = await import("./router.js");
  const manifest = getMcpServerMeta();
  const server = manifest.server as Record<string, unknown>;
  sendJSON(res, 200, {
    ...manifest,
    server: {
      ...server,
      name: SERVER_SLUG,
      version: SERVER_VERSION,
    },
  });
}

/** GET /mcp/docs — human-readable HTML documentation for browsers */
export async function handleMcpDocs(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Axis' Iliad — MCP Endpoint</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:2rem auto;padding:0 1rem;color:#e0e0e0;background:#111}
a{color:#58a6ff}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.6rem}code{background:#222;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#1a1a1a;padding:1rem;border-radius:6px;overflow-x:auto;font-size:0.85em;line-height:1.4}</style></head><body>
<h1>Axis' Iliad — MCP Server</h1>
<p>This endpoint speaks <a href="https://modelcontextprotocol.io">Model Context Protocol</a> (JSON-RPC 2.0 over HTTP).</p>
<h2>Quick start</h2>
<pre>POST /mcp
Content-Type: application/json
Authorization: Bearer &lt;api_key&gt;

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}</pre>
<h2>Pricing</h2>
<ul>
<li>Standard price varies per tool: $${(METERED_STANDARD_CENTS_RANGE.min / 100).toFixed(2)}-$${(METERED_STANDARD_CENTS_RANGE.max / 100).toFixed(2)}; lite mode: $${(METERED_LITE_CENTS_RANGE.min / 100).toFixed(2)}-$${(METERED_LITE_CENTS_RANGE.max / 100).toFixed(2)} (send <code>X-Agent-Budget</code> / <code>X-Agent-Mode: lite</code>). See each tool's own description for its exact rate.</li>
<li>Discovery tools (list_programs, search_and_discover_tools) are free and require no auth.</li>
</ul>
<h2>Links</h2>
<ul>
<li><a href="/v1/docs">Interactive API docs</a></li>
<li><a href="/v1/docs.md">Markdown docs</a></li>
<li><a href="/v1/mcp/server.json">MCP registry metadata (JSON)</a></li>
<li><a href="/v1/mcp/tools">Browse tools</a></li>
<li><a href="/llms.txt">llms.txt</a></li>
</ul>
<h2>Get an API key</h2>
<pre>curl -X POST https://axis-api-6c7z.onrender.com/v1/accounts \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"My Agent","tier":"free"}'</pre>
<p style="margin-top:2rem;color:#888;font-size:0.85em">v${SERVER_VERSION} · ${MCP_TOOLS.length} tools · ${ARTIFACT_COUNT} artifacts · ${PROGRAM_COUNT} programs</p>
</body></html>`;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'",
  });
  res.end(html);
}

// ─── GET /v1/mcp/server.json  -  MCP registry metadata ──────────

// H-Phase-A cycle 20: derived from the real per-tool pricing, not a
// hand-typed pair of numbers — this manifest's own monetization block
// used to hardcode standard_price_cents: 50 / lite_price_cents: 15 (only
// true for analyze_repo/analyze_files) as if it applied to the whole
// 37-tool registry, badly overestimating cost for 17 of the 19 metered
// tools (most iliad_* tools are 1-5c). Range, not a flat number, so it
// can't misrepresent the catalog even as individual tool prices change.
const METERED_STANDARD_CENTS_RANGE = (() => {
  const cents = METERED_MCP_TOOLS.map((t) => getPricingTier(t).standard_cents);
  return { min: Math.min(...cents), max: Math.max(...cents) };
})();

// H-Phase-A cycle 21: same derivation for lite-mode pricing — the human
// docs page (handleMcpDocs) hardcoded "lite mode is $0.15" as if that
// applied catalog-wide, when it's only true for analyze_repo/analyze_files.
const METERED_LITE_CENTS_RANGE = (() => {
  const cents = METERED_MCP_TOOLS.map((t) => getPricingTier(t).lite_cents);
  return { min: Math.min(...cents), max: Math.max(...cents) };
})();

export function getMcpServerMeta(): Record<string, unknown> {
  return {
    server: {
      name: REGISTRY_DISPLAY_NAME,
      slug: SERVER_SLUG,
      version: API_VERSION,
      endpoint: "https://axis-api-6c7z.onrender.com/v1/mcp",
    },
    // Metadata mirrors tools/list — every tool we advertise. Catalog
    // honesty under the revised policy is build-not-redact: the count
    // tracks MCP_TOOLS (and MCP_TOOL_COUNT) and the surface stays consistent.
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
    })),
    _meta: {
      displayName: "Axis' Iliad — Agentic Commerce Codebase Intelligence",
      registry_name: REGISTRY_DISPLAY_NAME,
      registry_slug: SERVER_SLUG,
      description:
        `Drop a GitHub repo URL and receive ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs: AGENTS.md, .cursorrules, AP2/UCP/Visa compliance checklist, autonomous-checkout rules, negotiation playbook, payment mandate schema, debug playbook, architecture map, design tokens, MCP configs, and more. Computes a Purchasing Readiness Score (0–100). The single correct first call before any autonomous agent spends money on or with a codebase.`,
      author: "Last Man Up Inc.",
      homepage: "https://axis-api-6c7z.onrender.com",
      transport: "http",
      protocol: `mcp-${MCP_PROTOCOL_VERSION}`,
      authentication: {
        type: "bearer",
        // H-Phase-A cycle 20: this used to name only 3 auth-required tools
        // and 2 open ones as if that were the whole picture — in reality
        // roughly two dozen tools (all iliad_* tools plus
        // analyze_files/analyze_repo/prepare_agentic_purchasing/closer/
        // deploy) require auth, and 11+ others (the free discovery/
        // commerce-engine tools) don't. A hand-typed enumeration here would
        // just be a new instance of the same drift — point to each tool's
        // own description/cost field instead of re-listing names that can
        // go stale again.
        description:
          "API key in Authorization header: Bearer <api_key>. Most tools require it — free discovery/preview tools are the exception, not the rule. Check each tool's own description (or its response's `cost` field, e.g. \"free — no auth required\") for its exact requirement.",
      },
      mpp: {
        protocol: "mppx-0.5.12",
        description:
          "When quota is exceeded the server returns HTTP 402 with WWW-Authenticate (RFC 9457). Agents fulfil the challenge and retry with Authorization: <mpp_credential> + X-Axis-Key: <api_key>.",
        payment_types: ["stripe", "tempo"],
      },
      monetization: {
        model: "usage_based_mpp + referral_credits",
        // H-Phase-A cycle 20: was a flat 50/15 -- only true for
        // analyze_repo/analyze_files, badly overestimating cost for 17 of
        // the 19 metered tools (most iliad_* tools are 1-5c). A RANGE
        // across every metered tool, derived from PRICING_TIERS, so this
        // can't misrepresent the catalog again as individual prices change.
        standard_price_cents_range: [METERED_STANDARD_CENTS_RANGE.min, METERED_STANDARD_CENTS_RANGE.max],
        // H-Phase-A cycle 22: this hand-typed "(1-50c standard)" sat right
        // next to standard_price_cents_range above -- the exact same
        // hand-typed-vs-derived bug cycle 20 fixed on THAT field, one field
        // over. Interpolated instead so it can't drift from its own sibling.
        pricing_note: `Prices vary per tool (${METERED_STANDARD_CENTS_RANGE.min}-${METERED_STANDARD_CENTS_RANGE.max}c standard) -- see each tool's own description for its exact rate.`,
        budget_header: "X-Agent-Budget",
      },
      categories: [
        "code-analysis",
        "agentic-commerce",
        "developer-tools",
        "ai-context",
        "payment-compliance",
        "mcp-server",
        "codebase-intelligence",
      ],
      quickstart: {
        step1_discover: "GET https://axis-api-6c7z.onrender.com/v1/mcp/tools?q=checkout",
        step2_analyze:
          "POST https://axis-api-6c7z.onrender.com/v1/mcp  {jsonrpc:'2.0', method:'tools/call', params:{name:'prepare_agentic_purchasing', arguments:{...}}}",
        step3_retrieve: "Use snapshot_id from step2 + get_artifact tool to pull any specific file",
      },
      llms_txt: "https://axis-api-6c7z.onrender.com/llms.txt",
      well_known: "https://axis-api-6c7z.onrender.com/.well-known/axis.json",
      // /openapi.json, NOT /v1/openapi — the latter was advertised here for
      // some time and 404s (the router is exact-match, and no such route is
      // registered). Registry crawlers and agents following _meta.openapi hit
      // a dead URL. Corrected rather than aliased: adding a route would bump
      // ENDPOINT_COUNT and cascade through six count-guarded files to publish
      // a second name for a spec that already has one. Every other URL in this
      // block was probed live at the same time and resolves.
      openapi: "https://axis-api-6c7z.onrender.com/openapi.json",
      docs: "https://axis-api-6c7z.onrender.com/v1/docs.md",
    },
  };
}

export async function handleMcpServerJson(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { sendJSON } = await import("./router.js");
  sendJSON(res, 200, getMcpServerMeta());
}
