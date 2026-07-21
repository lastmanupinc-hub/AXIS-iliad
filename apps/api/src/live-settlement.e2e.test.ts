/**
 * live-settlement.e2e.test.ts — gated end-to-end proof of the settlement leg
 * (WO-03 live-collection-fix).
 *
 * Proves, against real Stripe TEST mode, the loop the InstallPage/ForAgents
 * claim describes: "HTTP 402 -> MPP challenge -> Stripe payment -> retry.
 * No human needed." Concretely:
 *
 *   1. An over-quota request to a metered route returns 402 with a
 *      non-empty challengeId (RFC 9457 problem+json body).
 *   2. A follow-up request carrying the payment credential built from that
 *      challenge + a Stripe Shared Payment Token (SPT) returns 200 with a
 *      non-empty `Payment-Receipt` response header.
 *
 * Wire-protocol note ("X-Payment" naming): this repo's own docs
 * (H1_INBAND_SETTLEMENT.md) and the work order refer to the retry
 * credential colloquially as "X-Payment". The actual mppx wire protocol
 * carries it on the standard `Authorization: Payment <base64>` header
 * (see mppx's `Credential.serialize` / `Transport.http().setCredential`) --
 * there is no header literally named `X-Payment`. This test exercises the
 * REAL client-side protocol via `mppx/client`'s payment-aware fetch (the
 * same mechanism any AXIS-paying agent uses), rather than hand-constructing
 * a header that doesn't exist on the wire, so it proves the actual
 * settlement leg rather than a stand-in for it.
 *
 * External gate (see docs/runbooks/live-collection-verification.md):
 * requires a real Stripe TEST-mode secret key (STRIPE_TEST_SECRET_KEY) and
 * a Shared-Payment-Token minted out of band against that same test account
 * (STRIPE_TEST_SPT_TOKEN) -- Stripe SPT capability is an allowlisted /
 * limited-availability feature, so minting one requires the account to
 * already have that capability enabled. When either env var is absent the
 * suite is skipped -- never a false green.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { Mppx as MppxClient, stripe as stripeClient } from "mppx/client";
import { chargeMpp, resetMppxCache } from "./mpp.js";

const STRIPE = process.env.STRIPE_TEST_SECRET_KEY; // sk_test_...
const SPT = process.env.STRIPE_TEST_SPT_TOKEN; // a Stripe TEST-mode shared-payment-token

// ---------------------------------------------------------------------------
// Minimal HTTP server exercising the exact same `chargeMpp` collection tail
// that both the REST cashier (cashier.ts) and the MCP in-band settlement
// gate (mcp-server.ts) share -- mirrors mpp.test.ts's existing harness.
// ---------------------------------------------------------------------------

function startServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      chargeMpp(req, res, {
        amount: "100",
        currency: "usd",
        decimals: 2,
        description: "live-settlement e2e (Stripe test mode)",
        meta: { test: "true" },
      })
        .then((result) => {
          if (!result || result.status === 402) return; // chargeMpp already wrote the response
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        })
        .catch((err) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

function serverUrl(server: http.Server, path: string): string {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return `http://127.0.0.1:${addr.port}${path}`;
}

// ---------------------------------------------------------------------------
// Gated suite -- skip-by-default. Runs only when both STRIPE_TEST_SECRET_KEY
// and STRIPE_TEST_SPT_TOKEN are supplied out of band (never in normal CI).
// ---------------------------------------------------------------------------

(STRIPE && SPT ? describe : describe.skip)("402 -> Authorization: Payment -> 200 (Stripe test mode)", () => {
  let server: http.Server;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = STRIPE;
    delete process.env.TEMPO_RECIPIENT_ADDRESS;
    resetMppxCache();
    server = await startServer();
  });

  afterEach(async () => {
    await stopServer(server);
    delete process.env.STRIPE_SECRET_KEY;
    resetMppxCache();
  });

  it("issues a 402 MPP challenge with a non-empty challengeId (RFC 9457)", async () => {
    const res = await fetch(serverUrl(server, "/analyze"), { method: "POST" });
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe("https://paymentauth.org/problems/payment-required");
    expect(typeof body.challengeId).toBe("string");
    expect((body.challengeId as string).length).toBeGreaterThan(0);
  });

  it("retries with a credential built from the challenge + SPT and settles 200 with a Payment-Receipt header", async () => {
    // The SPT is already minted (supplied out of band via STRIPE_TEST_SPT_TOKEN),
    // so `createToken` just returns it -- mppx/client handles the full
    // 402 -> parse challenge -> build credential -> retry loop internally.
    const mppxClient = MppxClient.create({
      methods: [
        stripeClient({
          paymentMethod: "spt_provided",
          createToken: async () => SPT as string,
        }),
      ],
      polyfill: false, // do not touch globalThis.fetch; use the returned fetch directly
    });

    const res = await mppxClient.fetch(serverUrl(server, "/analyze"), { method: "POST" });
    expect(res.status).toBe(200);
    const receipt = res.headers.get("payment-receipt");
    expect(receipt).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });
});
