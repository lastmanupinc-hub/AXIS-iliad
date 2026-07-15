import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPaidCheckoutSession,
  getPaidWallet,
  debitPaidWallet,
  PaidError,
  type PaidConfig,
  type CreatePaidCheckoutInput,
  type DebitWalletInput,
} from "./index.js";

// H8.4 — committed, FROZEN golden request/response fixtures for every PAI'D
// endpoint this package calls. Each fixture pins BOTH directions: the exact
// wire request a given input serializes to, and the exact typed result a
// given wire response parses into. A change to either direction that isn't
// also reflected in the fixture fails here — this is the "fixture drift
// breaks tests" contract H8.4 requires. The live canary in
// apps/api/src/paid-live-canary.e2e.test.ts uses these SAME fixtures'
// input shapes against real production PAI'D, so a drift here is exactly
// what that canary would also need to stay in sync with.

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(here, "__fixtures__", "golden");

const CONFIG: PaidConfig = { apiBaseUrl: "https://paid.golden-test/v1", apiKey: "sk_golden_test", merchantId: "acct_golden" };

interface CheckoutFixture {
  endpoint: "createPaidCheckoutSession";
  input: CreatePaidCheckoutInput;
  expected_request: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> };
  response_body: Record<string, unknown>;
  expected_result: Record<string, unknown>;
}

interface WalletReadFixture {
  endpoint: "getPaidWallet";
  input: { developerId: string };
  expected_request: { method: string; path: string; headers: Record<string, string> };
  response_body: Record<string, unknown>;
  expected_result: Record<string, unknown>;
}

interface WalletDebitFixture {
  endpoint: "debitPaidWallet";
  input: { developerId: string; debit: DebitWalletInput };
  expected_request: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> };
  response_body?: Record<string, unknown>;
  expected_result?: Record<string, unknown>;
  response_status?: number;
  expected_error?: { status: number; parsed_body: Record<string, unknown> };
}

function loadFixture<T>(filename: string): T {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, filename), "utf8")) as T;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Same network guard as apps/api/src/paid-client.test.ts — every fetch
  // must be explicitly mocked; an un-mocked call is a test bug, not a
  // silent real network hit.
  fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network call — fetch must be mocked in golden tests"));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("golden fixtures — every committed fixture file is accounted for", () => {
  it("lists exactly the 4 expected golden fixtures (regression guard on the fixture set itself)", () => {
    const files = readdirSync(GOLDEN_DIR).sort();
    expect(files).toEqual([
      "checkout-session.json",
      "wallet-debit-insufficient.json",
      "wallet-debit.json",
      "wallet-read.json",
    ]);
  });
});

describe("golden fixture — checkout-session.json (createPaidCheckoutSession)", () => {
  const fixture = loadFixture<CheckoutFixture>("checkout-session.json");

  it("serializes the fixture input into the exact frozen wire request", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    await createPaidCheckoutSession(fixture.input, CONFIG);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CONFIG.apiBaseUrl}${fixture.expected_request.path}`);
    expect((init.method ?? "GET").toUpperCase()).toBe(fixture.expected_request.method);
    expect(init.headers).toMatchObject({
      ...fixture.expected_request.headers,
      Authorization: `Bearer ${CONFIG.apiKey}`,
    });
    expect(JSON.parse(init.body as string)).toEqual(fixture.expected_request.body);
  });

  it("parses the fixture wire response into the exact frozen typed result", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    const result = await createPaidCheckoutSession(fixture.input, CONFIG);
    expect(result).toEqual(fixture.expected_result);
  });

  it("a different input amount changes the wire body — proves real serialization, not an echoed fixture (tamper guard)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    await createPaidCheckoutSession({ ...fixture.input, amountCents: fixture.input.amountCents + 100 }, CONFIG);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.amount_total_minor).toBe(fixture.input.amountCents + 100);
    expect(body.amount_total_minor).not.toBe(fixture.expected_request.body.amount_total_minor);
  });
});

describe("golden fixture — wallet-read.json (getPaidWallet)", () => {
  const fixture = loadFixture<WalletReadFixture>("wallet-read.json");

  it("builds the exact frozen wire GET request (no body, correct path)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    await getPaidWallet(fixture.input.developerId, CONFIG);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CONFIG.apiBaseUrl}${fixture.expected_request.path}`);
    expect((init.method ?? "GET").toUpperCase()).toBe(fixture.expected_request.method);
    expect(init.body).toBeUndefined();
    expect(init.headers).toMatchObject({
      ...fixture.expected_request.headers,
      Authorization: `Bearer ${CONFIG.apiKey}`,
    });
  });

  it("parses the fixture wire response into the exact frozen typed result", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    const result = await getPaidWallet(fixture.input.developerId, CONFIG);
    expect(result).toEqual(fixture.expected_result);
  });
});

describe("golden fixture — wallet-debit.json (debitPaidWallet, success)", () => {
  const fixture = loadFixture<WalletDebitFixture>("wallet-debit.json");

  it("serializes the fixture input into the exact frozen wire request (snake_case body, Idempotency-Key header)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    await debitPaidWallet(fixture.input.developerId, fixture.input.debit, CONFIG);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CONFIG.apiBaseUrl}${fixture.expected_request.path}`);
    expect((init.method ?? "GET").toUpperCase()).toBe(fixture.expected_request.method);
    expect(init.headers).toMatchObject({
      ...fixture.expected_request.headers,
      Authorization: `Bearer ${CONFIG.apiKey}`,
    });
    expect(JSON.parse(init.body as string)).toEqual(fixture.expected_request.body);
  });

  it("parses the fixture wire response into the exact frozen typed result", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    const result = await debitPaidWallet(fixture.input.developerId, fixture.input.debit, CONFIG);
    expect(result).toEqual(fixture.expected_result);
  });

  it("a different idempotency key changes the header — proves real pass-through, not an echoed fixture (tamper guard)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body));
    await debitPaidWallet(
      fixture.input.developerId,
      { ...fixture.input.debit, idempotencyKey: "different-key-not-in-fixture" },
      CONFIG,
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("different-key-not-in-fixture");
  });
});

describe("golden fixture — wallet-debit-insufficient.json (debitPaidWallet, 402)", () => {
  const fixture = loadFixture<WalletDebitFixture>("wallet-debit-insufficient.json");

  it("serializes the same request shape as a successful debit (the 402 is a response-side concern only)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body, fixture.response_status));
    await expect(debitPaidWallet(fixture.input.developerId, fixture.input.debit, CONFIG)).rejects.toThrow(PaidError);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CONFIG.apiBaseUrl}${fixture.expected_request.path}`);
    expect(JSON.parse(init.body as string)).toEqual(fixture.expected_request.body);
  });

  it("surfaces the 402 as a PaidError carrying the exact InsufficientCreditsBody in its .body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(fixture.response_body, fixture.response_status));
    try {
      await debitPaidWallet(fixture.input.developerId, fixture.input.debit, CONFIG);
      expect.unreachable("debitPaidWallet must throw on a 402 response");
    } catch (err) {
      expect(err).toBeInstanceOf(PaidError);
      const paidErr = err as PaidError;
      expect(paidErr.status).toBe(fixture.expected_error!.status);
      expect(JSON.parse(paidErr.body)).toEqual(fixture.expected_error!.parsed_body);
    }
  });
});
