// WO-14 acceptance tests — network tokenization.
//
// (A) executable lifecycle state machine (pure), (B) Stripe network-token
// read adapter (injectable fetch — hermetic, no live Stripe), (C) direct
// VTS/MDES capability gate (_not_configured until Token Requestor ID
// onboarding exists), plus the iliad_network_tokenization MCP tool
// (impl auth gate + descriptor registration + dispatch wiring).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey } from "@axis/snapshots";
import {
  isLegalTransition,
  applyTokenEvent,
  newLifecycle,
  transition,
  tokenizationCapabilities,
  readStripeNetworkToken,
  provisionNetworkToken,
  isNetworkTokenNotConfigured,
  type TokenState,
  type TokenEvent,
  type FetchLike,
} from "./network-token.js";
import { runNetworkTokenization } from "./mcp-tool-impls.js";
import { MCP_TOOLS } from "./mcp-tools.js";
import { MCP_TOOL_COUNT } from "./counts.js";
import { dispatch } from "./mcp-server.js";

// All three provider envs cleared — "unset" for every truthiness-based gate.
function stubAllProviderEnvsUnset(): void {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("AXIS_VTS_TOKEN_REQUESTOR_ID", "");
  vi.stubEnv("AXIS_MDES_TOKEN_REQUESTOR_ID", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── (A) Lifecycle state machine ─────────────────────────────────

describe("token lifecycle state machine (executable, pure)", () => {
  it("provision from no state yields 'provisioned'", () => {
    expect(applyTokenEvent(null, "provision")).toBe("provisioned");
  });

  it("the full path provision→activate→suspend→resume→delete yields provisioned,active,suspended,active,deleted", () => {
    const events: TokenEvent[] = ["provision", "activate", "suspend", "resume", "delete"];
    const states: TokenState[] = [];
    let from: TokenState | null = null;
    for (const ev of events) {
      from = applyTokenEvent(from, ev);
      states.push(from);
    }
    expect(states).toEqual(["provisioned", "active", "suspended", "active", "deleted"]);
  });

  it("transition(newLifecycle(),'delete') sets state 'deleted' with history length 2", () => {
    const lc = transition(newLifecycle(), "delete");
    expect(lc.state).toBe("deleted");
    expect(lc.history).toHaveLength(2);
    expect(lc.history[0]).toEqual({ from: null, event: "provision", to: "provisioned" });
    expect(lc.history[1]).toEqual({ from: "provisioned", event: "delete", to: "deleted" });
  });

  it("transition is pure — the input lifecycle is never mutated", () => {
    const base = newLifecycle();
    const next = transition(base, "activate");
    expect(base.state).toBe("provisioned");
    expect(base.history).toHaveLength(1);
    expect(next.state).toBe("active");
    expect(next.history).toHaveLength(2);
  });

  it("every illegal transition throws (deleted is terminal)", () => {
    expect(() => applyTokenEvent("deleted", "activate")).toThrow();
    expect(() => applyTokenEvent("provisioned", "resume")).toThrow();
    expect(() => applyTokenEvent("active", "activate")).toThrow();
    expect(() => applyTokenEvent(null, "activate")).toThrow();
    // deleted is terminal for every event
    expect(() => applyTokenEvent("deleted", "provision")).toThrow();
    expect(() => applyTokenEvent("deleted", "suspend")).toThrow();
    expect(() => applyTokenEvent("deleted", "resume")).toThrow();
    expect(() => applyTokenEvent("deleted", "delete")).toThrow();
  });

  it("isLegalTransition returns false for the same illegal transitions (and true for legal ones)", () => {
    expect(isLegalTransition("deleted", "activate")).toBe(false);
    expect(isLegalTransition("provisioned", "resume")).toBe(false);
    expect(isLegalTransition("active", "activate")).toBe(false);
    expect(isLegalTransition(null, "activate")).toBe(false);
    expect(isLegalTransition("active", "provision")).toBe(false);
    expect(isLegalTransition(null, "provision")).toBe(true);
    expect(isLegalTransition("provisioned", "activate")).toBe(true);
    expect(isLegalTransition("active", "suspend")).toBe(true);
    expect(isLegalTransition("suspended", "resume")).toBe(true);
    expect(isLegalTransition("provisioned", "delete")).toBe(true);
    expect(isLegalTransition("suspended", "delete")).toBe(true);
  });
});

// ─── Config gate ─────────────────────────────────────────────────

describe("tokenizationCapabilities", () => {
  it("returns {stripe:false,vts:false,mdes:false} with all envs unset", () => {
    stubAllProviderEnvsUnset();
    expect(tokenizationCapabilities()).toEqual({ stripe: false, vts: false, mdes: false });
  });

  it("reflects each flag true when its env is set", () => {
    stubAllProviderEnvsUnset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(tokenizationCapabilities()).toEqual({ stripe: true, vts: false, mdes: false });
    vi.stubEnv("AXIS_VTS_TOKEN_REQUESTOR_ID", "trid_visa_1");
    expect(tokenizationCapabilities()).toEqual({ stripe: true, vts: true, mdes: false });
    vi.stubEnv("AXIS_MDES_TOKEN_REQUESTOR_ID", "trid_mc_1");
    expect(tokenizationCapabilities()).toEqual({ stripe: true, vts: true, mdes: true });
  });
});

// ─── (B) Stripe read adapter (hermetic — injectable fetch) ───────

describe("readStripeNetworkToken", () => {
  it("resolves to {_not_configured:true, provider_checked:'stripe'} with STRIPE_SECRET_KEY unset", async () => {
    stubAllProviderEnvsUnset();
    const r = await readStripeNetworkToken("pm_x");
    expect(isNetworkTokenNotConfigured(r)).toBe(true);
    expect(r).toMatchObject({ _not_configured: true, provider_checked: "stripe" });
  });

  it("maps a network-tokenized PM to a full NetworkToken (stubbed fetch, secretKey set)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ id: "pm_1", card: { brand: "visa", last4: "4242", network_token: { used: true } } }),
        { status: 200 },
      );
    };
    const r = await readStripeNetworkToken("pm_1", { fetchImpl, secretKey: "sk_test_x" });
    expect(r).toEqual({
      token_ref: "pm_1",
      provider: "stripe",
      is_network_token: true,
      network: "visa",
      last4: "4242",
      token_state: "active",
    });
    // Live-path shape: GET /v1/payment_methods/{id} with the bearer key.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.stripe.com/v1/payment_methods/pm_1");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    // H0.4: every outbound Stripe call pins the API version.
    expect((calls[0].init?.headers as Record<string, string>)["Stripe-Version"]).toBe("2026-06-24.dahlia");
  });

  it("returns is_network_token:false for a bare card PM (no network_token/networks) — honest", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ id: "pm_2", card: { brand: "mastercard", last4: "4444" } }), { status: 200 });
    const r = await readStripeNetworkToken("pm_2", { fetchImpl, secretKey: "sk_test_x" });
    expect(isNetworkTokenNotConfigured(r)).toBe(false);
    if (!isNetworkTokenNotConfigured(r)) {
      expect(r.is_network_token).toBe(false);
      expect(r.network).toBe("mastercard");
      expect(r.last4).toBe("4444");
    }
  });

  it("does NOT treat co-badging metadata (card.networks.available) as a tokenization signal", async () => {
    // networks.available exists on nearly every card PM — mapping it to
    // is_network_token would fabricate an always-true signal (spec overclaim).
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({ id: "pm_3", card: { brand: "visa", last4: "0002", networks: { available: ["visa", "cartes_bancaires"] } } }),
        { status: 200 },
      );
    const r = await readStripeNetworkToken("pm_3", { fetchImpl, secretKey: "sk_test_x" });
    expect(isNetworkTokenNotConfigured(r)).toBe(false);
    if (!isNetworkTokenNotConfigured(r)) expect(r.is_network_token).toBe(false);
  });

  it("throws a clean error on a non-ok Stripe response", async () => {
    const fetchImpl: FetchLike = async () => new Response("nope", { status: 404 });
    await expect(readStripeNetworkToken("pm_missing", { fetchImpl, secretKey: "sk_test_x" })).rejects.toThrow(/404/);
  });

  it("propagates a rejected fetch (transport error) as a clean promise rejection, not an uncaught throw", async () => {
    // No try/catch wraps the fetchImpl call in readStripeNetworkToken, so a
    // rejected fetch (DNS failure, ECONNREFUSED, timeout, …) surfaces as a
    // normal rejected promise carrying the original error — callers can
    // await/try-catch it like any other async failure; it never hangs or
    // crashes the process.
    const fetchImpl: FetchLike = async () => {
      throw new Error("transport error: ECONNREFUSED");
    };
    await expect(
      readStripeNetworkToken("pm_neterr", { fetchImpl, secretKey: "sk_test_x" }),
    ).rejects.toThrow(/transport error/);
  });

  it("classifies a stalled Stripe response that outlives the client-side timeout the same way as a transport error — a clean promise rejection, not an uncaught throw", async () => {
    // readStripeNetworkToken has no catch around the fetchImpl call (see the
    // transport-error test above) — a timeout must propagate the exact same
    // way: a rejected promise carrying the AbortError, not a hang or a
    // crash. STRIPE_READ_TIMEOUT_MS (15_000) isn't exported; mirrored here
    // via fake timers so this test doesn't really wait 15s.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Never resolves on its own; only settles when the signal that
      // readStripeNetworkToken passes in gets aborted — same as a real fetch would.
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        });

      const pending = readStripeNetworkToken("pm_timeout", { fetchImpl, secretKey: "sk_test_x" });
      // Attach the rejection handler synchronously, before advancing the fake
      // clock — otherwise the internal promise can reject *during* the
      // advance below with no handler attached yet.
      const assertion = expect(pending).rejects.toThrow(/This operation was aborted/);
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("tolerates a 200 OK response with no card field at all (malformed/unexpected shape) — defensive optional chaining, no throw", async () => {
    // card mapping uses optional chaining (card?.network_token?.used,
    // card?.brand, card?.last4) with null/false fallbacks, so a response
    // that parses as JSON but is missing the `card` object entirely (and
    // even `id`) does NOT throw — it degrades to an honest all-unknown token.
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify({}), { status: 200 });
    const r = await readStripeNetworkToken("pm_shapeless", { fetchImpl, secretKey: "sk_test_x" });
    expect(isNetworkTokenNotConfigured(r)).toBe(false);
    if (!isNetworkTokenNotConfigured(r)) {
      expect(r).toEqual({
        token_ref: "pm_shapeless", // falls back to the input id — response body had no `id`
        provider: "stripe",
        is_network_token: false,
        network: null,
        last4: null,
        token_state: "active",
      });
    }
  });

  it("rejects an empty paymentMethodId", async () => {
    await expect(readStripeNetworkToken("", { secretKey: "sk_test_x" })).rejects.toThrow(/non-empty/);
  });
});

