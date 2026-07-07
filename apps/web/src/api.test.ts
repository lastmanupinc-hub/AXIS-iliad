/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSnapshot,
  getGeneratedFiles,
  getGeneratedFile,
  runProgram,
  analyzeGitHubUrl,
  // WO-P1 — live demo / anon-safe quick analysis
  analyzeQuick,
  healthCheck,
  getExportUrl,
  downloadExport,
  createAccount,
  getAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsage,
  updateTier,
  getPlans,
  getUpgradePrompt,
  dismissUpgradePrompt,
  listSeats,
  inviteSeat,
  revokeSeat,
  searchQuery,
  indexSnapshot,
  searchSymbols,
  getFunnelStatus,
  createCheckout,
  getSubscription,
  cancelSubscription,
  getPaidConfig,
  paidSubscribe,
  establishSession,
  markAuthed,
  migrateLegacyKey,
  // WO-P2 — auth polish (post-auth return-to)
  rememberReturnTo,
  consumeReturnTo,
  // WO-F3 — API client expansion
  listProjects,
  listProjectSnapshots,
  getProjectContext,
  getSnapshotVersions,
  getVersion,
  getDiff,
  isPersistenceCreditsError,
  complianceGradeLetter,
  getUsageTimeseries,
  getChangelog,
  patchAccount,
  deleteAccount,
  getMcpManifest,
  searchMcpTools,
  getOpenApiSpec,
  getStats,
  healthLive,
  healthReady,
  ApiError,
  apiErrorDetails,
  type SnapshotPayload,
} from "./api.ts";

// ─── Mock infrastructure ────────────────────────────────────────

let mockStorage: Record<string, string> = {};
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
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
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
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

describe("session cookie cutover (H1 C2)", () => {
  const MARKER = "__cookie_session__";

  it("authHeaders sends NO Authorization for the cookie-session marker", async () => {
    mockStorage["axis_api_key"] = MARKER;
    const fetchFn = mockFetch({ status: "ok" });
    vi.stubGlobal("fetch", fetchFn);
    await healthCheck();
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["Authorization"]).toBeUndefined();
  });

  it("markAuthed stores the non-sensitive marker, never a raw key", () => {
    markAuthed();
    expect(mockStorage["axis_api_key"]).toBe(MARKER);
  });

  it("establishSession POSTs the key to /v1/auth/session (credentials:include) and stores only the marker", async () => {
    const fetchFn = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetchFn);
    await establishSession("axis_realkey");
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/v1/auth/session");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ api_key: "axis_realkey" });
    expect(mockStorage["axis_api_key"]).toBe(MARKER); // raw key never persisted
  });

  it("establishSession throws and stores nothing on a rejected key", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Invalid api_key" }, 401));
    await expect(establishSession("bad")).rejects.toThrow();
    expect(mockStorage["axis_api_key"]).toBeUndefined();
  });

  it("migrateLegacyKey converts a pre-cutover raw key into a cookie + marker", async () => {
    mockStorage["axis_api_key"] = "axis_legacy";
    const fetchFn = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetchFn);
    await migrateLegacyKey();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/v1/auth/session");
    expect(JSON.parse(init.body)).toEqual({ api_key: "axis_legacy" });
    expect(mockStorage["axis_api_key"]).toBe(MARKER);
  });

  it("migrateLegacyKey is a no-op when already on the marker", async () => {
    mockStorage["axis_api_key"] = MARKER;
    const fetchFn = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetchFn);
    await migrateLegacyKey();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("migrateLegacyKey is a no-op when logged out", async () => {
    const fetchFn = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetchFn);
    await migrateLegacyKey();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("migrateLegacyKey keeps the legacy key as a bearer fallback if the cookie can't be set", async () => {
    mockStorage["axis_api_key"] = "axis_legacy";
    vi.stubGlobal("fetch", mockFetch({ error: "nope" }, 500));
    await migrateLegacyKey(); // must not throw
    expect(mockStorage["axis_api_key"]).toBe("axis_legacy");
  });
});

