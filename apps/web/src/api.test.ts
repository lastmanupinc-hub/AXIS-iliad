import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  getGeneratedFiles,
  runProgram,
  analyzeGitHubUrl,
  healthCheck,
  getExportUrl,
  createAccount,
  getAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsage,
  updateTier,
  getPlans,
  listSeats,
  inviteSeat,
  revokeSeat,
  type SnapshotPayload,
} from "./api.ts";

// ─── Mock infrastructure ────────────────────────────────────────

let mockStorage: Record<string, string> = {};
const storageMock = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { mockStorage = {}; },
  get length() { return Object.keys(mockStorage).length; },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
};

function mockFetch(body: unknown, status = 200, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: {
      get: (name: string) => headers?.[name] ?? null,
    },
  });
}

beforeEach(() => {
  mockStorage = {};
  vi.stubGlobal("localStorage", storageMock);
  vi.stubGlobal("AbortController", class {
    signal = {};
    abort() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getExportUrl ───────────────────────────────────────────────

describe("getExportUrl", () => {
  it("builds URL without program filter", () => {
    expect(getExportUrl("proj123")).toBe("/v1/projects/proj123/export");
  });

  it("builds URL with program filter", () => {
    expect(getExportUrl("proj123", "search")).toBe(
      "/v1/projects/proj123/export?program=search",
    );
  });

  it("encodes program names with special characters", () => {
    const url = getExportUrl("proj123", "my program");
    expect(url).toContain("program=my%20program");
  });
});

// ─── fetchJSON + authHeaders (tested indirectly via API calls) ──

describe("fetchJSON auth headers", () => {
  it("sends Content-Type without auth key", async () => {
    const fetchFn = mockFetch({ status: "ok" });
    vi.stubGlobal("fetch", fetchFn);

    await healthCheck();

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBeUndefined();
  });

  it("sends Authorization when api key is stored", async () => {
    mockStorage["axis_api_key"] = "axis_test123";
    const fetchFn = mockFetch({ status: "ok", version: "1.0" });
    vi.stubGlobal("fetch", fetchFn);

    await healthCheck();

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer axis_test123");
  });
});

describe("fetchJSON error handling", () => {
  it("throws on non-OK response with JSON error", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Not found" }, 404));

    await expect(healthCheck()).rejects.toThrow("Not found");
  });

  it("throws with status code on non-JSON error", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("parse err")),
      text: () => Promise.resolve("Internal Server Error"),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    await expect(healthCheck()).rejects.toThrow("Internal Server Error");
  });

  it("throws 'Request timed out' on abort", async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      new DOMException("signal is aborted", "AbortError"),
    );
    vi.stubGlobal("fetch", fetchFn);

    await expect(healthCheck()).rejects.toThrow("Request timed out");
  });
});

// ─── Snapshot API ───────────────────────────────────────────────

