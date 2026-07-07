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

  it("authed + no provider configured returns _not_configured:true with tool:'iliad_network_tokenization'", async () => {
    stubAllProviderEnvsUnset();
    const text = await runNetworkTokenization({}, authedReq);
    const parsed = JSON.parse(text);
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(String(parsed.remediation)).toContain("STRIPE_SECRET_KEY");
    expect(parsed.capabilities).toEqual({ stripe: false, vts: false, mdes: false });
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

  it("operation=provision provider=vts returns the gated envelope through the tool surface", async () => {
    stubAllProviderEnvsUnset();
    const parsed = JSON.parse(await runNetworkTokenization({
      operation: "provision", provider: "vts", pan_source: "pm_1",
    }, authedReq));
    expect(parsed._not_configured).toBe(true);
    expect(parsed.tool).toBe("iliad_network_tokenization");
    expect(parsed.provider_checked).toBe("vts");
    expect(String(parsed.remediation)).toMatch(/Token Requestor ID/);
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
