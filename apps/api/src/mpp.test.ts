/**
 * Tests for mpp.ts — mppx Machine Payments Protocol integration
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { chargeMpp, resetMppxCache } from "./mpp.js";
import { resolveAgentMode, priceForMode, getPricingTier, build402NegotiationBody, PRICING_TIERS } from "./mpp.js";
import { resolveAuth } from "./billing.js";
import { ErrorCode } from "./logger.js";

// ---------------------------------------------------------------------------
// Minimal HTTP server helpers
// ---------------------------------------------------------------------------

function startServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      chargeMpp(req, res, {
        amount: "100",
        currency: "usd",
        decimals: 2,
        description: "Axis' Iliad - $1.00",
        meta: { test: "true" },
      }).then((result) => {
        if (!result || result.status === 402) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server)); // OS-assigned port
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

function serverPort(server: http.Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return addr.port;
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function fetchFrom(
  server: http.Server,
  path: string,
  opts?: FetchOptions,
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const port = serverPort(server);
  const url = "http://127.0.0.1:" + port + path;
  const method = opts?.method ?? "POST";
  const hasBody = method !== "GET" && method !== "HEAD";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...(hasBody ? { body: opts?.body ?? JSON.stringify({ repo_url: "https://github.com/test/repo" }) } : {}),
  });
  const ct = res.headers.get("content-type") ?? "";
  const body =
    ct.includes("application/json") || ct.includes("problem+json")
      ? await res.json()
      : await res.text();
  return { status: res.status, headers: res.headers, body };
}

// ---------------------------------------------------------------------------
// chargeMpp - no STRIPE_SECRET_KEY
// ---------------------------------------------------------------------------

describe("chargeMpp -- no STRIPE_SECRET_KEY", () => {
  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    resetMppxCache();
  });

  it("returns null when STRIPE_SECRET_KEY is not set", async () => {
    const req = { headers: {}, method: "POST" } as unknown as http.IncomingMessage;
    const res = { writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
    const result = await chargeMpp(req, res, {
      amount: "1.00",
      currency: "usd",
      decimals: 2,
      description: "test",
      meta: {},
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// chargeMpp - with STRIPE_SECRET_KEY (Stripe SPT)
// ---------------------------------------------------------------------------

describe("chargeMpp -- with STRIPE_SECRET_KEY (Stripe SPT)", () => {
  let server: http.Server;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_mpp_tests";
    delete process.env.TEMPO_RECIPIENT_ADDRESS;
    resetMppxCache();
    server = await startServer();
  });

  afterEach(async () => {
    await stopServer(server);
    delete process.env.STRIPE_SECRET_KEY;
    resetMppxCache();
  });

  it("returns HTTP 402 when no payment credential is presented", async () => {
    const { status } = await fetchFrom(server, "/analyze");
    expect(status).toBe(402);
  });

  it("response body follows MPP RFC 9457 format (paymentauth.org)", async () => {
    const { body } = await fetchFrom(server, "/analyze");
    expect((body as Record<string, unknown>).type).toBe(
      "https://paymentauth.org/problems/payment-required",
    );
    expect((body as Record<string, unknown>).title).toBe("Payment Required");
    expect((body as Record<string, unknown>).status).toBe(402);
  });

  it("response body includes a challengeId", async () => {
    const { body } = await fetchFrom(server, "/analyze");
    expect(typeof (body as Record<string, unknown>).challengeId).toBe("string");
    expect(((body as Record<string, unknown>).challengeId as string).length).toBeGreaterThan(0);
  });

  it("response Content-Type is application/problem+json (RFC 9457)", async () => {
    const { headers } = await fetchFrom(server, "/analyze");
    const ct = headers.get("content-type") ?? "";
    expect(ct).toContain("problem+json");
  });

  it("response includes WWW-Authenticate header with stripe scheme", async () => {
    const { headers } = await fetchFrom(server, "/analyze");
    const auth = headers.get("www-authenticate") ?? "";
    expect(auth.toLowerCase()).toContain("stripe");
  });

  it("returns a new unique challengeId on each request", async () => {
    const { body: b1 } = await fetchFrom(server, "/analyze");
    const { body: b2 } = await fetchFrom(server, "/analyze");
    const id1 = (b1 as Record<string, unknown>).challengeId;
    const id2 = (b2 as Record<string, unknown>).challengeId;
    expect(id1).not.toBe(id2);
  });

  it("GET requests also return 402 challenge", async () => {
    const { status } = await fetchFrom(server, "/analyze", { method: "GET", body: undefined });
    expect(status).toBe(402);
  });
});

// ---------------------------------------------------------------------------
// chargeMpp - with TEMPO_RECIPIENT_ADDRESS
// ---------------------------------------------------------------------------

describe("chargeMpp -- with TEMPO_RECIPIENT_ADDRESS", () => {
  let server: http.Server;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_mpp_tests";
    process.env.TEMPO_RECIPIENT_ADDRESS = "0xDeAdBeEf00000000000000000000000000000001";
    resetMppxCache();
    server = await startServer();
  });

  afterEach(async () => {
    await stopServer(server);
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.TEMPO_RECIPIENT_ADDRESS;
    resetMppxCache();
  });

  it("returns 402 with both stripe and tempo in WWW-Authenticate", async () => {
    const { headers } = await fetchFrom(server, "/analyze");
    const auth = (headers.get("www-authenticate") ?? "").toLowerCase();
    expect(auth).toContain("stripe");
    expect(auth).toContain("tempo");
  });
});

// ---------------------------------------------------------------------------
// resolveAuth - X-Axis-Key fallback
// ---------------------------------------------------------------------------

describe("resolveAuth -- X-Axis-Key fallback", () => {
  it("returns anonymous when neither Authorization nor X-Axis-Key is present", () => {
    const req = { headers: {} } as unknown as http.IncomingMessage;
    const result = resolveAuth(req);
    expect(result.anonymous).toBe(true);
  });

  it("returns invalid (not anonymous) when X-Axis-Key contains an invalid key", () => {
    const req = {
      headers: { "x-axis-key": "invalid_key_that_does_not_exist" },
    } as unknown as http.IncomingMessage;
    const result = resolveAuth(req);
    expect(result.anonymous).toBe(false);
    expect(result.account).toBeNull();
  });

  it("returns anonymous when X-Axis-Key is empty string", () => {
    const req = {
      headers: { "x-axis-key": "" },
    } as unknown as http.IncomingMessage;
    const result = resolveAuth(req);
    expect(result.anonymous).toBe(true);
  });

  it("prefers Authorization: Bearer over X-Axis-Key when both present", () => {
    const req = {
      headers: {
        authorization: "Bearer invalid_bearer_token",
        "x-axis-key": "also_invalid",
      },
    } as unknown as http.IncomingMessage;
    const result = resolveAuth(req);
    // Authorization header takes precedence; invalid key -> not anonymous
    expect(result.anonymous).toBe(false);
    expect(result.account).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ErrorCode enum
// ---------------------------------------------------------------------------

describe("ErrorCode.PAYMENT_REQUIRED", () => {
  it("is defined and equals PAYMENT_REQUIRED string", () => {
    expect(ErrorCode.PAYMENT_REQUIRED).toBe("PAYMENT_REQUIRED");
  });
});

// ─── Engineer tier (E0): X-Agent-Mode: engineer as a 3rd MPP mode ───
describe("X-Agent-Mode: engineer tier", () => {
  function reqWithMode(mode?: string): http.IncomingMessage {
    return { headers: mode ? { "x-agent-mode": mode } : {} } as unknown as http.IncomingMessage;
  }

  it("resolveAgentMode parses engineer / lite / standard", () => {
    expect(resolveAgentMode(reqWithMode("engineer"))).toBe("engineer");
    expect(resolveAgentMode(reqWithMode("lite"))).toBe("lite");
    expect(resolveAgentMode(reqWithMode("standard"))).toBe("standard");
    expect(resolveAgentMode(reqWithMode())).toBe("standard");
  });

  it("priceForMode returns the engineer price when a tool defines one", () => {
    const tier = getPricingTier("iliad_object_storage");
    expect(tier.engineer_cents).toBe(5);
    expect(priceForMode(tier, "engineer")).toBe(5);
    expect(priceForMode(tier, "standard")).toBe(tier.standard_cents);
    expect(priceForMode(tier, "lite")).toBe(tier.lite_cents);
  });

  it("priceForMode falls back to standard for tools without an engineer price (flag is always safe)", () => {
    const tier = getPricingTier("iliad_transactional_email");
    expect(tier.engineer_cents).toBeUndefined();
    expect(priceForMode(tier, "engineer")).toBe(tier.standard_cents);
  });

  it("the 402 body advertises the engineer tier only when present", () => {
    const withEng = build402NegotiationBody("iliad_web_search");
    const eng = (withEng.pricing as Record<string, unknown>).engineer as Record<string, unknown> | undefined;
    expect(eng).toBeDefined();
    expect(eng!.amount_cents).toBe(25);
    expect(String(eng!.how)).toContain("X-Agent-Mode: engineer");

    const withoutEng = build402NegotiationBody("iliad_transactional_email");
    expect((withoutEng.pricing as Record<string, unknown>).engineer).toBeUndefined();
  });

  it("every engineer_cents is a STRICT premium over standard (no inverted/under-charging ladder)", () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      if (tier.engineer_cents !== undefined) {
        // An engineer tier must cost more than standard — otherwise X-Agent-Mode:
        // engineer under-charges. Only price tiers whose engineer behavior ships.
        expect(tier.engineer_cents, `${tier.tool} engineer_cents must exceed standard_cents`).toBeGreaterThan(tier.standard_cents);
        expect(tier.engineer_description, `${tier.tool} engineer_description`).toBeTruthy();
      }
    }
  });

  it("only the IMPLEMENTED engineer tools carry an engineer price", () => {
    const priced = Object.values(PRICING_TIERS).filter(t => t.engineer_cents !== undefined).map(t => t.tool).sort();
    // E1 hygiene, E2 object_storage, E3 web_search are built; analyze_repo (E5),
    // prepare_agentic_purchasing (E9), embeddings (E12) are NOT — they must not
    // advertise/charge an engineer tier until their handler implements it.
    expect(priced).toEqual(["iliad_hygiene", "iliad_object_storage", "iliad_web_search"]);
  });
});