describe("createSnapshot", () => {
  it("sends POST with payload", async () => {
    const response = { snapshot_id: "s1", project_id: "p1", status: "complete", context_map: {}, repo_profile: {}, generated_files: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const payload: SnapshotPayload = {
      input_method: "manual_file_upload",
      manifest: { project_name: "test", project_type: "web_application", frameworks: [], goals: ["test"], requested_outputs: [] },
      files: [{ path: "index.ts", content: "export {}", size: 10 }],
    };

    const result = await createSnapshot(payload);

    expect(result.snapshot_id).toBe("s1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/snapshots");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(payload);
  });
});

describe("getGeneratedFiles", () => {
  it("calls correct URL with project ID", async () => {
    const response = { snapshot_id: "s1", project_id: "p1", generated_at: "", files: [], skipped: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    await getGeneratedFiles("proj_abc");

    expect(fetchFn.mock.calls[0][0]).toBe("/v1/projects/proj_abc/generated-files");
  });
});

describe("runProgram", () => {
  it("sends POST with snapshot_id", async () => {
    const response = { program: "search", files: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await runProgram("search/export", "snap123");

    expect(result.program).toBe("search");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/search/export");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ snapshot_id: "snap123" });
  });
});

describe("analyzeGitHubUrl", () => {
  it("sends POST with github_url", async () => {
    const response = { snapshot_id: "s1", project_id: "p1", status: "complete", context_map: {}, repo_profile: {}, generated_files: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    await analyzeGitHubUrl("https://github.com/foo/bar");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/github/analyze");
    expect(JSON.parse(init.body)).toEqual({ github_url: "https://github.com/foo/bar" });
  });
});

// ─── Billing API ────────────────────────────────────────────────

describe("createAccount", () => {
  it("sends name and email", async () => {
    const response = { account: { account_id: "a1" }, api_key: { key_id: "k1", raw_key: "axis_abc", label: "default" } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await createAccount("Alice", "alice@example.com");

    expect(result.api_key.raw_key).toBe("axis_abc");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ name: "Alice", email: "alice@example.com" });
  });
});

describe("getAccount", () => {
  it("unwraps account from nested response", async () => {
    const fetchFn = mockFetch({ account: { account_id: "a1", name: "Bob", email: "bob@test.com", tier: "free" } });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getAccount();
    expect(result.name).toBe("Bob");
  });

  it("handles flat response shape", async () => {
    const fetchFn = mockFetch({ account_id: "a2", name: "Carol", email: "carol@test.com", tier: "paid" });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getAccount();
    expect(result.name).toBe("Carol");
  });
});

describe("createApiKey", () => {
  it("sends label", async () => {
    const fetchFn = mockFetch({ key_id: "k2", raw_key: "axis_xyz", label: "ci" });
    vi.stubGlobal("fetch", fetchFn);

    const result = await createApiKey("ci");
    expect(result.label).toBe("ci");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ label: "ci" });
  });
});

describe("listApiKeys", () => {
  it("calls correct endpoint", async () => {
    const fetchFn = mockFetch({ keys: [] });
    vi.stubGlobal("fetch", fetchFn);

    await listApiKeys();
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/keys");
  });
});

describe("revokeApiKey", () => {
  it("sends POST to revoke endpoint", async () => {
    const fetchFn = mockFetch({});
    vi.stubGlobal("fetch", fetchFn);

    await revokeApiKey("key123");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/keys/key123/revoke");
    expect(fetchFn.mock.calls[0][1].method).toBe("POST");
  });
});

describe("getUsage", () => {
  it("transforms nested response to flat shape", async () => {
    const fetchFn = mockFetch({ tier: "paid", totals: { runs: 42 }, programs: [{ program: "search", total_runs: 10, total_generators: 5, total_input_files: 100, total_input_bytes: 500000 }] });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getUsage();
    expect(result.tier).toBe("paid");
    expect(result.monthly_snapshots).toBe(42);
    expect(result.by_program).toHaveLength(1);
    expect(result.by_program[0].program).toBe("search");
  });

  it("handles missing totals and programs", async () => {
    const fetchFn = mockFetch({ tier: "free" });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getUsage();
    expect(result.monthly_snapshots).toBe(0);
    expect(result.project_count).toBe(0);
    expect(result.by_program).toEqual([]);
  });
});

describe("updateTier", () => {
  it("sends tier in POST body", async () => {
    const fetchFn = mockFetch({ account: { tier: "paid" } });
    vi.stubGlobal("fetch", fetchFn);

    await updateTier("paid");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ tier: "paid" });
  });
});

// ─── Plans API ──────────────────────────────────────────────────

describe("getPlans", () => {
  it("calls /v1/plans", async () => {
    const fetchFn = mockFetch({ plans: [], features: [] });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getPlans();
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/plans");
    expect(result.plans).toEqual([]);
  });
});

// ─── Seats API ──────────────────────────────────────────────────

describe("listSeats", () => {
  it("calls correct endpoint", async () => {
    const fetchFn = mockFetch({ seats: [], count: 0, limit: 5, remaining: 5 });
    vi.stubGlobal("fetch", fetchFn);

    const result = await listSeats();
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/seats");
    expect(result.remaining).toBe(5);
  });
});

describe("inviteSeat", () => {
  it("sends email and default role", async () => {
    const fetchFn = mockFetch({ seat: { seat_id: "s1", email: "dev@test.com", role: "member" } });
    vi.stubGlobal("fetch", fetchFn);

    await inviteSeat("dev@test.com");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ email: "dev@test.com", role: "member" });
  });

  it("sends custom role", async () => {
    const fetchFn = mockFetch({ seat: { seat_id: "s2", email: "admin@test.com", role: "admin" } });
    vi.stubGlobal("fetch", fetchFn);

    await inviteSeat("admin@test.com", "admin");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.role).toBe("admin");
  });
});

describe("revokeSeat", () => {
  it("sends POST to revoke endpoint", async () => {
    const fetchFn = mockFetch({});
    vi.stubGlobal("fetch", fetchFn);

    await revokeSeat("seat123");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/seats/seat123/revoke");
    expect(fetchFn.mock.calls[0][1].method).toBe("POST");
  });
});
