import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  createReferralCode,
  previewUsageCredits,
  consumeUsageCredits,
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
const inbandSettledRequests = new WeakSet<IncomingMessage>();
export function markInbandSettled(req: IncomingMessage): void {
  inbandSettledRequests.add(req);
}
export function isInbandSettled(req: IncomingMessage): boolean {
  return inbandSettledRequests.has(req);
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
    // reject; return a settled charge so capture skips the plan-credit debit.
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
  // H1: overage paid in-band with cash -> no plan-credit debit.
  if (charge.settled) return;
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