// ─── (C) Direct VTS/MDES capability gate ─────────────────────────

describe("provisionNetworkToken", () => {
  it("vts without AXIS_VTS_TOKEN_REQUESTOR_ID → _not_configured naming Token Requestor ID + the env var", async () => {
    stubAllProviderEnvsUnset();
    const r = await provisionNetworkToken({ pan_source: "x", provider: "vts" });
    expect(isNetworkTokenNotConfigured(r)).toBe(true);
    if (isNetworkTokenNotConfigured(r)) {
      expect(r.provider_checked).toBe("vts");
      expect(r.remediation).toMatch(/Token Requestor ID/);
      expect(r.remediation).toContain("AXIS_VTS_TOKEN_REQUESTOR_ID");
    }
  });

  it("mdes without AXIS_MDES_TOKEN_REQUESTOR_ID → _not_configured naming Token Requestor ID + the env var", async () => {
    stubAllProviderEnvsUnset();
    const r = await provisionNetworkToken({ pan_source: "x", provider: "mdes" });
    expect(isNetworkTokenNotConfigured(r)).toBe(true);
    if (isNetworkTokenNotConfigured(r)) {
      expect(r.provider_checked).toBe("mdes");
      expect(r.remediation).toMatch(/Token Requestor ID/);
      expect(r.remediation).toContain("AXIS_MDES_TOKEN_REQUESTOR_ID");
    }
  });

  it("NEVER fakes a token: with the TRID set, vts still returns _not_configured naming the remaining onboarding gate", async () => {
    stubAllProviderEnvsUnset();
    vi.stubEnv("AXIS_VTS_TOKEN_REQUESTOR_ID", "trid_visa_1");
    const r = await provisionNetworkToken({ pan_source: "x", provider: "vts" });
    expect(isNetworkTokenNotConfigured(r)).toBe(true);
    if (isNetworkTokenNotConfigured(r)) {
      expect(r.provider_checked).toBe("vts");
      expect(r.reason).toMatch(/onboarding|credentials/i);
    }
  });

  it("provider 'stripe' delegates to readStripeNetworkToken (envelope when no key)", async () => {
    stubAllProviderEnvsUnset();
    const r = await provisionNetworkToken({ pan_source: "pm_1", provider: "stripe" });
    expect(isNetworkTokenNotConfigured(r)).toBe(true);
    if (isNetworkTokenNotConfigured(r)) expect(r.provider_checked).toBe("stripe");
  });

  it("rejects an invalid provider and an empty pan_source", async () => {
    await expect(provisionNetworkToken({ pan_source: "x", provider: "visa" as never })).rejects.toThrow(/provider/);
    await expect(provisionNetworkToken({ pan_source: "", provider: "vts" })).rejects.toThrow(/pan_source/);
  });
});

