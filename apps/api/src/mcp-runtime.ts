import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  createReferralCode,
  previewUsageCredits,
  consumeUsageCredits,
  getIdempotentResult,
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
} from "@axis/snapshots";
import { build402NegotiationBody, getPricingTier, parseAgentBudget, resolveAgentMode, priceForMode } from "./mpp.js";

// Registry identity constants — shared between the tool impls
// (runDiscoverAgenticCommerceTools advertises the shareable manifest) and the
// server-meta builders in mcp-server. Kept here so the tool impls can read them
// without importing from mcp-server (which would create an import cycle).
export const REGISTRY_DISPLAY_NAME = "Axis' Iliad";
export const SERVER_SLUG = "axis-iliad";
export const REGISTRY_VERSION = "0.5.0";

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export interface RpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface RpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

// â”€â”€â”€ Response builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function rpcOk(id: string | number | null, result: unknown): RpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function rpcErr(
  id: string | number | null,
  code: number,
  message: string,
): RpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function toolOk(text: string) {
  return { content: [{ type: "text", text }], isError: false };
}

export function toolErr(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

export type ErrorCategory = "auth" | "validation" | "quota" | "tier_limit" | "external" | "internal";

export function categorizeError(msg: string): { code: ErrorCategory; retryable: boolean } {
  if (/authentication required|invalid.*api.key|revoked/i.test(msg))
    return { code: "auth", retryable: false };
  if (/payment required|mpp credit|pro tier/i.test(msg))
    return { code: "tier_limit", retryable: false };
  if (/quota exceeded/i.test(msg))
    return { code: "quota", retryable: true };
  if (/file limit.*exceeds.*tier|exceeds max.*tier/i.test(msg))
    return { code: "tier_limit", retryable: false };
  if (/is required|must be|invalid.*path|invalid.*url|must have|not found|exceeds max/i.test(msg))
    return { code: "validation", retryable: false };
  if (/fetch failed|github.*failed/i.test(msg))
    return { code: "external", retryable: true };
  return { code: "internal", retryable: false };
}

// Doc-facing catalog of the 6 categories above (H4.2) — categorizeError itself can't be
// introspected for a static list (it's a chain of regex tests), so this is a hand-kept
// summary of its branches. Kept directly below the function it documents so a change to
// one is hard to miss when reading the other.
//
// H-Phase-A cycle 5: this used to be an ARRAY literal with a comment claiming
// "TS also enforces each entry is a real category" — true of each individual
// `code` field (a typo'd category would fail to typecheck), but NOT of
// exhaustiveness: an array literal can silently omit a union member with no
// compile error, the exact same false-guarantee shape cycle 4 found in
// mcp-inband-settlement.test.ts's METERED_MCP_TOOLS. MCP_ERROR_CATEGORY_SET is
// now a genuinely exhaustive Record<ErrorCategory, ...> — a missing or extra
// key is a real build error, checked by every tsc run (this is a normal
// source file, not a `.test.ts` excluded from the tsc pass) — and
// MCP_ERROR_CATEGORY_CATALOG derives from it instead of duplicating the list.
const MCP_ERROR_CATEGORY_SET: Record<ErrorCategory, { retryable: boolean; description: string }> = {
  auth: { retryable: false, description: "API key missing, invalid, or revoked." },
  tier_limit: { retryable: false, description: "Payment or plan tier required — the tool call needs an upgrade or MPP credit, not a retry." },
  quota: { retryable: true, description: "Quota exceeded, or another in-flight request already holds this Idempotency-Key — retry after the window/request clears." },
  validation: { retryable: false, description: "Bad tool arguments (missing/invalid field, path, or URL)." },
  external: { retryable: true, description: "An upstream dependency (e.g. GitHub) failed or was unreachable." },
  internal: { retryable: false, description: "Uncategorized error, including genuine server bugs." },
};
export const MCP_ERROR_CATEGORY_CATALOG: readonly { code: ErrorCategory; retryable: boolean; description: string }[] =
  (Object.keys(MCP_ERROR_CATEGORY_SET) as ErrorCategory[]).map((code) => ({ code, ...MCP_ERROR_CATEGORY_SET[code] }));

async function buildMcpPaymentRequiredError(
  tool: MeteredMcpTool,
  accountId: string,
  message: string,
  req: IncomingMessage,
  extra?: Record<string, unknown>,
): Promise<string> {
  const referralToken = (await createReferralCode(accountId)).code;
  return JSON.stringify(
    {
      ...build402NegotiationBody(tool, parseAgentBudget(req), {
        message,
        referral_token: referralToken,
      }),
      ...extra,
      price_per_call: `$${(getPricingTier(tool).standard_cents / 100).toFixed(2)}`,
    },
    null,
    2,
  );
}
export { buildMcpPaymentRequiredError };

/**
 * MCP tool names that go through plan-credit metering. All entries here
 * must also have a PRICING_TIERS row in @axis/mpp/PRICING_TIERS; the
 * "no iliad_* falls back to default" invariant in budget-probe.test
 * catches drift.
 *
 * Tools NOT listed here are either:
 *   - Free discovery tools (list_programs, search_and_discover_tools, etc.)
 *   - Per-operation gated tools that meter selectively inside their runX
 *     function (e.g. iliad_web_search bills only `search`, not `index`).
 */
export type MeteredMcpTool =
  | "analyze_files"
  | "analyze_repo"
  | "prepare_agentic_purchasing"
  | "closer"
  | "deploy"
  | "assemble_representment"
  | "iliad_object_storage"
  | "iliad_vector_database"
  | "iliad_embeddings"
  | "iliad_transactional_email"
  | "iliad_analytics"
  | "iliad_llm_inference"
  | "iliad_code_sandbox"
  | "iliad_speech_to_text"
  | "iliad_text_to_speech"
  | "iliad_web_search"
  | "iliad_document_parsing"
  | "iliad_hygiene"
  | "iliad_web_research"
  | "iliad_web_research_crawl";

// Runtime companion to the type above — TS unions erase at compile time, so any
// code that needs to ask "is this tool name genuinely metered" (e.g. computing an
// honest per-tool price for discover_commerce_tools) needs an actual array.
//
// H-Phase-A cycle 4: an array literal here is NOT actually exhaustiveness-checked
// against MeteredMcpTool — TS happily accepts an array missing a union member, so
// "kept literally adjacent to the type" was an aspiration, not an enforced
// guarantee, and closer/deploy/assemble_representment silently missing from a
// DIFFERENT hand-typed Record in mcp-inband-settlement.test.ts went undetected
// for a full cycle (worse: that test file is `.test.ts`, excluded from
// apps/api/tsconfig.json's tsc pass, so even a genuinely-exhaustive Record there
// would never be checked by CI). METERED_MCP_TOOL_SET below is the real,
// compile-time-exhaustive source of truth — a missing or extra key is a build
// error in THIS file, which tsc always checks — and METERED_MCP_TOOLS derives
// from it rather than duplicating the list.
const METERED_MCP_TOOL_SET: Record<MeteredMcpTool, true> = {
  analyze_files: true,
  analyze_repo: true,
  prepare_agentic_purchasing: true,
  closer: true,
  deploy: true,
  assemble_representment: true,
  iliad_object_storage: true,
  iliad_vector_database: true,
  iliad_embeddings: true,
  iliad_transactional_email: true,
  iliad_analytics: true,
  iliad_llm_inference: true,
  iliad_code_sandbox: true,
  iliad_speech_to_text: true,
  iliad_text_to_speech: true,
  iliad_web_search: true,
  iliad_document_parsing: true,
  iliad_hygiene: true,
  iliad_web_research: true,
  iliad_web_research_crawl: true,
};
export const METERED_MCP_TOOLS: readonly MeteredMcpTool[] = Object.keys(METERED_MCP_TOOL_SET) as MeteredMcpTool[];

/** A pre-authorized charge — the tool + resolved price, ready to commit on success. */
interface AuthorizedCharge {
  tool: MeteredMcpTool;
  amountCents: number;
  /** True when the overage was paid in-band with cash (H1); capture must NOT debit plan credits. */
  settled?: boolean;
}

// ── H1: in-band settlement on the MCP tool-call surface (flag-gated, default OFF) ──

/** Feature flag: collect payment in-band on the MCP surface instead of only metering. */
export function inbandSettlementEnabled(): boolean {
  const v = process.env.AXIS_MCP_INBAND_SETTLEMENT;
  return v === "true" || v === "1";
}

/**
 * Requests whose cash overage was already settled in-band at the MCP POST gate.
 * The gate marks the request here; authorize/capture read it to (a) not reject the
 * call with a 402 and (b) not debit plan credits (the overage was paid with cash).
 * A WeakSet keyed by the request object — no signature changes thread through runX.
 */
// H2.2: a WeakMap (was a WeakSet) so the SETTLED AMOUNT travels with the
// marker — the dispatch catch needs it to record the exact make-whole
// obligation when a cash-settled call's tool then fails.
const inbandSettledRequests = new WeakMap<IncomingMessage, number>();
export function markInbandSettled(req: IncomingMessage, amountCents: number): void {
  inbandSettledRequests.set(req, amountCents);
}
export function isInbandSettled(req: IncomingMessage): boolean {
  return inbandSettledRequests.has(req);
}
/** The cash amount the in-band gate collected for THIS request, if any. */
export function getInbandSettledAmount(req: IncomingMessage): number | null {
  return inbandSettledRequests.get(req) ?? null;
}

/**
 * Preview the cash overage (cents) a metered tool would incur for this account,
 * without charging or throwing. The in-band gate uses this to decide whether to
 * collect before dispatch. Mirrors the price math in authorizeMcpToolCredits.
 */
export async function previewMcpToolOverage(
  req: IncomingMessage,
  account: { account_id: string; tier: "free" | "paid" | "suite" },
  tool: MeteredMcpTool,
): Promise<{ amountCents: number; overageCents: number }> {
  const mode = resolveAgentMode(req);
  const pricing = getPricingTier(tool);
  const amountCents = priceForMode(pricing, mode);
  const charge = await previewUsageCredits(account.account_id, account.tier, tool, amountCents);
  return { amountCents, overageCents: charge.effective_overage_cents };
}

/**
 * Pre-authorize a metered call WITHOUT debiting. Throws a 402 payment-required
 * error if the call would exceed the account's included monthly credits — so the
 * caller is rejected before any work runs AND without a partial charge (the old
 * path wrote the debit first, then threw, charging for a call that did nothing).
 * Returns the resolved charge to commit via captureMcpToolCredits once the work
 * succeeds. Gate half of the auth/capture pattern that guarantees a credit is
 * debited only when the tool call actually succeeds.
 */
export async function authorizeMcpToolCredits(
  req: IncomingMessage,
  account: { account_id: string; tier: "free" | "paid" | "suite" },
  tool: MeteredMcpTool,
): Promise<AuthorizedCharge> {
  const mode = resolveAgentMode(req);
  const pricing = getPricingTier(tool);
  const amountCents = priceForMode(pricing, mode);
  const charge = await previewUsageCredits(account.account_id, account.tier, tool, amountCents);
  if (charge.effective_overage_cents > 0) {
    // H1: if the overage was already collected as cash by the in-band MCP gate, do not
    // reject — return a settled charge. Capture still records the call through
    // consumeUsageCredits (drawing down the included-credit portion and writing the
    // usage ledger row); "settled" only means the overage slice must not be treated
    // as unpaid. The cash itself is recorded in payment_receipts by the gate.
    if (isInbandSettled(req)) {
      return { tool, amountCents, settled: true };
    }
    throw new Error(await buildMcpPaymentRequiredError(
      tool,
      account.account_id,
      `${tool} exceeded included monthly credits. This call needs ${charge.credits_required} credits (${charge.included_credits_applied} included, ${charge.overage_credits} overage). Overage due now: $${(charge.effective_overage_cents / 100).toFixed(2)}.`,
      req,
      {
        usage_credits: {
          plan_id: charge.plan_id,
          monthly_allowance: charge.monthly_allowance,
          included_credits_used: charge.included_credits_used,
          included_credits_remaining: charge.included_credits_remaining,
          overage_credits_this_month: charge.overage_credits_this_month,
        },
      },
    ));
  }
  return { tool, amountCents };
}

/** Commit a previously-authorized charge. Call ONLY after the metered work succeeds. */
export async function captureMcpToolCredits(
  account: { account_id: string; tier: "free" | "paid" | "suite" },
  charge: AuthorizedCharge,
): Promise<void> {
  // H1: a settled charge (overage collected as cash by the in-band gate) is STILL
  // consumed here. consumeUsageCredits never collects money — it draws down the
  // included-credit portion and writes the usage ledger row. Skipping it (the old
  // behavior) meant a partially-covered call never depleted its included credits
  // (the same allowance re-applied on every subsequent call all month — a
  // persistent undercharge) and the call was invisible to usage analytics. The
  // cash side lives exclusively in payment_receipts, written by the gate, so
  // recording usage here cannot double-charge anyone.
  await consumeUsageCredits(account.account_id, account.tier, charge.tool, charge.amountCents);
}

/**
 * Authorize + immediately capture. Use ONLY for handlers whose metered work
 * cannot fail after this point (pure local compute). Handlers that do fallible
 * work afterward (external fetches, provider calls, subprocess spawns) must
 * instead authorize up front, run the work, and capture on success — so a failed
 * call never debits the caller.
 */
export async function meterMcpToolCredits(
  req: IncomingMessage,
  account: { account_id: string; tier: "free" | "paid" | "suite" },
  tool: MeteredMcpTool,
): Promise<void> {
  const charge = await authorizeMcpToolCredits(req, account, tool);
  await captureMcpToolCredits(account, charge);
}

/** Read the optional Idempotency-Key request header (trimmed, length-capped). */
export function readIdempotencyKey(req: IncomingMessage): string | null {
  const raw = req.headers["idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > 255) return null;
  return trimmed;
}

/** Stable hash of a tool call's identity — detects an Idempotency-Key reused with different arguments. */
export function hashToolRequest(tool: string, args: Record<string, unknown>): string {
  return createHash("sha256").update(`${tool}\n${JSON.stringify(args)}`).digest("hex");
}

// ─── H2.6: idempotency claim gate (WAVE-0 finding #1, CRITICAL) ──────
//
// Before this fix, both the in-band settlement gate (settleMcpCallInband) and
// dispatch's own tools/call case independently READ getIdempotentResult, and
// neither wrote anything until AFTER the billable work finished — so two
// concurrent requests sharing one Idempotency-Key both saw "nothing yet" and
// both charged + executed. gateIdempotency is now the single chokepoint: it
// claims the key atomically BEFORE any charge or work, and is safe to call
// from both settleMcpCallInband and dispatch for the SAME incoming request —
// the second call sees the first's claim (via a per-request WeakMap, mirroring
// markInbandSettled) and treats it as "you already hold this, proceed".

interface IdempotencyClaim {
  accountId: string;
  key: string;
}

const idempotencyClaims = new WeakMap<IncomingMessage, IdempotencyClaim>();

export type IdempotencyGateResult =
  | { outcome: "replay"; response: string }
  | { outcome: "hash_mismatch" }
  | { outcome: "claimed" }
  | { outcome: "in_progress" };

/**
 * The single idempotency chokepoint for a tools/call carrying an
 * Idempotency-Key. At most one concurrent caller per (account, key) gets
 * "claimed"; every other concurrent caller gets "in_progress" and MUST NOT
 * charge or dispatch. Idempotent per request: calling this twice for the SAME
 * `req` (once from the in-band gate, once from dispatch) returns "claimed"
 * immediately on the second call without a redundant DB round-trip.
 */
export async function gateIdempotency(
  req: IncomingMessage,
  accountId: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyGateResult> {
  if (idempotencyClaims.has(req)) return { outcome: "claimed" }; // this request already holds the claim
  const cached = await getIdempotentResult(accountId, key);
  if (cached) {
    return cached.request_hash === requestHash
      ? { outcome: "replay", response: cached.response }
      : { outcome: "hash_mismatch" };
  }
  const claimed = await claimIdempotencyKey(accountId, key, requestHash);
  if (!claimed) return { outcome: "in_progress" };
  idempotencyClaims.set(req, { accountId, key });
  return { outcome: "claimed" };
}

/** Complete this request's claim (if it holds one) with the final response. Call ONLY on success. */
export async function resolveIdempotencyClaim(req: IncomingMessage, response: string): Promise<void> {
  const claim = idempotencyClaims.get(req);
  if (!claim) return;
  await completeIdempotencyKey(claim.accountId, claim.key, response);
  idempotencyClaims.delete(req);
}

/** Release this request's claim (if it holds one) without completing it — keeps the key retryable. */
export async function releaseIdempotencyClaim(req: IncomingMessage): Promise<void> {
  const claim = idempotencyClaims.get(req);
  if (!claim) return;
  await releaseIdempotencyKey(claim.accountId, claim.key);
  idempotencyClaims.delete(req);
}
