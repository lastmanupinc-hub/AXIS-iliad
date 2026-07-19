// ─── Credit-pack top-up handlers ────────────────────────────────
//
// Paid AXIS persistence-credit purchases, routed through PAI'D's hosted
// checkout (the first production revenue path for the PAI'D integration):
//
//   GET  /v1/credits/packs      → public catalog (no auth)
//   POST /v1/credits/topup      → create a PAI'D checkout session for a pack
//   GET  /v1/credits/purchases  → caller's purchase history
//
// Fulfilment is async: PAI'D forwards checkout.session.completed to
// POST /portal/api/paid/webhook (paid-handlers.ts), which grants the credits
// into the existing persistence_credits balance exactly once.

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { resolveAuth } from "./billing.js";
import { createTopupCheckoutSession, loadPaidConfig, PaidError, checkoutIdempotencyKey } from "./paid-client.js";
import {
  listCreditPackCatalog,
  getCreditPack,
  recordPendingPurchase,
  listPurchasesByAccount,
  trackEvent,
} from "@axis/snapshots";

/** Web app base for the hosted-checkout return URLs. */
function webBaseUrl(req: IncomingMessage): string {
  const origin =
    process.env.AXIS_WEB_URL ||
    (typeof req.headers.origin === "string" ? req.headers.origin : "") ||
    "https://iliad.trustfabric.ai";
  return origin.replace(/\/+$/, "");
}

/** GET /v1/credits/packs — public catalog of purchasable credit packs. */
export async function handleListCreditPacks(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, { packs: listCreditPackCatalog() });
}

/** POST /v1/credits/topup — start a PAI'D hosted checkout for a credit pack. Body: { pack_id }. */
export async function handleCreateCreditTopup(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = await resolveAuth(req);
  if (auth.anonymous || !auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return;
  }
  const account = auth.account;

  let body: { pack_id?: unknown };
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const pack_id = typeof body.pack_id === "string" ? body.pack_id : "";
  const pack = getCreditPack(pack_id);
  if (!pack) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Unknown pack_id");
    return;
  }

  let config;
  try {
    config = loadPaidConfig();
  } catch (err) {
    log("error", "PAI'D config missing for credit topup", { error: (err as Error).message });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Payment processor not configured");
    return;
  }

  const base = webBaseUrl(req);
  try {
    const session = await createTopupCheckoutSession(
      {
        amountCents: pack.price_cents,
        description: `AXIS Iliad — ${pack.credits.toLocaleString()} credits`,
        successUrl: `${base}/account?topup=success&pack=${encodeURIComponent(pack.pack_id)}`,
        cancelUrl: `${base}/account?topup=canceled`,
        customerEmail: account.email,
        metadata: {
          type: "axis_credit_topup",
          account_id: account.account_id,
          pack_id: pack.pack_id,
          credits: String(pack.credits),
        },
        // Deterministic key so a retried POST /v1/credits/topup (timeout/reload)
        // reuses the same PAI'D session instead of creating a second charge.
        idempotencyKey: checkoutIdempotencyKey(account.account_id, `topup:${pack.pack_id}`),
      },
      config,
    );

    // Record PENDING keyed by session id so the webhook can grant exactly once.
    // MUST await before responding: the webhook (markPurchaseSucceeded) keys its
    // idempotent grant on this row's existence + FOR UPDATE lock. If we respond
    // (and the buyer pays) before this INSERT lands, a fast webhook finds no row
    // and grants zero credits — permanently, across retries (silent lost payment).
    await recordPendingPurchase({
      account_id: account.account_id,
      pack_id: pack.pack_id,
      credits: pack.credits,
      price_cents: pack.price_cents,
      paid_session_id: session.id,
    });

    await trackEvent(account.account_id, "checkout_started", "conversion", {
      processor: "paid",
      kind: "credit_topup",
      pack_id: pack.pack_id,
      credits: String(pack.credits),
      session_id: session.id,
    });

    sendJSON(res, 200, {
      checkout_url: session.url,
      session_id: session.id,
      pack_id: pack.pack_id,
      credits: pack.credits,
      price_cents: pack.price_cents,
    });
  } catch (err) {
    if (err instanceof PaidError) {
      log("error", "PAI'D credit topup session failed", { status: err.status, body: err.body.slice(0, 500) });
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, "Payment processor rejected request");
      return;
    }
    log("error", "PAI'D credit topup error", { error: (err as Error).message });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Checkout session create failed");
  }
}

/** GET /v1/credits/purchases — the caller's credit-pack purchase history. */
export async function handleListMyPurchases(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = await resolveAuth(req);
  if (auth.anonymous || !auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return;
  }
  sendJSON(res, 200, { purchases: await listPurchasesByAccount(auth.account.account_id) });
}
