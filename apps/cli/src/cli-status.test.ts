import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";

// Redirect ~ to a throwaway dir so the REAL credential store (encryption and
// all) round-trips without touching the developer's ~/.axis/config.json.
// (vi.hoisted runs before any import, so only globals are available here.)
const TMP_HOME = vi.hoisted(
  () => `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/axis-cli-home-${Math.random().toString(36).slice(2, 10)}`,
);

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => TMP_HOME, default: { ...actual, homedir: () => TMP_HOME } };
});

import { fetchAccountStatus, mapAccountPayload } from "./status.js";
import { loadConfig, saveConfig } from "./credential-store.js";
import { main } from "./cli.js";

// ─── Local stub API ─────────────────────────────────────────────

let server: Server | undefined;
let baseUrl: string;

function startStub(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolveUrl) => {
    const s = createServer(handler);
    server = s;
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolveUrl(baseUrl);
    });
  });
}

const REAL_SHAPE = {
  account: { account_id: "acc_1", tier: "paid" },
  entitlements: ["search", "skills"],
  usage_credits: {
    plan_id: "pro_29",
    month_key: "2026-07",
    monthly_allowance: 100,
    included_credits_used: 7,
    included_credits_remaining: 93,
    overage_credits_this_month: 2,
  },
  quota: { tier: "paid", snapshots_this_month: 3, max_snapshots_per_month: 100 },
};

const savedArgv = process.argv;
const savedEnv = { key: process.env.AXIS_API_KEY, url: process.env.AXIS_API_URL };
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mkdirSync(TMP_HOME, { recursive: true });
  process.exitCode = undefined;
  delete process.env.AXIS_API_KEY;
  delete process.env.AXIS_API_URL;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  process.argv = savedArgv;
  process.exitCode = undefined;
  if (savedEnv.key !== undefined) process.env.AXIS_API_KEY = savedEnv.key;
  if (savedEnv.url !== undefined) process.env.AXIS_API_URL = savedEnv.url;
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(TMP_HOME, { recursive: true, force: true });
  const s = server;
  server = undefined;
  if (s?.listening) await new Promise<void>((resolve) => s.close(() => resolve()));
});

// ─── mapAccountPayload ──────────────────────────────────────────

describe("mapAccountPayload", () => {
  it("maps the real GET /v1/account shape", () => {
    const { plan, usage } = mapAccountPayload(REAL_SHAPE);
    expect(plan).toBe("paid");
    expect(usage).toEqual({ calls: 9, period: "2026-07" }); // 7 included + 2 overage
  });

  it("maps the simple stub shape { plan, usage }", () => {
    const { plan, usage } = mapAccountPayload({ plan: "free", usage: { calls: 12, period: "2026-07" } });
    expect(plan).toBe("free");
    expect(usage).toEqual({ calls: 12, period: "2026-07" });
  });

  it("falls back to quota when usage_credits is absent", () => {
    const { plan, usage } = mapAccountPayload({ quota: { tier: "free", snapshots_this_month: 4 } });
    expect(plan).toBe("free");
    expect(usage).toEqual({ calls: 4, period: "this month" });
  });

  it("returns empty mapping for junk payloads", () => {
    expect(mapAccountPayload(null)).toEqual({});
    expect(mapAccountPayload("nope")).toEqual({});
    expect(mapAccountPayload({})).toEqual({ plan: undefined, usage: undefined });
  });
});

// ─── fetchAccountStatus ─────────────────────────────────────────

