/**
 * Tests for POST /v1/analyze, GET /.well-known/axis.json,
 * and the pure helper functions: adoptionHint, buildNextSteps, detectProjectName.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb, createAccount, createApiKey } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { ARTIFACT_COUNT, PROGRAM_COUNT } from "./counts.js";
import { isPaidArtifact, FREE_GENERATOR_COUNT, TOTAL_GENERATORS } from "@axis/generator-core";
import { MCP_TOOLS } from "./mcp-tools.js";
import {
  handleAnalyze,
  handleWellKnown,
  adoptionHint,
  buildNextSteps,
  detectProjectName,
  PROGRAM_OUTPUTS,
} from "./handlers.js";

// ─── HTTP helper ─────────────────────────────────────────────────

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(authKey ? { "Authorization": `Bearer ${authKey}` } : {}),
          ...(extraHeaders ?? {}),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let server: Server;
let TEST_PORT: number;
let suiteApiKey = "";
let freeApiKey = "";

const minFiles = [
  { path: "package.json", content: '{"name":"test-project","dependencies":{"react":"18.0.0"}}' },
  { path: "src/index.ts", content: 'import React from "react";\nexport const App = () => null;' },
  { path: "README.md", content: "# Test Project\nA test." },
];

beforeAll(async () => {
  await resetTestDb();
  const suite = await createAccount("analyze-suite", "analyze-suite@test.local", "suite");
  suiteApiKey = (await createApiKey(suite.account_id)).rawKey;
  const free = await createAccount("analyze-free", "analyze-free@test.local", "free");
  freeApiKey = (await createApiKey(free.account_id)).rawKey;
  const router = new Router();
  router.post("/v1/analyze", handleAnalyze);
  router.get("/.well-known/axis.json", handleWellKnown);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ─── adoptionHint (pure function) ───────────────────────────────

describe("adoptionHint", () => {
  it("returns known hint for AGENTS.md", () => {
    const hint = adoptionHint("AGENTS.md");
    expect(hint.placement).toBe("repo root");
    expect(hint.adoption_hint).toContain("repo root");
  });

  it("works with prefixed paths (.ai/debug-playbook.md)", () => {
    const hint = adoptionHint(".ai/debug-playbook.md");
    expect(hint.placement).toBeDefined();
    expect(hint.adoption_hint).toBeDefined();
  });

  it("returns known hint for .cursorrules", () => {
    const hint = adoptionHint(".cursorrules");
    expect(hint.placement).toBe("repo root");
    expect(hint.adoption_hint).toContain("Cursor");
  });

  it("returns known hint for mcp-config.json", () => {
    const hint = adoptionHint("mcp-config.json");
    expect(hint.placement).toBe("MCP client config");
    expect(hint.adoption_hint).toContain("MCP");
  });

  it("returns known hint for commerce-registry.json", () => {
    const hint = adoptionHint("commerce-registry.json");
    expect(hint.adoption_hint).toContain("purchasing agent");
  });

  it("returns known hint for CLAUDE.md", () => {
    const hint = adoptionHint("CLAUDE.md");
    expect(hint.adoption_hint).toContain("Claude");
  });

  it("returns default for unknown file", () => {
    const hint = adoptionHint("unknown-file.xyz");
    expect(hint.placement).toBe(".ai/");
    expect(hint.adoption_hint).toContain(".ai/");
  });

  it("is deterministic (same input → same output)", () => {
    const a = adoptionHint("AGENTS.md");
    const b = adoptionHint("AGENTS.md");
    expect(a).toEqual(b);
  });
});

// ─── buildNextSteps (pure function) ─────────────────────────────

describe("buildNextSteps", () => {
  it("returns AGENTS.md as top step when present", () => {
    const steps = buildNextSteps([{ path: "AGENTS.md" }, { path: ".cursorrules" }]);
    expect(steps[0]).toContain("AGENTS.md");
  });

  it("returns at most 3 steps", () => {
    const files = [
      { path: "AGENTS.md" },
      { path: ".cursorrules" },
      { path: "CLAUDE.md" },
      { path: "mcp-config.json" },
      { path: "commerce-registry.json" },
    ];
    expect(buildNextSteps(files).length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no priority files match", () => {
    const steps = buildNextSteps([{ path: "theme.css" }, { path: "cost-estimate.json" }]);
    expect(steps).toEqual([]);
  });

  it("does not include steps for files not generated", () => {
    const steps = buildNextSteps([{ path: "CLAUDE.md" }]);
    const mentions = steps.filter(s => s.includes(".cursorrules"));
    expect(mentions.length).toBe(0);
  });

  it("is deterministic", () => {
    const files = [{ path: "AGENTS.md" }, { path: ".cursorrules" }, { path: "CLAUDE.md" }];
    expect(buildNextSteps(files)).toEqual(buildNextSteps(files));
  });
});

// ─── detectProjectName (pure function) ──────────────────────────

describe("detectProjectName", () => {
  it("extracts name from package.json", () => {
    const name = detectProjectName([
      { path: "package.json", content: '{"name":"my-project","version":"1.0.0"}' },
    ]);
    expect(name).toBe("my-project");
  });

  it("extracts name from nested package.json (non-root excluded by node_modules)", () => {
    const name = detectProjectName([
      { path: "frontend/package.json", content: '{"name":"frontend-pkg"}' },
    ]);
    expect(name).toBe("frontend-pkg");
  });

  it("falls back to README heading when no package.json", () => {
    const name = detectProjectName([
      { path: "README.md", content: "# My Awesome Repo\nSome description." },
    ]);
    expect(name).toBe("My Awesome Repo");
  });

  it("returns null when no detectable name", () => {
    const name = detectProjectName([
      { path: "src/index.ts", content: "export const x = 1;" },
    ]);
    expect(name).toBeNull();
  });

  it("handles malformed package.json gracefully", () => {
    const name = detectProjectName([
      { path: "package.json", content: "{{invalid json" },
    ]);
    expect(name).toBeNull();
  });

  it("handles package.json with no name field", () => {
    const name = detectProjectName([
      { path: "package.json", content: '{"version":"1.0.0"}' },
    ]);
    expect(name).toBeNull();
  });

  it("is deterministic", () => {
    const files = [{ path: "package.json", content: '{"name":"stable"}' }];
    expect(detectProjectName(files)).toBe(detectProjectName(files));
  });
});

// ─── POST /v1/analyze — validation ──────────────────────────────

describe("POST /v1/analyze — validation", () => {
  it("rejects missing body input (no github_url or files)", async () => {
    const r = await req("POST", "/v1/analyze", {});
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects both github_url and files provided simultaneously", async () => {
    const r = await req("POST", "/v1/analyze", {
      github_url: "https://github.com/a/b",
      files: minFiles,
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects invalid JSON body", async () => {
    const r = await req("POST", "/v1/analyze", "{{bad");
    expect(r.status).toBe(400);
  });

  it("rejects invalid programs type (non-array)", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: "not-an-array",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects empty files array", async () => {
    const r = await req("POST", "/v1/analyze", { files: [] });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("MISSING_FIELD");
  });

  it("rejects file with missing content", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "src/index.ts" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("FILE_INVALID");
  });

  it("rejects path traversal attack", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "../../etc/passwd", content: "root:x:0:0" }],
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("PATH_TRAVERSAL");
  });

  it("rejects invalid (non-GitHub) URL in github_url", async () => {
    const r = await req("POST", "/v1/analyze", {
      github_url: "https://gitlab.com/a/b",
    });
    expect(r.status).toBe(400);
    expect((r.data as Record<string, unknown>).error_code).toBe("INVALID_FORMAT");
  });

  it("rejects revoked/invalid API key", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
    });
    expect([201, 401]).toContain(r.status);
  });

  // Free tier is artifact-level: an anonymous caller is NARROWED to the free
  // artifacts rather than rejected (every program has some), so the old 401 is
  // gone. What still must hold — and is the security property that 401 was
  // really protecting — is that NOT ONE paid artifact comes back.
  it("narrows full-bundle analysis for anonymous callers, leaking no paid artifact", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<{ path: string }>;
    expect(files.length).toBeGreaterThan(0);
    const paidLeaked = files.map(f => f.path).filter(p => isPaidArtifact(p));
    expect(paidLeaked, `anonymous caller received paid artifacts: ${paidLeaked.join(", ")}`).toEqual([]);
    // ...and is told what it did not get, with a price.
    const upsell = data.free_tier as { withheld_count: number; unlock: { per_call_usd: string } } | undefined;
    expect(upsell).toBeDefined();
    expect(upsell!.withheld_count).toBeGreaterThan(0);
    expect(upsell!.unlock.per_call_usd).toMatch(/^\d+\.\d{2}$/);
  });

  it("rejects an oversized anonymous request (file count) BEFORE generation runs", async () => {
    // Free-tier limit is 2000 files/snapshot (TIER_LIMITS.free.max_files_per_snapshot).
    // Request only free programs so this reaches the size gate instead of the 401
    // paid-program check above — proving the gate fires for the exact anonymous +
    // free-program path the live demo (WO-P1) actually uses.
    const manyFiles = Array.from({ length: 2001 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: "export const x = 1;",
    }));
    const r = await req("POST", "/v1/analyze", { files: manyFiles, programs: ["skills"] });
    expect(r.status).toBe(413);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("FILE_COUNT_EXCEEDED");
  });

  it("rejects an oversized anonymous request (single file size) BEFORE generation runs", async () => {
    // Free-tier limit is 50MB/file (TIER_LIMITS.free.max_file_size_bytes).
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "big.bin", content: "x", size: 51 * 1024 * 1024 }],
      programs: ["skills"],
    });
    expect(r.status).toBe(413);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("FILE_TOO_LARGE");
  });

  it("still allows an anonymous request within free-tier limits (no regression)", async () => {
    // Guards the WO-P1 live-demo path: small anonymous + free-program requests must
    // keep working exactly as before this fix.
    const r = await req("POST", "/v1/analyze", { files: minFiles, programs: ["skills"] });
    expect(r.status).toBe(201);
  });

  it("returns 402 for free-tier callers requesting the full bundle", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles }, freeApiKey);
    expect(r.status).toBe(402);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("TIER_REQUIRED");
    // H2.5: `error` is the call-specific message (sendError's caller-supplied
    // message always wins over the negotiation body's generic "Payment
    // Required" constant — the old clobbering bug this test used to encode
    // as "correct"). `message` carries the same text as an explicit alias.
    expect(data.error).toBe(`analyze_repo requires $3.00 MPP credit (or Pro tier). This returns the full ${ARTIFACT_COUNT}-artifact AXIS bundle. Upgrade at iliad.trustfabric.ai/billing.`);
    expect(data.message).toBe(data.error);
    expect(data.price).toBe("3.00");
    expect(data.referral_token).toBeTruthy();
    expect(typeof data.upgrade_url).toBe("string");
  });

  it("rejects an oversized authed request BEFORE any charge — a doomed request costs $0 (validate-first)", async () => {
    // Same free-tier + full-bundle shape as the 402 test above, but oversized.
    // The old ordering ran chargeWithDiscounts (402 challenge / credit
    // consumption) BEFORE the file caps — money could move for work that could
    // never run, and the caller saw a payment demand for a request that was
    // doomed to 413. Deterministic validation must win: 413, never 402.
    const manyFiles = Array.from({ length: 2001 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: "export const x = 1;",
    }));
    const r = await req("POST", "/v1/analyze", { files: manyFiles }, freeApiKey);
    expect(r.status).toBe(413);
    expect((r.data as Record<string, unknown>).error_code).toBe("FILE_COUNT_EXCEEDED");
  });

  // ─── Tier-upgrade enrichment on size-cap 413s ──────────────────
  // The status code and error_code stay EXACTLY as above (413, never 402 —
  // crossing tiers is a subscription change, not a per-call mppx payment;
  // a real 402 here would falsely imply a per-call charge could fix it).
  // What's new: when a HIGHER tier's limits would actually accommodate the
  // submitted repo, the 413 body now says so instead of leaving the caller
  // with no path forward.

  it("free-tier account, repo exceeds free's file-count cap but fits paid's — 413 body names the accommodating tier", async () => {
    // Free cap is 2000 files; paid has no cap at all — this exact case is the
    // one the test above already proves stays 413; this proves the body is
    // now enriched too, and that an unlimited tier's note says "unlimited"
    // rather than interpolating -1 (see formatTierCapForMessage).
    const manyFiles = Array.from({ length: 2001 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: "export const x = 1;",
    }));
    const r = await req("POST", "/v1/analyze", { files: manyFiles }, freeApiKey);
    expect(r.status).toBe(413);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("FILE_COUNT_EXCEEDED");
    expect(data.accommodating_tier).toBe("paid");
    expect(typeof data.upgrade_url).toBe("string");
    expect(data.upgrade_note).toContain("paid");
    expect(String(data.upgrade_note)).toContain("no file-count or file-size limit");
    expect(String(data.upgrade_note)).not.toContain("-1");
    // The disclaimer that this is a subscription change, not a payable per-call
    // charge, must be present — this is what keeps the 402-vs-413 choice honest.
    expect(String(data.upgrade_note)).toContain("not a per-call payment");
  });

  it("anonymous caller, repo exceeds free's file-count cap but fits paid's — 413 body names the accommodating tier", async () => {
    const manyFiles = Array.from({ length: 2001 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: "export const x = 1;",
    }));
    const r = await req("POST", "/v1/analyze", { files: manyFiles, programs: ["skills"] });
    expect(r.status).toBe(413);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("FILE_COUNT_EXCEEDED");
    expect(data.accommodating_tier).toBe("paid");
    expect(typeof data.upgrade_url).toBe("string");
  });

  // "Exceeds even suite's cap" no longer has a reachable scenario to test: paid
  // and suite both have NO file-count/file-size cap (docs/saas-strategy — the
  // tier differentiator moved to max_snapshots_per_month), so no file count can
  // ever fail to find an accommodating tier from a free-tier caller. Removed
  // rather than left pinning a case that can no longer occur; the underlying
  // `findAccommodatingTier` returning null when nothing accommodates is still
  // real code (kept for a future tier structure that reintroduces a cap), it
  // just isn't reachable through today's actual TIER_LIMITS values.
  it("suite tier itself never hits a file-count/file-size 413 — no cap exists to exceed", async () => {
    const manyFiles = Array.from({ length: 5001 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: "export const x = 1;",
    }));
    const r = await req("POST", "/v1/analyze", { files: manyFiles, programs: ["skills"] }, suiteApiKey);
    expect(r.status).toBe(201);
  });

  it("single oversized file within free's file-count cap but over free's per-file-size cap — accommodating tier named", async () => {
    // 51MB file: over free's 50MB/file cap; paid has no per-file-size cap at all.
    const r = await req("POST", "/v1/analyze", {
      files: [{ path: "big.bin", content: "x", size: 51 * 1024 * 1024 }],
      programs: ["skills"],
    });
    expect(r.status).toBe(413);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("FILE_TOO_LARGE");
    expect(data.accommodating_tier).toBe("paid");
    expect(typeof data.upgrade_url).toBe("string");
  });
});

// ─── POST /v1/analyze — success (files mode) ────────────────────

describe("POST /v1/analyze — files mode", () => {
  let result: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles }, suiteApiKey);
    expect(r.status).toBe(201);
    result = r.data as Record<string, unknown>;
  });

  it("returns snapshot_id and project_id", () => {
    expect(typeof result.snapshot_id).toBe("string");
    expect(typeof result.project_id).toBe("string");
    expect(result.status).toBe("ready");
  });

  it("returns analysis object with language and file_count", () => {
    const analysis = result.analysis as Record<string, unknown>;
    expect(analysis.file_count).toBe(minFiles.length);
    expect(typeof analysis.language).toBe("string");
    expect(Array.isArray(analysis.frameworks)).toBe(true);
    expect(typeof analysis.separation_score).toBe("number");
  });

  it("detects project_name from package.json", () => {
    const analysis = result.analysis as Record<string, unknown>;
    expect(analysis.project_name).toBe("test-project");
  });

  it("returns files array with content, placement, and adoption_hint", () => {
    const files = result.files as Array<Record<string, unknown>>;
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    const first = files[0];
    expect(typeof first.path).toBe("string");
    expect(typeof first.program).toBe("string");
    expect(typeof first.content).toBe("string");
    expect(typeof first.placement).toBe("string");
    expect(typeof first.adoption_hint).toBe("string");
  });

  it("returns AGENTS.md among the files", () => {
    const files = result.files as Array<Record<string, unknown>>;
    expect(files.some(f => f.path === "AGENTS.md")).toBe(true);
  });

  it("returns programs_run and total_files", () => {
    expect(typeof result.programs_run).toBe("number");
    expect((result.programs_run as number)).toBeGreaterThan(0);
    expect(typeof result.total_files).toBe("number");
    expect((result.total_files as number)).toBeGreaterThan(0);
  });

  it("returns 3 next_steps", () => {
    const steps = result.next_steps as string[];
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(steps.length).toBeGreaterThan(0);
  });

  it("no github field when using files mode", () => {
    expect(result.github).toBeUndefined();
  });
});

// ─── POST /v1/analyze — programs filter ──────────────────────────

describe("POST /v1/analyze — programs filter", () => {
  it("returns only requested programs", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: ["debug"],
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<{ program: string }>;
    const programs = new Set(files.map(f => f.program));
    expect(programs.has("debug")).toBe(true);
    // search program not requested — should not appear
    expect(programs.has("search")).toBe(false);
  });

  it("empty programs array returns no files", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: [],
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    expect((data.files as unknown[]).length).toBe(0);
  });

  it("suite tier can request the full bundle", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles }, suiteApiKey);
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    expect((data.total_files as number)).toBeGreaterThan(20);
    // pro_unlock's counts are DERIVED now (the old literal hardcoded a stale
    // "15 more programs" that had already drifted past the real count).
    const proUnlock = (data.snapshot_summary as Record<string, unknown>).pro_unlock as string;
    expect(proUnlock).toContain(String(TOTAL_GENERATORS - FREE_GENERATOR_COUNT));
    expect(proUnlock).not.toContain("15 more programs");
  });

  // ─── Lite mode is RETIRED (owner decision 2026-08-25) ──────────────────
  //
  // It existed to be the cheap way to evaluate output; the artifact-level free
  // tier now does that job for $0 and returns MORE than lite ever did, so
  // selling lite would mean charging for something free. It resolves to the
  // free artifact set and the header stays accepted-but-inert.
  //
  // Note this is an ARTIFACT-level assertion now: lite legitimately returns
  // artifacts belonging to paid programs (theme's design-tokens.json, brand's
  // brand-guidelines.md, ...) because those specific artifacts are free.
  // Asserting on programs, as this test used to, would now be wrong.
  it("lite mode returns exactly the free artifact set, even for a fully-entitled account", async () => {
    const r = await req(
      "POST",
      "/v1/analyze",
      { files: minFiles },
      suiteApiKey,
      { "X-Agent-Mode": "lite" },
    );
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const paths = (data.files as Array<{ path: string }>).map(f => f.path);
    expect(paths.length).toBeGreaterThan(0);
    const paid = paths.filter(p => isPaidArtifact(p));
    expect(paid, `lite returned paid artifacts: ${paid.join(", ")}`).toEqual([]);
  });
});

// ─── POST /v1/analyze — product_id (spoke_06) ─────────────────────
//
// A spoke (theme.trustfabric.ai) resolves ONE product's program set from
// PRODUCT_REGISTRY server-side, rather than trusting a client-supplied
// `programs` array. The requirement this guards is spoke_06's own: "never a
// forked code path" — product_id must compute the exact same
// requestedPrograms variable `programs` already sets, so it inherits every
// existing check (paid-tier auth, tier limits) automatically. The byte-
// identity test below is that requirement made checkable from a real
// request, not just at the generator layer (spoke-scope.test.ts already
// proves it there).

describe("POST /v1/analyze — product_id (spoke_06)", () => {
  it("resolves a product to its own program's outputs, and no others", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: "theme" }, suiteApiKey);
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<{ program: string }>;
    const programs = new Set(files.map((f) => f.program));
    expect(programs.has("theme")).toBe(true);
    expect(programs.has("debug")).toBe(false);
    expect(programs.has("brand")).toBe(false);
  });

  it("is byte-identical to the hub calling with the equivalent explicit programs array", async () => {
    // The actual guarantee spoke_06 exists for: a spoke and the hub must
    // never be able to drift, because they run through the identical path.
    // Two independent HTTP requests each build their own snapshot with its
    // own `generated_at` — a real wall-clock gap, not scope drift — so that
    // one field is normalized out before comparing. spoke-scope.test.ts
    // already proves TRUE byte-identity at the generator layer, where both
    // calls share one context_map and no clock is involved; this test proves
    // the same claim end-to-end through the real HTTP path, which is what a
    // spoke actually calls.
    const viaProduct = await req("POST", "/v1/analyze", { files: minFiles, product_id: "theme" }, suiteApiKey);
    const viaPrograms = await req("POST", "/v1/analyze", { files: minFiles, programs: ["theme"] }, suiteApiKey);
    expect(viaProduct.status).toBe(201);
    expect(viaPrograms.status).toBe(201);
    const stripTimestamp = (content: string) => content.replace(/"generated_at":\s*"[^"]*"/g, '"generated_at":"<ts>"');
    const normalize = (arr: Array<{ path: string; content: string }>) =>
      [...arr]
        .map((f) => ({ path: f.path, content: stripTimestamp(f.content) }))
        .sort((x, y) => x.path.localeCompare(y.path));
    const a = (viaProduct.data as Record<string, unknown>).files as Array<{ path: string; content: string }>;
    const b = (viaPrograms.data as Record<string, unknown>).files as Array<{ path: string; content: string }>;
    expect(normalize(a)).toEqual(normalize(b));
  });

  it("an unknown product_id is rejected, not silently treated as empty", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: "no-such-product" });
    expect(r.status).toBe(400);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("INVALID_PROGRAM");
  });

  it("product_id and programs together are rejected as ambiguous", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: "theme", programs: ["debug"] });
    expect(r.status).toBe(400);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("INVALID_FORMAT");
  });

  it("a non-string product_id is rejected", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: 123 });
    expect(r.status).toBe(400);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("INVALID_FORMAT");
  });

  it("resolving to a PAID product is not a bypass — anonymous gets only that product's FREE artifacts", async () => {
    // Previously a flat 401. Under the artifact-level free tier the caller is
    // narrowed instead, so the anti-bypass property is now "no paid artifact
    // comes back" rather than "the request is refused" — a stronger check,
    // since it verifies the delivered payload rather than the status code.
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: "theme" });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const paidLeaked = (data.files as Array<{ path: string }>).map(f => f.path).filter(p => isPaidArtifact(p));
    expect(paidLeaked, `product_id bypass leaked: ${paidLeaked.join(", ")}`).toEqual([]);
  });

  it("resolving to a FREE product needs no authentication", async () => {
    const r = await req("POST", "/v1/analyze", { files: minFiles, product_id: "search" });
    expect(r.status).toBe(201);
  });
});

// ─── POST /v1/analyze — inline_content: false ────────────────────

describe("POST /v1/analyze — inline_content: false", () => {
  it("omits content field from files when inline_content is false", async () => {
    const r = await req("POST", "/v1/analyze", {
      files: minFiles,
      programs: ["search"],
      inline_content: false,
    });
    expect(r.status).toBe(201);
    const data = r.data as Record<string, unknown>;
    const files = data.files as Array<Record<string, unknown>>;
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.content).toBeUndefined();
      // placement and adoption_hint still present
      expect(typeof f.placement).toBe("string");
      expect(typeof f.adoption_hint).toBe("string");
    }
  });
});

// ─── GET /.well-known/axis.json ──────────────────────────────────

describe("GET /.well-known/axis.json", () => {
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    const r = await req("GET", "/.well-known/axis.json");
    expect(r.status).toBe(200);
    manifest = r.data as Record<string, unknown>;
  });

  it("returns name and version", () => {
    expect(manifest.name).toBe("Axis' Iliad");
    expect(manifest.version).toBe("0.5.3");
  });

  it("describes the analyze_endpoint", () => {
    const endpoint = manifest.analyze_endpoint as Record<string, unknown>;
    expect(endpoint.method).toBe("POST");
    expect(endpoint.path).toBe("/v1/analyze");
    expect(endpoint.authentication).toBeDefined();
  });

  it("reports correct programs and generators count", () => {
    expect(manifest.programs).toBe(PROGRAM_COUNT);
    expect(manifest.generators).toBe(ARTIFACT_COUNT);
  });

  it("includes key_outputs array with adoption guidance", () => {
    const outputs = manifest.key_outputs as Array<{ path: string; purpose: string }>;
    expect(Array.isArray(outputs)).toBe(true);
    expect(outputs.some(o => o.path === "AGENTS.md")).toBe(true);
    expect(outputs.some(o => o.path === "mcp-config.json")).toBe(true);
    expect(outputs.some(o => o.path === "commerce-registry.json")).toBe(true);
  });

  it("includes quick_start steps", () => {
    const qs = manifest.quick_start as Record<string, string>;
    expect(qs.step_1).toBeTruthy();
    expect(qs.step_4).toBeTruthy();
  });

  it("includes for_agents section with MCP and purchasing info", () => {
    const fa = manifest.for_agents as Record<string, string>;
    expect(fa.mcp_discovery).toContain("GET /mcp");
    expect(fa.purchasing).toContain("/v1/prepare-for-agentic-purchasing");
    expect(fa.note).toBeTruthy();
  });

  // H-Phase-A cycle 15: mcp_discovery's example tool names used to be a
  // hand-typed list frozen from a 12-tool era (a 10th hand-typed-catalog-drift
  // recurrence) — every name it mentions must now be a REAL, current tool
  // (derived from MCP_TOOLS), not a stale/removed one.
  it("mcp_discovery's example tool names are all real, current MCP tools", () => {
    const fa = manifest.for_agents as Record<string, string>;
    const realNames = new Set(MCP_TOOLS.map((t) => t.name));
    const mentioned = fa.mcp_discovery.match(/\b[a-z][a-z0-9_]*\b/g) ?? [];
    const mentionedToolLike = mentioned.filter((w) => realNames.has(w) || w.includes("_"));
    expect(mentionedToolLike.length).toBeGreaterThan(0);
    for (const name of mentionedToolLike) {
      expect(realNames.has(name), `mcp_discovery mentions "${name}", not a real current MCP tool name`).toBe(true);
    }
  });
});