// ─── MCP tool impl (runNetworkTokenization) ──────────────────────

describe("runNetworkTokenization (MCP impl)", () => {
  const unauthedReq = { headers: {} } as unknown as IncomingMessage;
  let authedReq: IncomingMessage;

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("NT", "nt@example.com", "paid");
    const { rawKey } = await createApiKey(acct.account_id);
    authedReq = {
      headers: { authorization: `Bearer ${rawKey}` },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
  });

  it("unauthed req throws an auth error", async () => {
    await expect(runNetworkTokenization({}, unauthedReq)).rejects.toThrow(/Authentication required/);
  });

  // H-Phase-A cycle 10 [SECURITY]: no operation defaults to "read", which is
  // now unconditionally disabled — see the 3 tests below this one. This
  // replaces the old "no provider configured" framing (that gap no longer
  // matters since read/provision never reach the provider check at all).
  it("authed + no operation (defaults to 'read') returns the disabled envelope, regardless of provider config", async () => {
    stubAllProviderEnvsUnset();
    const text = await runNetworkTokenization({}, authedReq);
    const parsed = JSON.parse(text);
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(String(parsed.reason)).toMatch(/no verification that/);
    expect(parsed.capabilities).toEqual({ stripe: false, vts: false, mdes: false });
  });

  // The actual vulnerability this closes: a caller-supplied payment_method_id
  // resolved via the platform's own Stripe key with no check it belongs to
  // the calling account. Stripe IS configured here (unlike every other test
  // in this describe block) — proving the gate fires on the real security-
  // relevant path, not just the already-unconfigured case.
  it("operation=read is disabled even when Stripe IS configured, for ANY payment_method_id (no cross-tenant read)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_real_looking_key");
    const parsed = JSON.parse(await runNetworkTokenization({
      operation: "read",
      payment_method_id: "pm_belongs_to_a_different_account",
    }, authedReq));
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(parsed.provider_checked).toBe("stripe");
    expect(String(parsed.reason)).toMatch(/no verification that/);
    // capabilities still honestly reports stripe:true — this is a same-cycle
    // safety gate, not a claim that Stripe itself is unconfigured.
    expect(parsed.capabilities.stripe).toBe(true);
  });

  it("operation=capabilities reports the config gate without needing a provider", async () => {
    stubAllProviderEnvsUnset();
    const parsed = JSON.parse(await runNetworkTokenization({ operation: "capabilities" }, authedReq));
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(parsed.capabilities).toEqual({ stripe: false, vts: false, mdes: false });
    expect(String(parsed.honesty)).toMatch(/VTS\/MDES/);
  });

  it("operation=lifecycle runs the executable state machine (no provider config needed)", async () => {
    stubAllProviderEnvsUnset();
    const parsed = JSON.parse(await runNetworkTokenization({
      operation: "lifecycle",
      events: ["provision", "activate", "suspend", "resume", "delete"],
    }, authedReq));
    expect(parsed.lifecycle.state).toBe("deleted");
    expect(parsed.lifecycle.history.map((h: { to: string }) => h.to)).toEqual([
      "provisioned", "active", "suspended", "active", "deleted",
    ]);
  });

  it("operation=lifecycle rejects an illegal sequence", async () => {
    stubAllProviderEnvsUnset();
    await expect(runNetworkTokenization({
      operation: "lifecycle",
      events: ["provision", "resume"],
    }, authedReq)).rejects.toThrow(/illegal transition/);
    await expect(runNetworkTokenization({
      operation: "lifecycle",
      events: ["activate"],
    }, authedReq)).rejects.toThrow(/illegal transition/);
  });

  // H-Phase-A cycle 10 [SECURITY]: provision took a caller-supplied
  // pan_source (an opaque reference such as a Stripe pm_… id) with no check
  // it belongs to the calling account — same gap as `read`, now disabled
  // BEFORE the provider arg is even consulted (provider_checked is always
  // "stripe" here, not "vts", proving the gate fires ahead of that branch).
  it("operation=provision is disabled regardless of provider/pan_source — no ownership check exists to verify pan_source belongs to the caller", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_real_looking_key");
    vi.stubEnv("AXIS_VTS_TOKEN_REQUESTOR_ID", "trid_visa_1");
    const parsed = JSON.parse(await runNetworkTokenization({
      operation: "provision", provider: "vts", pan_source: "pm_belongs_to_a_different_account",
    }, authedReq));
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(parsed.provider_checked).toBe("stripe"); // the gate's own fixed value — provider arg never reached
    expect(String(parsed.reason)).toMatch(/no verification that/);
  });
});