describe("fetchAccountStatus", () => {
  it("returns reachable+authenticated with plan/usage from a live stub", async () => {
    await startStub((req, res) => {
      expect(req.url).toBe("/v1/account");
      expect(req.headers.authorization).toBe("Bearer axis_test_key");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(REAL_SHAPE));
    });

    const status = await fetchAccountStatus(baseUrl, "axis_test_key");
    expect(status).toMatchObject({
      reachable: true,
      authenticated: true,
      plan: "paid",
      usage: { calls: 9, period: "2026-07" },
      api_url: baseUrl,
    });
    expect(status.error).toBeUndefined();
  });

  it("accepts the simple {plan,usage} stub shape", async () => {
    await startStub((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ plan: "free", usage: { calls: 2, period: "2026-07" } }));
    });
    const status = await fetchAccountStatus(baseUrl, "axis_k");
    expect(status.reachable).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.plan).toBe("free");
    expect(status.usage?.calls).toBe(2);
  });

  it("reports 401 as reachable but unauthenticated (never throws)", async () => {
    await startStub((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end("{}");
    });
    const status = await fetchAccountStatus(baseUrl, "axis_bad");
    expect(status.reachable).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain("401");
  });

  it("explains a missing key on 401 without a key", async () => {
    await startStub((_req, res) => {
      res.writeHead(401);
      res.end("{}");
    });
    const status = await fetchAccountStatus(baseUrl);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain("auth");
  });

  it("degrades on non-JSON 200 responses", async () => {
    await startStub((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>not json</html>");
    });
    const status = await fetchAccountStatus(baseUrl, "axis_k");
    expect(status.reachable).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain("non-JSON");
  });

  it("reports unreachable hosts without throwing", async () => {
    const status = await fetchAccountStatus("http://127.0.0.1:1", "axis_k", 1500);
    expect(status.reachable).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.error).toBeTruthy();
  });

  it("times out slow servers honestly", async () => {
    await startStub(() => {
      /* never respond */
    });
    const status = await fetchAccountStatus(baseUrl, "axis_k", 150);
    expect(status.reachable).toBe(false);
    expect(status.error).toContain("timed out");
  });

  it("reports unexpected HTTP statuses", async () => {
    await startStub((_req, res) => {
      res.writeHead(500);
      res.end("{}");
    });
    const status = await fetchAccountStatus(baseUrl, "axis_k");
    expect(status.reachable).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain("500");
  });
});

// ─── status command via main() ──────────────────────────────────

describe("status command", () => {
  it("prints plan and usage against a stub server and exits 0", async () => {
    await startStub((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(REAL_SHAPE));
    });
    saveConfig({ api_key: "axis_saved_key", api_url: baseUrl });

    process.argv = ["node", "axis", "status"];
    main();
    await vi.waitFor(() => {
      const output = logSpy.mock.calls.map(([a]) => a).join("\n");
      expect(output).toContain("Plan:       paid");
    });

    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Reachable:  yes");
    expect(output).toContain("authenticated (axis_saved");
    expect(output).toContain("9 credits used (2026-07)");
    expect(process.exitCode).toBeUndefined(); // exit 0
  });

  it("prints an explicit unreachable line and still exits 0", async () => {
    saveConfig({ api_key: "axis_saved_key", api_url: "http://127.0.0.1:1" });

    process.argv = ["node", "axis", "status"];
    main();
    await vi.waitFor(() => {
      const output = logSpy.mock.calls.map(([a]) => a).join("\n");
      expect(output).toContain("Reachable:  no");
    });
    expect(process.exitCode).toBeUndefined(); // honest degradation, not an error
  });

  it("prints an explicit not-configured line without a key and exits 0", async () => {
    saveConfig({ api_url: "http://127.0.0.1:1" });

    process.argv = ["node", "axis", "status"];
    main();
    await vi.waitFor(() => {
      const output = logSpy.mock.calls.map(([a]) => a).join("\n");
      expect(output).toContain("no API key configured");
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("honors AXIS_API_URL and --api-key overrides", async () => {
    await startStub((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ plan: req.headers.authorization === "Bearer axis_override" ? "suite" : "free" }));
    });
    process.env.AXIS_API_URL = baseUrl;

    process.argv = ["node", "axis", "status", "--api-key", "axis_override"];
    main();
    await vi.waitFor(() => {
      const output = logSpy.mock.calls.map(([a]) => a).join("\n");
      expect(output).toContain("Plan:       suite");
    });
  });
});

// ─── auth --key persistence (real credential store, temp home) ──

describe("auth --key", () => {
  it("persists the key: loadConfig().api_key === the given key", () => {
    process.argv = ["node", "axis", "auth", "--key", "axis_testkey123"];
    main();
    expect(process.exitCode).toBeUndefined();
    expect(loadConfig().api_key).toBe("axis_testkey123");
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("API key encrypted and saved");
  });

  it("accepts --api-key as an alias", () => {
    process.argv = ["node", "axis", "auth", "--api-key", "axis_alias456"];
    main();
    expect(loadConfig().api_key).toBe("axis_alias456");
  });

  it("rejects keys without the axis_ prefix", () => {
    process.argv = ["node", "axis", "auth", "--key", "sk-wrong-vendor"];
    main();
    expect(process.exitCode).toBe(1);
    expect(loadConfig().api_key).toBeUndefined();
  });

  it("legacy auth login <key> still persists", () => {
    process.argv = ["node", "axis", "auth", "login", "axis_legacy789"];
    main();
    expect(loadConfig().api_key).toBe("axis_legacy789");
  });

  it("auth logout removes the key", () => {
    saveConfig({ api_key: "axis_gone" });
    process.argv = ["node", "axis", "auth", "logout"];
    main();
    expect(loadConfig().api_key).toBeUndefined();
  });
});