describe("post-auth return-to (WO-P2)", () => {
  // Deliberately real sessionStorage (not the localStorage mock above) — this
  // is what survives the OAuth provider round trip; localStorage would too,
  // but would also leak the "where to go back to" hint across tabs/sessions.
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("round-trips the remembered hash", () => {
    rememberReturnTo("dashboard");
    expect(consumeReturnTo()).toBe("dashboard");
  });

  it("is one-time use — a second read returns null", () => {
    rememberReturnTo("plans");
    expect(consumeReturnTo()).toBe("plans");
    expect(consumeReturnTo()).toBeNull();
  });

  it("returns null when nothing was recorded", () => {
    expect(consumeReturnTo()).toBeNull();
  });

  it("a later rememberReturnTo overwrites an earlier, unconsumed one", () => {
    rememberReturnTo("account");
    rememberReturnTo("projects");
    expect(consumeReturnTo()).toBe("projects");
  });
});

describe("fetchJSON error handling (WO-F4 hardened)", () => {
  /** Await the rejection and hand back the ApiError for inspection. */
  async function rejectionOf(p: Promise<unknown>): Promise<ApiError> {
    const err = await p.then(
      () => { throw new Error("expected rejection"); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }

  it("throws on non-OK response with JSON error", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Not found" }, 404));

    await expect(healthCheck()).rejects.toThrow("Not found");
  });

  it("never surfaces a raw non-JSON body as the message — human copy + extra.details", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("parse err")),
      text: () => Promise.resolve("<html><body>Internal Server Error at upstream</body></html>"),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    const err = await rejectionOf(healthCheck());
    expect(err.message).toBe("The server hit an unexpected error — try again shortly.");
    expect(err.message).not.toContain("Internal Server Error");
    expect(apiErrorDetails(err)).toContain("Internal Server Error at upstream");
  });

  it("maps a JSON body without an error field to human copy by status, keeping extras", async () => {
    vi.stubGlobal("fetch", mockFetch({ hint: "nope" }, 403));

    const err = await rejectionOf(healthCheck());
    expect(err.message).toBe("You don't have access to that.");
    expect(err.extra["hint"]).toBe("nope");
    expect(apiErrorDetails(err)).toBeNull();
  });

  it("caps preserved raw details at 500 chars", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("parse err")),
      text: () => Promise.resolve("x".repeat(2000)),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    const err = await rejectionOf(healthCheck());
    expect(apiErrorDetails(err)).toHaveLength(500);
  });

  it("keeps the structured error slug intact for guards (persistence_credits_required)", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "persistence_credits_required", credits_needed: 1 }, 402));

    const err = await rejectionOf(healthCheck());
    expect(isPersistenceCreditsError(err)).toBe(true);
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

// ─── analyzeQuick (WO-P1 — POST /v1/analyze, anon-safe live demo) ───

describe("analyzeQuick", () => {
  it("POSTs to /v1/analyze with the given request body", async () => {
    const response = {
      snapshot_id: "s2",
      project_id: "p2",
      status: "ready",
      snapshot_summary: { pro_unlock: "Pro unlock: 15 more programs." },
      analysis: {
        project_name: "demo-repo",
        language: "TypeScript",
        frameworks: ["react"],
        file_count: 3,
        routes_detected: 0,
        domain_models_detected: 0,
        separation_score: 0.5,
      },
      files: [{ path: "AGENTS.md", program: "skills", description: "agent guide", placement: "repo root", adoption_hint: "drop at repo root", content: "# AGENTS.md" }],
      programs_run: 3,
      total_files: 12,
      next_steps: ["Adopt AGENTS.md"],
    };
    const fetchFn = mockFetch(response, 201);
    vi.stubGlobal("fetch", fetchFn);

    const result = await analyzeQuick({
      github_url: "https://github.com/octocat/Hello-World",
      programs: ["search", "skills", "debug"],
    });

    expect(result.analysis.project_name).toBe("demo-repo");
    expect(result.files[0].content).toBe("# AGENTS.md");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/analyze");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      github_url: "https://github.com/octocat/Hello-World",
      programs: ["search", "skills", "debug"],
    });
  });

  it("surfaces a structured ApiError on 401 (anon caller requesting the full bundle)", async () => {
    const fetchFn = mockFetch({ error: "Full AXIS analysis requires authentication.", error_code: "AUTH_REQUIRED" }, 401);
    vi.stubGlobal("fetch", fetchFn);

    const err = await analyzeQuick({ github_url: "https://github.com/foo/bar" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).errorCode).toBe("AUTH_REQUIRED");
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

// ─── getGeneratedFile ───────────────────────────────────────────

describe("getGeneratedFile", () => {
  it("fetches single file as text", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("file content here"),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getGeneratedFile("proj1", "src/index.ts");
    expect(result).toBe("file content here");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/projects/proj1/generated-files/src%2Findex.ts");
  });

  it("throws human copy (never the raw body) on non-OK response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    const err = await getGeneratedFile("proj1", "missing.ts").then(
      () => { throw new Error("expected rejection"); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Not found — it may have been moved or deleted.");
    expect(apiErrorDetails(err)).toBe("Not found");
  });
});

// ─── searchQuery ────────────────────────────────────────────────

describe("searchQuery", () => {
  it("sends POST with query and default limit", async () => {
    const response = { snapshot_id: "s1", query: "foo", total_indexed_lines: 100, total_indexed_files: 5, results: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await searchQuery("snap1", "foo");
    expect(result.query).toBe("foo");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ snapshot_id: "snap1", query: "foo", limit: 50 });
  });

  it("sends custom limit", async () => {
    const fetchFn = mockFetch({ snapshot_id: "s1", query: "bar", total_indexed_lines: 0, total_indexed_files: 0, results: [] });
    vi.stubGlobal("fetch", fetchFn);

    await searchQuery("snap2", "bar", 10);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.limit).toBe(10);
  });
});