// ─── Registration + dispatch wiring ──────────────────────────────

describe("iliad_network_tokenization registration", () => {
  it("the tool descriptor is present in MCP_TOOLS and the pinned count matches (no drift)", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("iliad_network_tokenization");
    expect(MCP_TOOL_COUNT).toBe(MCP_TOOLS.length);
  });

  it("the descriptor discloses the stripe-live / VTS-MDES-gated honesty split", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "iliad_network_tokenization")!;
    expect(tool.description).toContain("Token Requestor ID");
    expect(tool.description).toContain("AXIS_VTS_TOKEN_REQUESTOR_ID");
    expect(tool.description).toContain("AXIS_MDES_TOKEN_REQUESTOR_ID");
    expect(tool.description).toMatch(/NEVER fakes a token/);
  });

  // Generous timeout: tools/call walks auth + telemetry + usage-credit DB reads.
  it("dispatches through the MCP tools/call switch (was 'Unknown tool')", { timeout: 30_000 }, async () => {
    stubAllProviderEnvsUnset();
    await resetTestDb();
    const acct = await createAccount("NTD", "ntd@example.com", "paid");
    const { rawKey } = await createApiKey(acct.account_id);
    const req = {
      headers: { authorization: `Bearer ${rawKey}` },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    const rpc = (await dispatch("tools/call", { name: "iliad_network_tokenization", arguments: {} }, 1, req)) as {
      result: { content: Array<{ text: string }>; isError?: boolean; _usage?: { tool?: string } };
    };
    const text = rpc.result.content[0].text;
    expect(text).not.toContain("Unknown tool");
    const parsed = JSON.parse(text);
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(rpc.result._usage?.tool).toBe("iliad_network_tokenization");
  });
});
