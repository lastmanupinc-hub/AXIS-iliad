import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody } from "./router.js";
import { resolveAuth } from "./billing.js";
import { settleOverageCash } from "./cashier.js";
import { log, shouldEmitRuntimeLogs } from "./logger.js";
import {
  getPersistenceBalance,
  getIdempotentResult,
  saveIdempotentResult,
  getUsageCreditSummary,
  recordMcpUsage,
} from "@axis/snapshots";
import { ARTIFACT_COUNT, PROGRAM_COUNT, MCP_TOOL_COUNT, API_VERSION } from "./counts.js";
import { classifyProbe, captureIntent, detectMcpSource } from "./intent.js";
// MCP tool catalog + planned-capability machinery live in mcp-tools.ts; MCP_TOOLS is
// re-exported so importers of mcp-server keep working.
import { MCP_TOOLS, PLANNED_CAPABILITIES, PLANNED_CAPABILITY_NAMES } from "./mcp-tools.js";
export { MCP_TOOLS };
import {
  REGISTRY_DISPLAY_NAME,
  SERVER_SLUG,
  REGISTRY_VERSION,
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
} from "./mcp-tool-impls.js";
import { runAssembleRepresentment } from "./disputes.js";
import { resolveAgentMode } from "./mpp.js";
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
// NOT exposed via Iliad. The capability is owned at the AXIS platform
// level by the AXIS Foundry sibling process — an AI-native 3D resources
// foundry (avatars + props + vehicles + environments + VFX + weapons/armor
// + character accessories + 2D images). Foundry has its own MCP surface,
// its own CanonicalAssetContract provenance system, its own pricing, and
// its own 12.4k-test regression suite. Agents that need visual generation
// should call Foundry directly (https://github.com/lastmanupinc-hub/AXIS-Foundry),
// not look for an iliad_image_generation tool that won't exist.
//
// This pattern (sibling delegation) is also how the broader AXIS platform
// composes: each process stays focused, each ships independently.
//
// ─── Catalog-honesty endgame ─────────────────────────────────────
//