// ─── indexSnapshot ──────────────────────────────────────────────

describe("indexSnapshot", () => {
  it("sends POST with snapshot_id", async () => {
    const response = { snapshot_id: "snap1", indexed_files: 42, indexed_lines: 1337 };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await indexSnapshot("snap1");
    expect(result.indexed_files).toBe(42);
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/search/index");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ snapshot_id: "snap1" });
  });
});

// ─── downloadExport ─────────────────────────────────────────────

describe("downloadExport", () => {
  it("triggers a download with filename from Content-Disposition", async () => {
    const blobUrl = "blob:http://localhost/fake";
    let clickCalled = false;
    const fakeAnchor = {
      href: "",
      download: "",
      click: () => { clickCalled = true; },
    };

    vi.stubGlobal("document", {
      createElement: () => fakeAnchor,
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => blobUrl,
      revokeObjectURL: vi.fn(),
    });

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["zip data"])),
      headers: {
        get: (name: string) => name === "Content-Disposition" ? 'attachment; filename="export.zip"' : null,
      },
    });
    vi.stubGlobal("fetch", fetchFn);

    await downloadExport("proj1", "search");
    expect(clickCalled).toBe(true);
    expect(fakeAnchor.href).toBe(blobUrl);
    expect(fakeAnchor.download).toBe("export.zip");
  });

  it("uses default filename when Content-Disposition is absent", async () => {
    const fakeAnchor = { href: "", download: "", click: () => {} };
    vi.stubGlobal("document", { createElement: () => fakeAnchor });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["data"])),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    await downloadExport("proj2");
    expect(fakeAnchor.download).toBe("axis-export.zip");
  });

  it("throws on non-OK response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchFn);

    await expect(downloadExport("proj1")).rejects.toThrow("Export failed: 500");
  });
});

// ─── getUpgradePrompt ───────────────────────────────────────────

describe("getUpgradePrompt", () => {
  it("calls correct endpoint and returns prompt", async () => {
    const response = { prompt: { trigger: "usage", current_tier: "free", recommended_tier: "paid" } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getUpgradePrompt();
    expect(result.prompt).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/upgrade-prompt");
  });

  it("returns null prompt when none available", async () => {
    const fetchFn = mockFetch({ prompt: null });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getUpgradePrompt();
    expect(result.prompt).toBeNull();
  });
});

// ─── dismissUpgradePrompt ───────────────────────────────────────

describe("dismissUpgradePrompt", () => {
  it("sends POST to dismiss endpoint", async () => {
    const fetchFn = mockFetch({ dismissed: true });
    vi.stubGlobal("fetch", fetchFn);

    await dismissUpgradePrompt();
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/upgrade-prompt/dismiss");
    expect(fetchFn.mock.calls[0][1].method).toBe("POST");
  });
});

// ─── getFunnelStatus ────────────────────────────────────────────

describe("getFunnelStatus", () => {
  it("calls correct endpoint and returns status", async () => {
    const response = { account_id: "a1", tier: "free", stage: "signup", recent_events: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getFunnelStatus();
    expect(result.account_id).toBe("a1");
    expect(result.stage).toBe("signup");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/funnel");
  });
});

// ─── Layer 11: AbortError timeout path (api.ts lines 200-203) ───

describe("fetch timeout handling", () => {
  it("converts AbortError to 'Request timed out'", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    await expect(healthCheck()).rejects.toThrow("Request timed out");
  });

  it("re-throws non-AbortError errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(healthCheck()).rejects.toThrow("Request failed");
  });
});

