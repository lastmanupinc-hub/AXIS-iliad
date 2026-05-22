// ─── Credit Pack Top-Up Handlers ────────────────────────────────
//
// HTTP surface for the PAI'D-routed credit pack purchase flow:
//
//   GET  /v1/credits/packs               → list catalog (public, no auth)
//   POST /v1/credits/topup               → start a purchase (auth required)
//   GET  /v1/credits/packs/me            → list this account's purchases (auth)
//
// Webhook completion is handled in paid-handlers.ts handlePaidWebhook
// by inspecting checkout.session.completed events with metadata.type =
// "axis_credit_topup".

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { resolveAuth } from "./billing.js";
import {
  createCheckoutSession,
  loadPaidConfig,
  PaidError,
} from "./paid-client.js";
import {
  CREDIT_PACK_CATALOG,
  getPackById,
  recordPendingPurchase,
  listCreditPacks,
  getTotalPackCredits,
  trackEvent,
  resolveStage,
} from "@axis/snapshots";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "https://axis-iliad.jonathanarvay.com";

/** GET /v1/credits/packs — public catalog, no auth */
export async function handleListCreditPacks(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    packs: CREDIT_PACK_CATALOG.map((pack) => ({
      ...pack,
      // Tag whether this is the "best value" for marketing purposes.
      // Computed as the lowest price_per_1k_credits_cents in the catalog.
      is_best_value:
        pack.price_per_1k_credits_cents ===
        Math.min(...CREDIT_PACK_CATALOG.map((p) => p.price_per_1k_credits_cents)),
    })),
    note:
      "Credit packs are one-shot, no commitment. Drawn after your monthly plan allowance, before per-call overage. Routed through PAI'D → Stripe.",
  });
}

/** POST /v1/credits/topup — start a credit pack purchase (auth required) */
export async function handleCreateCreditTopup(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required for credit purchases");
    return;
  }

  const raw = await readBody(req);
  let body: { pack_id?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const pack_id = typeof body.pack_id === "string" ? body.pack_id : "";
  if (!pack_id) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "pack_id is required");
    return;
  }

  const pack = getPackById(pack_id);
  if (!pack) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `Unknown pack_id: ${pack_id}. Call GET /v1/credits/packs for the catalog.`);
    return;
  }

  // Verify PAI'D is configured before creating the pending row.
  let config;
  try {
    config = loadPaidConfig();
  } catch (err) {
    log("error", "PAI'D config missing for credit topup", { error: (err as Error).message });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Payment processor not configured");
    return;
  }

  const account = auth.account;
  const successURL = `${WEB_BASE_URL}/account?topup=success&pack=${encodeURIComponent(pack_id)}`;
  const cancelURL = `${WEB_BASE_URL}/account?topup=canceled`;

  try {
    const session = await createCheckoutSession(
      {
        amountCents: pack.price_cents,
        currency: "USD",
        successUrl: successURL,
        cancelUrl: cancelURL,
        description: `AXIS Iliad — ${pack.label}`,
        lineItems: [
          {
            name: `${pack.credits.toLocaleString()} AXIS credits`,
            amount_cents: pack.price_cents,
            currency: "USD",
            quantity: 1,
          },
        ],
        metadata: {
          type: "axis_credit_topup",
          axis_account_id: account.account_id,
          axis_account_email: account.email,
          pack_id: pack.pack_id,
          credits: String(pack.credits),
          merchant: "iliad",
        },
      },
      config,
    );

    // Record PENDING purchase keyed by session_id so the webhook can mark it succeeded.
    const purchase = recordPendingPurchase(
      account.account_id,
      pack.pack_id,
      session.session_id,
      {
        checkout_url: session.url,
        initiated_at: new Date().toISOString(),
      },
    );

    trackEvent(account.account_id, "checkout_started", resolveStage(account.account_id), {
      processor: "paid",
      kind: "credit_topup",
      pack_id: pack.pack_id,
      credits: String(pack.credits),
      price_cents: String(pack.price_cents),
      session_id: session.session_id,
    });

    sendJSON(res, 200, {
      checkout_url: session.url,
      session_id: session.session_id,
      purchase_id: purchase.purchase_id,
      pack: {
        pack_id: pack.pack_id,
        credits: pack.credits,
        price_cents: pack.price_cents,
        label: pack.label,
      },
      expires_at: session.expires_at,
    });
  } catch (err) {
    if (err instanceof PaidError) {
      log("error", "PAI'D checkout session create failed", {
        status: err.status,
        body: err.body.slice(0, 500),
        pack_id,
        account_id: account.account_id,
      });
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, "Payment processor rejected request");
      return;
    }
    log("error", "Credit topup error", {
      error: (err as Error).message,
      account_id: account.account_id,
      pack_id,
    });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Credit topup failed");
  }
}

/** GET /v1/credits/packs/me — list this account's purchase history (auth) */
export async function handleListMyCreditPacks(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return;
  }
  const account = auth.account;
  const purchases = listCreditPacks(account.account_id, 100);
  const totalRemaining = getTotalPackCredits(account.account_id);
  sendJSON(res, 200, {
    total_credits_remaining: totalRemaining,
    purchases,
  });
}