// â”€â”€â”€ Method dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          `Axis' Iliad â€” analyze any GitHub repo or file set, get ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs. Use analyze_repo or analyze_files to start. Auth: Authorization: Bearer <api_key>.`,
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
      const toolArgs = (p?.arguments as Record<string, unknown>) ?? {};
      /* v8 ignore next â€” both arms tested; v8 misses the || short-circuit arm for empty-string toolName */
      if (typeof toolName !== "string" || !toolName) {
        return rpcErr(id, RPC_INVALID_PARAMS, "tools/call requires 'name' as string");
      }
      const canonicalToolName = normalizeToolName(toolName);
      const auth = await resolveAuth(req);
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
      await logMcpCall(canonicalToolName, auth.anonymous ? null : (auth.account?.account_id ?? null), ip, req.headers as Record<string, string | string[] | undefined>);

      // Idempotency: a retry carrying the same Idempotency-Key returns the
      // original result and never re-charges. Only successful results are stored
      // (a failed call doesn't charge, so it stays retryable).
      const idempotencyKey = readIdempotencyKey(req);
      const requestHash = idempotencyKey ? hashToolRequest(canonicalToolName, toolArgs) : "";
      if (idempotencyKey && auth.account) {
        const cached = await getIdempotentResult(auth.account.account_id, idempotencyKey);
        if (cached) {
          if (cached.request_hash !== requestHash) {
            return rpcErr(id, RPC_INVALID_PARAMS, "Idempotency-Key already used with different arguments");
          }
          return rpcOk(id, {
            ...toolOk(cached.response),
            _usage: {
              tier: auth.anonymous ? "anonymous" : (auth.account?.tier ?? "unknown"),
              credits_remaining: await getPersistenceBalance(auth.account.account_id),
              usage_credits: await getUsageCreditSummary(auth.account.account_id, auth.account.tier),
              tool: canonicalToolName,
            },
            _idempotent_replay: true,
          });
        }
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
          case "improve_my_agent_with_axis":
            text = await runImproveMyAgent(toolArgs, req);
            break;
          case "discover_agentic_purchasing_needs":
            text = runDiscoverAgenticPurchasingNeeds(toolArgs);
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
        // Store the successful result so a same-key retry replays it instead of
        // re-running and re-charging. (Reached only when the switch didn't throw.)
        if (idempotencyKey && auth.account) {
          await saveIdempotentResult(auth.account.account_id, idempotencyKey, requestHash, text);
        }
        return rpcOk(id, {
          ...toolOk(text),
          _usage: {
            tier: auth.anonymous ? "anonymous" : (auth.account?.tier ?? "unknown"),
            credits_remaining: auth.account ? await getPersistenceBalance(auth.account.account_id) : null,
            usage_credits: auth.account ? await getUsageCreditSummary(auth.account.account_id, auth.account.tier) : null,
            tool: canonicalToolName,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const { code, retryable } = categorizeError(msg);
        const text = msg.trim().startsWith("{") ? msg : `Error: ${msg}`;
        return rpcOk(
          id,
          {
            ...toolErr(text),
            _error: { code, retryable },
          },
        );
      }
    }

    default:
      return rpcErr(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

// â”€â”€â”€ HTTP handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** POST /mcp â€” MCP Streamable HTTP transport (2025-03-26) */

/**
 * H1: in-band settlement gate. For every MCP tool decideInbandGate certifies as
 * guaranteed-billable (WO-02: 13 of 17 metered tools, up from the 3 in WO-01), when the
 * flag is on and the call would incur a cash overage, collect it in-band on the JSON-RPC
 * POST (the surface an agent already lives on) instead of only metering-and-rejecting:
 *   - overage + valid X-Payment  -> settle, mark the request paid, let dispatch run the tool
 *   - overage + no payment        -> write the x402 challenge and stop (agent retries w/ X-Payment)
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
  const decision = await decideInbandGate(
    normalizeToolName(rawName),
    (p?.arguments as Record<string, unknown>) ?? {},
    resolveAgentMode(req),
  );
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
  const idempotencyKey = readIdempotencyKey(req);
  if (idempotencyKey) {
    const cached = await getIdempotentResult(auth.account.account_id, idempotencyKey);
    if (cached) return false;                   // dispatch replays (or rejects a hash mismatch) without charging
  }

  const { overageCents } = await previewMcpToolOverage(req, auth.account, tool);
  if (overageCents <= 0) return false;          // covered by plan credits -> dispatch meters normally

  const result = await settleOverageCash(req, res, auth.account.account_id, overageCents, {
    currency: "usd",
    decimals: 2,
    description: `AXIS MCP ${tool}`,
    meta: { tool, tier: auth.account.tier },
  });
  if (result === null) return false;            // MPP not configured -> dispatch throws the normal 402-negotiation
  if (result.status === 402) return true;       // x402 challenge written to res — stop; agent will retry
  markInbandSettled(req);                        // paid in-band -> authorize/capture honor it during dispatch
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
    /* v8 ignore start â€” readBody throws only on >50MB bodies */
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

  // Notifications have no id â€” respond 202, no body
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
  /* v8 ignore start â€” dispatch throws only on programming errors */
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

/** GET /mcp â€” MCP server manifest JSON */
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

/** GET /mcp/docs â€” human-readable HTML documentation for browsers */
export async function handleMcpDocs(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Axis' Iliad â€” MCP Endpoint</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:2rem auto;padding:0 1rem;color:#e0e0e0;background:#111}
a{color:#58a6ff}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.6rem}code{background:#222;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#1a1a1a;padding:1rem;border-radius:6px;overflow-x:auto;font-size:0.85em;line-height:1.4}</style></head><body>
<h1>Axis' Iliad â€” MCP Server</h1>
<p>This endpoint speaks <a href="https://modelcontextprotocol.io">Model Context Protocol</a> (JSON-RPC 2.0 over HTTP).</p>
<h2>Quick start</h2>
<pre>POST /mcp
Content-Type: application/json
Authorization: Bearer &lt;api_key&gt;

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}</pre>
<h2>Pricing</h2>
<ul>
<li>Standard paid calls are $0.50; lite mode is $0.15 (send <code>X-Agent-Budget</code> / <code>X-Agent-Mode: lite</code>).</li>
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
<p style="margin-top:2rem;color:#888;font-size:0.85em">v${SERVER_VERSION} Â· ${MCP_TOOLS.length} tools Â· ${ARTIFACT_COUNT} artifacts Â· ${PROGRAM_COUNT} programs</p>
</body></html>`;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'",
  });
  res.end(html);
}

// â”€â”€â”€ GET /v1/mcp/server.json  -  MCP registry metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getMcpServerMeta(): Record<string, unknown> {
  return {
    server: {
      name: REGISTRY_DISPLAY_NAME,
      slug: SERVER_SLUG,
      version: REGISTRY_VERSION,
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
        `Drop a GitHub repo URL and receive ${ARTIFACT_COUNT} structured artifacts across ${PROGRAM_COUNT} programs: AGENTS.md, .cursorrules, AP2/UCP/Visa compliance checklist, autonomous-checkout rules, negotiation playbook, payment mandate schema, debug playbook, architecture map, design tokens, MCP configs, and more. Computes a Purchasing Readiness Score (0â€“100). The single correct first call before any autonomous agent spends money on or with a codebase.`,
      author: "Last Man Up Inc.",
      homepage: "https://axis-api-6c7z.onrender.com",
      transport: "http",
      protocol: `mcp-${MCP_PROTOCOL_VERSION}`,
      authentication: {
        type: "bearer",
        description:
          "API key in Authorization header: Bearer <api_key>. analyze_files, analyze_repo, and prepare_agentic_purchasing require auth. list_programs and search_and_discover_tools are open.",
      },
      mpp: {
        protocol: "mppx-0.5.12",
        description:
          "When quota is exceeded the server returns HTTP 402 with WWW-Authenticate (RFC 9457). Agents fulfil the challenge and retry with Authorization: <mpp_credential> + X-Axis-Key: <api_key>.",
        payment_types: ["stripe", "tempo"],
      },
      monetization: {
        model: "usage_based_mpp + referral_credits",
        standard_price_cents: 50,
        lite_price_cents: 15,
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
      openapi: "https://axis-api-6c7z.onrender.com/v1/openapi",
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