// ─── searchSymbols ───────────────────────────────────────────────

describe("searchSymbols", () => {
  it("sends GET with no query params when opts is omitted", async () => {
    const response = { snapshot_id: "s1", symbol_count: 3, results: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await searchSymbols("snap1");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/search/snap1/symbols");
    expect(result.symbol_count).toBe(3);
  });

  it("sends GET with name, type, and limit when all opts are provided", async () => {
    const response = { snapshot_id: "s1", symbol_count: 1, results: [] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    await searchSymbols("snap2", { name: "handle", type: "function", limit: 10 });
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("name=handle");
    expect(url).toContain("type=function");
    expect(url).toContain("limit=10");
  });
});

// ─── createCheckout ──────────────────────────────────────────────

describe("createCheckout", () => {
  it("POSTs to /v1/checkout with tier and default billing cycle in body", async () => {
    const response = { checkout_url: "https://checkout.stripe.com/pay/cs_test_123", tier: "paid", session_id: "cs_test_123", price_id: "price_paid_123" };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await createCheckout("paid");

    expect(result.checkout_url).toBe("https://checkout.stripe.com/pay/cs_test_123");
    expect(result.tier).toBe("paid");
    expect(result.session_id).toBe("cs_test_123");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/checkout");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ plan_id: "paid", billing_cycle: "monthly" });
  });
});

// ─── getSubscription ─────────────────────────────────────────────

describe("getSubscription", () => {
  it("GETs /v1/account/subscription and returns subscription info", async () => {
    const response = {
      account_id: "acct_1",
      tier: "paid",
      has_active_subscription: true,
      active_subscription: {
        subscription_id: "sub_abc",
        status: "active",
        price_id: "price_paid",
        current_period_start: "2025-01-01T00:00:00Z",
        current_period_end: "2025-02-01T00:00:00Z",
        card_brand: "visa",
        card_last_four: "4242",
        cancel_at: null,
      },
      subscription_count: 1,
    };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getSubscription();

    expect(result.account_id).toBe("acct_1");
    expect(result.has_active_subscription).toBe(true);
    expect(result.active_subscription?.status).toBe("active");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/subscription");
  });
});

// ─── getPaidConfig ───────────────────────────────────────────────

describe("getPaidConfig", () => {
  it("GETs /portal/api/paid/config and returns the config", async () => {
    const response = { configured: true, publishable_key: "pk_test_123", plans: { monthly: true, annual: true } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getPaidConfig();

    expect(result.configured).toBe(true);
    expect(result.publishable_key).toBe("pk_test_123");
    expect(result.plans).toEqual({ monthly: true, annual: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/portal/api/paid/config");
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("returns the unconfigured shape unchanged", async () => {
    const fetchFn = mockFetch({ configured: false, publishable_key: null, plans: { monthly: false, annual: false } });
    vi.stubGlobal("fetch", fetchFn);

    const result = await getPaidConfig();

    expect(result.configured).toBe(false);
    expect(result.publishable_key).toBeNull();
    expect(result.plans).toEqual({ monthly: false, annual: false });
  });
});

// ─── paidSubscribe ───────────────────────────────────────────────

describe("paidSubscribe", () => {
  it("POSTs plan, email, and idempotency_key to /portal/api/subscribe", async () => {
    const response = { subscription_id: "sub_1", client_secret: "pi_secret_1", status: "incomplete", publishable_key: "pk_test_123" };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await paidSubscribe("monthly", "alice@example.com", "idem-123");

    expect(result.subscription_id).toBe("sub_1");
    expect(result.client_secret).toBe("pi_secret_1");
    expect(result.publishable_key).toBe("pk_test_123");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/portal/api/subscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ plan: "monthly", email: "alice@example.com", idempotency_key: "idem-123" });
  });

  it("omits idempotency_key when not provided", async () => {
    const fetchFn = mockFetch({ subscription_id: "sub_2", client_secret: "cs_2", status: "incomplete", publishable_key: "pk" });
    vi.stubGlobal("fetch", fetchFn);

    await paidSubscribe("annual", "bob@example.com");

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ plan: "annual", email: "bob@example.com" });
  });

  it("maps 503 (PAI'D not configured) to ApiError with status and message", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "PAI'D billing is not configured" }, 503));

    const err = await paidSubscribe("monthly", "x@y.com").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).message).toBe("PAI'D billing is not configured");
  });

  it("maps 404 (no account for email) to ApiError", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "No account found for that email" }, 404));

    const err = await paidSubscribe("monthly", "nobody@y.com").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe("No account found for that email");
  });

  it("maps 400 validation errors to ApiError", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "plan must be \"monthly\" or \"annual\"" }, 400));

    const err = await paidSubscribe("monthly", "x@y.com").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });
});

