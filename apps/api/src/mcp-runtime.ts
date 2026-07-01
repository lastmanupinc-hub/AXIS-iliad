import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  createReferralCode,
  previewUsageCredits,
  consumeUsageCredits,
} from "@axis/snapshots";
import { build402NegotiationBody, getPricingTier, parseAgentBudget, resolveAgentMode, priceForMode } from "./mpp.js";
import { getPaidWallet, debitPaidWallet, paidWalletMode, checkoutIdempotencyKey } from "./paid-client.js";
import { log } from "./logger.js";

// PAI'D Fabric-Credit wallet integration (gated by PAID_WALLET_MODE; ships dark).
// Iliad only READS and DEBITS the wallet — never credits it (separation of duties;
// money-in rides PAI'D's own checkout). Charged as the AXIS marketplace's take on a
// paid program/tool call, with full line-item traceability for audit/reconciliation.
const WALLET_PRODUCT_CODE = "tf_marketplace_take";
/** Iliad account → PAI'D wallet developer_id (1:1 today). */
function walletDeveloperId(account: { account_id: string }): string {
  return account.account_id;
}
/** USD cents → integer Fabric Credits ($1 = 1 FC; any paid call is ≥ 1 FC). */
function centsToFc(cents: number): number {
  return Math.max(1, Math.ceil(cents / 100));
}

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
  // Compliance pre-flight (enforce mode only): reject BEFORE any work runs if the
  // PAI'D wallet can't cover the debit — never do paid work we can't charge for.
  // A wallet READ failure (PAI'D unavailable) fails OPEN here: the authoritative
  // debit at capture is the real gate, so a read blip doesn't deny service.
  if (paidWalletMode() === "enforce") {
    const amountFc = centsToFc(amountCents);
    let wallet;
    try {
      wallet = await getPaidWallet(walletDeveloperId(account));
    } catch (err) {
      log("warn", "paid-wallet: pre-flight balance read failed; deferring to capture-time debit", { account: account.account_id, tool, error: (err as Error).message });
    }
    if (wallet && wallet.balance_fc < amountFc) {
      throw new Error(await buildMcpPaymentRequiredError(
        tool,
        account.account_id,
        `Insufficient Fabric Credits for ${tool}: need ${amountFc} FC, wallet has ${wallet.balance_fc} FC. Top up your PAI'D wallet to continue.`,
        req,
        { fabric_credits: { balance_fc: wallet.balance_fc, required_fc: amountFc, shortfall_fc: amountFc - wallet.balance_fc } },
      ));
    }
  }

  return { tool, amountCents };
}

/**
 * Commit a previously-authorized charge. Call ONLY after the metered work
 * succeeds. Behaviour by PAID_WALLET_MODE (default off = unchanged):
 *  - off/read : write the local usage ledger only (quota/display).
 *  - shadow   : log the would-be FC debit; write the local ledger. No real debit.
 *  - enforce  : debit the PAI'D wallet FIRST (authoritative money) — a 402/insufficient
 *               or any debit error PROPAGATES (fail-closed: the caller withholds the
 *               tool output) — then mirror to the local ledger (best-effort; a mirror
 *               failure after a successful debit is logged for reconciliation, not
 *               re-thrown, since the call was already paid + delivered).
 * The debit carries a deterministic Idempotency-Key (PAI'D requires + dedupes on it)
 * plus a full reference (tool + referenceId) for the audit trail.
 */
export async function captureMcpToolCredits(
  account: { account_id: string; tier: "free" | "paid" | "suite" },
  charge: AuthorizedCharge,
  debit?: { referenceId?: string },
): Promise<void> {
  const mode = paidWalletMode();
  const amountFc = centsToFc(charge.amountCents);
  const referenceId = debit?.referenceId ?? `${charge.tool}:${randomUUID()}`;

  if (mode === "enforce") {
    const idempotencyKey = checkoutIdempotencyKey(account.account_id, `mcp-debit:${charge.tool}:${referenceId}`);
    // Throws PaidError(402) on insufficient funds — fail-closed by design.
    await debitPaidWallet(walletDeveloperId(account), {
      amountFc,
      productCode: WALLET_PRODUCT_CODE,
      reason: `MCP ${charge.tool}`,
      referenceType: "iliad_mcp",
      referenceId,
      idempotencyKey,
    });
  } else if (mode === "shadow") {
    log("info", "paid-wallet: shadow debit (not applied)", { account: account.account_id, tool: charge.tool, amount_fc: amountFc, reference_id: referenceId });
  }

  // Local usage ledger = quota/display mirror.
  try {
    await consumeUsageCredits(account.account_id, account.tier, charge.tool, charge.amountCents);
  } catch (err) {
    if (mode === "enforce") {
      // Wallet already debited (authoritative + paid). Don't fail the delivered call
      // on a local-ledger mirror hiccup — record it for reconciliation instead.
      log("error", "paid-wallet: local ledger mirror failed AFTER wallet debit — reconcile", { account: account.account_id, tool: charge.tool, amount_fc: amountFc, reference_id: referenceId, error: (err as Error).message });
      return;
    }
    throw err; // off/read/shadow: the local ledger is the only record — surface the failure.
  }
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
