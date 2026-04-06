/**
 * eq_108: Performance benchmarks for critical code paths.
 * Run with: npx vitest bench
 */
import { bench, describe, beforeAll, afterAll } from "vitest";
import {
  openMemoryDb,
  closeDb,
  createAccount,
  createApiKey,
  createSnapshot,
  saveGeneratorResult,
  indexSnapshotContent,
  searchSnapshotContent,
  recordUsage,
  createWebhook,
  recordDelivery,
  getDeliveries,
  signPayload,
  getSystemStats,
  listAllAccounts,
  trackEvent,
} from "./index.js";
import type { FileEntry } from "./index.js";

// ─── Fixtures ───────────────────────────────────────────────────

const SMALL_FILES: FileEntry[] = Array.from({ length: 10 }, (_, i) => ({
  path: `src/file${i}.ts`,
  content: `export const value${i} = ${i};\nexport function fn${i}() { return value${i}; }\n`,
  size: 60,
}));

const MEDIUM_FILES: FileEntry[] = Array.from({ length: 50 }, (_, i) => ({
  path: `src/module${i}/index.ts`,
  content: Array.from({ length: 40 }, (_, j) =>
    `export function handler${i}_${j}(req: Request) { return { status: 200, body: "${i}-${j}" }; }`,
  ).join("\n"),
  size: 2000,
}));

const LARGE_FILES: FileEntry[] = Array.from({ length: 200 }, (_, i) => ({
  path: `src/pkg${Math.floor(i / 10)}/component${i}.tsx`,
  content: Array.from({ length: 100 }, (_, j) =>
    `import { dep${j} } from "../dep${j}";\nexport const C${i}_${j} = () => <div>{dep${j}()}</div>;`,
  ).join("\n"),
  size: 8000,
}));

const MANIFEST = {
  project_name: "bench-project",
  project_type: "app" as const,
  frameworks: ["react"],
  goals: ["benchmark"],
  requested_outputs: [],
};

// ─── Setup ──────────────────────────────────────────────────────

beforeAll(() => {
  closeDb();
  openMemoryDb();
});

afterAll(() => {
  closeDb();
});

// ─── Snapshot Creation ──────────────────────────────────────────

describe("createSnapshot", () => {
  bench("10 files (small repo)", () => {
    createSnapshot({ input_method: "upload", manifest: MANIFEST, files: SMALL_FILES });
  });

  bench("50 files (medium repo)", () => {
    createSnapshot({ input_method: "upload", manifest: MANIFEST, files: MEDIUM_FILES });
  });

  bench("200 files (large repo)", () => {
    createSnapshot({ input_method: "upload", manifest: MANIFEST, files: LARGE_FILES });
  });
});

// ─── Search Indexing ────────────────────────────────────────────

describe("search indexing", () => {
  let snapshotId: string;

  beforeAll(() => {
    const snap = createSnapshot({ input_method: "upload", manifest: MANIFEST, files: MEDIUM_FILES });
    snapshotId = snap.snapshot_id;
  });

  bench("index 50 files (~2000 lines)", () => {
    indexSnapshotContent(
      snapshotId,
      MEDIUM_FILES.map(f => ({ path: f.path, content: f.content })),
    );
  });
});

describe("search query", () => {
  let snapshotId: string;

  beforeAll(() => {
    const snap = createSnapshot({ input_method: "upload", manifest: MANIFEST, files: MEDIUM_FILES });
    snapshotId = snap.snapshot_id;
    indexSnapshotContent(snapshotId, MEDIUM_FILES.map(f => ({ path: f.path, content: f.content })));
  });

  bench("FTS5 search — broad match", () => {
    searchSnapshotContent(snapshotId, "handler");
  });

  bench("FTS5 search — narrow match", () => {
    searchSnapshotContent(snapshotId, "handler25_10");
  });

  bench("FTS5 search — multi-term", () => {
    searchSnapshotContent(snapshotId, "export function handler");
  });
});

// ─── Account & Billing Operations ───────────────────────────────

describe("account operations", () => {
  bench("createAccount + createApiKey", () => {
    const acct = createAccount(`bench-${Math.random()}`, `bench-${Date.now()}@test.com`);
    createApiKey(acct.account_id, "bench-key");
  });

  bench("recordUsage", () => {
    const acct = createAccount(`usage-${Math.random()}`, `usage-${Date.now()}@test.com`);
    recordUsage(acct.account_id, "search", 1, 0);
  });

  bench("trackEvent", () => {
    const acct = createAccount(`evt-${Math.random()}`, `evt-${Date.now()}@test.com`);
    trackEvent(acct.account_id, "account_created", "signup", { source: "bench" });
  });
});

describe("admin queries", () => {
  beforeAll(() => {
    // Seed 100 accounts for realistic query benchmarks
    for (let i = 0; i < 100; i++) {
      const acct = createAccount(`admin-${i}`, `admin-${i}@test.com`, i % 3 === 0 ? "paid" : "free");
      trackEvent(acct.account_id, "account_created", "signup", {});
    }
  });

  bench("getSystemStats", () => {
    getSystemStats();
  });

  bench("listAllAccounts (page 50)", () => {
    listAllAccounts(20, 0);
  });
});

// ─── Webhook Operations ─────────────────────────────────────────

describe("webhook operations", () => {
  let webhookId: string;

  beforeAll(() => {
    const acct = createAccount("wh-bench", `wh-bench-${Date.now()}@test.com`);
    const wh = createWebhook(acct.account_id, "https://bench.example.com/hook", ["snapshot.created"], "bench-secret");
    webhookId = wh.webhook_id;
  });

  bench("signPayload (HMAC-SHA256)", () => {
    signPayload('{"event":"snapshot.created","data":{"id":"abc123"}}', "bench-secret");
  });

  bench("recordDelivery", () => {
    recordDelivery(webhookId, "snapshot.created", '{"test":1}', 200, "OK", true, 1);
  });

  bench("getDeliveries (20 limit)", () => {
    getDeliveries(webhookId, 20);
  });
});

// ─── Generator Result Storage ───────────────────────────────────

describe("saveGeneratorResult", () => {
  bench("save 10 generated files", () => {
    const snap = createSnapshot({ input_method: "upload", manifest: MANIFEST, files: SMALL_FILES });
    saveGeneratorResult(snap.snapshot_id, {
      snapshot_id: snap.snapshot_id,
      project_id: snap.project_id,
      generated_at: new Date().toISOString(),
      files: Array.from({ length: 10 }, (_, i) => ({
        path: `.ai/gen${i}.md`,
        content: `# Generated file ${i}\n\nBenchmark content for file ${i}.\n`,
        generator: "bench",
        description: `Bench file ${i}`,
      })),
      skipped: [],
    });
  });
});