// ─── cancelSubscription ──────────────────────────────────────────

describe("cancelSubscription", () => {
  it("POSTs to /v1/account/subscription/cancel", async () => {
    const response = { subscription_id: "sub_abc", status: "cancelled", message: "Subscription cancelled" };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await cancelSubscription();

    expect(result.subscription_id).toBe("sub_abc");
    expect(result.status).toBe("cancelled");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/account/subscription/cancel");
    expect(init.method).toBe("POST");
  });
});

// ═══ WO-F3 — API client expansion ═══════════════════════════════

// ─── listProjects (WO-A1 mini-spec) ──────────────────────────────

describe("listProjects", () => {
  it("GETs /v1/projects with no params by default", async () => {
    const response = { projects: [], total: 0 };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await listProjects();

    expect(result.total).toBe(0);
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/projects");
  });

  it("passes limit and offset as query params", async () => {
    const fetchFn = mockFetch({ projects: [], total: 42 });
    vi.stubGlobal("fetch", fetchFn);

    await listProjects({ limit: 10, offset: 20 });

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/v1/projects?");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=20");
  });

  it("returns the typed project list", async () => {
    const response = {
      projects: [{
        project_id: "proj_1",
        name: "my-repo",
        github_url: "https://github.com/a/b",
        created_at: "2026-07-01T00:00:00Z",
        latest_snapshot: { snapshot_id: "snap_1", status: "complete", created_at: "2026-07-01T00:00:00Z", file_count: 12, compliance_grade: "B" },
        snapshot_count: 3,
      }],
      total: 1,
    };
    vi.stubGlobal("fetch", mockFetch(response));

    const result = await listProjects();
    expect(result.projects[0].latest_snapshot?.snapshot_id).toBe("snap_1");
    expect(result.projects[0].snapshot_count).toBe(3);
  });
});

// ─── listProjectSnapshots (WO-A2 mini-spec) ──────────────────────

describe("listProjectSnapshots", () => {
  it("GETs /v1/projects/:id/snapshots (id encoded)", async () => {
    const fetchFn = mockFetch({ project_id: "p 1", snapshots: [], count: 0 });
    vi.stubGlobal("fetch", fetchFn);

    await listProjectSnapshots("p 1");

    expect(fetchFn.mock.calls[0][0]).toBe("/v1/projects/p%201/snapshots");
  });
});

// ─── complianceGradeLetter ───────────────────────────────────────

describe("complianceGradeLetter", () => {
  it("passes a bare letter grade through", () => {
    expect(complianceGradeLetter("A+")).toBe("A+");
  });

  it("extracts the letter from the full engine result", () => {
    expect(complianceGradeLetter({ grade: "C", score: 41 })).toBe("C");
  });

  it("returns null for null/undefined", () => {
    expect(complianceGradeLetter(null)).toBeNull();
    expect(complianceGradeLetter(undefined)).toBeNull();
  });
});

// ─── getProjectContext ───────────────────────────────────────────

describe("getProjectContext", () => {
  it("GETs /v1/projects/:id/context", async () => {
    const response = { snapshot_id: "snap_9", context_map: {}, repo_profile: {} };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getProjectContext("proj_9");

    expect(result.snapshot_id).toBe("snap_9");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/projects/proj_9/context");
  });
});

// ─── Version history & diff ──────────────────────────────────────

describe("getSnapshotVersions", () => {
  it("GETs /v1/snapshots/:id/versions", async () => {
    const response = { snapshot_id: "snap_1", versions: [{ version_id: "v1", snapshot_id: "snap_1", version_number: 1, program: null, file_count: 5, created_at: "" }], count: 1 };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getSnapshotVersions("snap_1");

    expect(result.count).toBe(1);
    expect(result.versions[0].version_number).toBe(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/snapshots/snap_1/versions");
  });
});

describe("getVersion", () => {
  it("GETs /v1/snapshots/:id/versions/:n", async () => {
    const response = { version: { version_id: "v2", snapshot_id: "snap_1", version_number: 2, program: "theme", file_count: 1, created_at: "", files: [{ path: "a.md", content: "hi" }] } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getVersion("snap_1", 2);

    expect(result.version.files[0].path).toBe("a.md");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/snapshots/snap_1/versions/2");
  });
});

describe("getDiff", () => {
  it("GETs /v1/snapshots/:id/diff?old=N&new=M", async () => {
    const response = { diff: { old_version: 1, new_version: 2, snapshot_id: "snap_1", files: [], summary: { added: 0, removed: 0, modified: 0, unchanged: 0 } } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getDiff("snap_1", 1, 2);

    expect(result.diff.new_version).toBe(2);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/v1/snapshots/snap_1/diff?");
    expect(url).toContain("old=1");
    expect(url).toContain("new=2");
  });

  it("maps the 402 persistence-credit payload to a recognizable ApiError", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "persistence_credits_required", reason: "balance_exhausted" }, 402));

    const err = await getDiff("snap_1", 1, 2).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).extra.reason).toBe("balance_exhausted");
    expect(isPersistenceCreditsError(err)).toBe(true);
  });
});

describe("isPersistenceCreditsError", () => {
  it("rejects non-402 ApiErrors and non-ApiErrors", () => {
    expect(isPersistenceCreditsError(new ApiError("persistence_credits_required", 404, ""))).toBe(false);
    expect(isPersistenceCreditsError(new ApiError("quota exceeded", 402, "QUOTA"))).toBe(false);
    expect(isPersistenceCreditsError(new Error("persistence_credits_required"))).toBe(false);
  });

  it("accepts a 402 flagged via error_code as well", () => {
    expect(isPersistenceCreditsError(new ApiError("Payment required", 402, "persistence_credits_required"))).toBe(true);
  });
});

// ─── getUsageTimeseries (WO-A3 mini-spec) ────────────────────────

describe("getUsageTimeseries", () => {
  it("defaults to bucket=day&since_days=30", async () => {
    const fetchFn = mockFetch({ buckets: [] });
    vi.stubGlobal("fetch", fetchFn);

    await getUsageTimeseries();

    expect(fetchFn.mock.calls[0][0]).toBe("/v1/account/usage/timeseries?bucket=day&since_days=30");
  });

  it("passes a custom window and clamps it to 365", async () => {
    const fetchFn = mockFetch({ buckets: [] });
    vi.stubGlobal("fetch", fetchFn);

    await getUsageTimeseries({ sinceDays: 14 });
    expect(fetchFn.mock.calls[0][0]).toContain("since_days=14");

    await getUsageTimeseries({ sinceDays: 9999 });
    expect(fetchFn.mock.calls[1][0]).toContain("since_days=365");
  });

  it("returns typed buckets", async () => {
    const response = { buckets: [{ date: "2026-07-01", runs: 4, by_program: { theme: 2 }, credits_spent: 1 }] };
    vi.stubGlobal("fetch", mockFetch(response));

    const result = await getUsageTimeseries();
    expect(result.buckets[0].by_program.theme).toBe(2);
  });
});

// ─── getChangelog (WO-A4 mini-spec) ──────────────────────────────

describe("getChangelog", () => {
  it("GETs /v1/changelog and returns raw markdown text", async () => {
    const fetchFn = mockFetch("## 0.5.3\n- fixed things");
    vi.stubGlobal("fetch", fetchFn);

    const md = await getChangelog();

    expect(md).toBe("## 0.5.3\n- fixed things");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/changelog");
  });

  it("throws a structured ApiError on failure", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Not found" }, 404));

    const err = await getChangelog().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});

// ─── patchAccount / deleteAccount (WO-A5 mini-spec) ──────────────

describe("patchAccount", () => {
  it("PATCHes /v1/account with the update body", async () => {
    const response = { account: { account_id: "a1", name: "New Name", email: "n@x.com", tier: "free", created_at: "" } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await patchAccount({ name: "New Name" });

    expect(result.account.name).toBe("New Name");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/account");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "New Name" });
  });
});

describe("deleteAccount", () => {
  it("DELETEs /v1/account", async () => {
    const fetchFn = mockFetch({ deleted: true });
    vi.stubGlobal("fetch", fetchFn);

    const result = await deleteAccount();

    expect(result.deleted).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/v1/account");
    expect(init.method).toBe("DELETE");
  });
});

// ─── MCP discovery ───────────────────────────────────────────────

describe("getMcpManifest", () => {
  it("GETs /v1/mcp/server.json", async () => {
    const response = { server: { name: "axis", slug: "axis-iliad", version: "0.5.3", endpoint: "https://x/mcp" }, tools: [{ name: "list_programs", description: "d" }] };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getMcpManifest();

    expect(result.server.slug).toBe("axis-iliad");
    expect(result.tools).toHaveLength(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/mcp/server.json");
  });
});

describe("searchMcpTools", () => {
  it("GETs /v1/mcp/tools with no params when unfiltered", async () => {
    const fetchFn = mockFetch({ query: null, program_filter: null, total_matches: 0, results: [] });
    vi.stubGlobal("fetch", fetchFn);

    await searchMcpTools();

    expect(fetchFn.mock.calls[0][0]).toBe("/v1/mcp/tools");
  });

  it("encodes q and program filters", async () => {
    const fetchFn = mockFetch({ query: "docker deploy", program_filter: "deploy", total_matches: 1, results: [] });
    vi.stubGlobal("fetch", fetchFn);

    await searchMcpTools("docker deploy", "deploy");

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/v1/mcp/tools?");
    expect(url).toContain("q=docker+deploy");
    expect(url).toContain("program=deploy");
  });
});

// ─── OpenAPI spec ────────────────────────────────────────────────

describe("getOpenApiSpec", () => {
  it("GETs /openapi.json", async () => {
    const response = { openapi: "3.0.3", info: { title: "AXIS", version: "0.5.3" }, paths: { "/v1/health": {} } };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getOpenApiSpec();

    expect(result.openapi).toBe("3.0.3");
    expect(result.paths["/v1/health"]).toBeDefined();
    expect(fetchFn.mock.calls[0][0]).toBe("/openapi.json");
  });
});

// ─── Stats + health probes ───────────────────────────────────────

describe("getStats", () => {
  it("GETs /v1/stats and returns the counters", async () => {
    const response = { mcp_calls_today: 7, mcp_calls_total: 1234, top_tools: [{ tool: "analyze_repo", count: 5 }], process_started_at: "", date: "2026-07-07" };
    const fetchFn = mockFetch(response);
    vi.stubGlobal("fetch", fetchFn);

    const result = await getStats();

    expect(result.mcp_calls_today).toBe(7);
    expect(result.top_tools[0].tool).toBe("analyze_repo");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/stats");
  });
});

describe("healthLive", () => {
  it("GETs /v1/health/live", async () => {
    const fetchFn = mockFetch({ status: "alive" });
    vi.stubGlobal("fetch", fetchFn);

    const result = await healthLive();

    expect(result.status).toBe("alive");
    expect(fetchFn.mock.calls[0][0]).toBe("/v1/health/live");
  });
});

describe("healthReady", () => {
  it("returns the ready body on 200", async () => {
    const response = { status: "ready", checks: { shutting_down: false, database: "ok", payment_rail: "ok" } };
    vi.stubGlobal("fetch", mockFetch(response));

    const result = await healthReady();
    expect(result.status).toBe("ready");
    expect(result.checks?.database).toBe("ok");
  });

  it("returns (does not throw) the not_ready body on 503 — status page needs it", async () => {
    const response = { status: "not_ready", checks: { shutting_down: false, database: "error", payment_rail: "ok" } };
    vi.stubGlobal("fetch", mockFetch(response, 503));

    const result = await healthReady();
    expect(result.status).toBe("not_ready");
    expect(result.checks?.database).toBe("error");
  });

  it("still throws a structured ApiError on other failures", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "boom" }, 500));

    const err = await healthReady().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});
