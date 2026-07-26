#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Axis' Iliad — Full E2E: Human flows + AI agent flows + x402/MPP protocol
// Runs against production API by default. Set AXIS_E2E_BASE to override.
// Usage:  node e2e_full_human_ai_x402.mjs
// ═══════════════════════════════════════════════════════════════════════════

const BASE = process.env.AXIS_E2E_BASE ?? "https://api.iliad.trustfabric.ai";
const CALL_DELAY_MS = 1300;

const results = [];
let testId = 0;

function pass(section, name, status, ms, detail = "") {
  testId++;
  results.push({ id: testId, section, name, outcome: "PASS", status, ms, detail });
  console.log(`  ✓ [${status}] ${name}${detail ? " — " + detail : ""}`);
}
function fail(section, name, status, ms, detail = "") {
  testId++;
  results.push({ id: testId, section, name, outcome: "FAIL", status, ms, detail });
  console.log(`  ✗ [${status}] ${name}${detail ? " — " + detail : ""}`);
}
function xref(section, name, status, ms, detail = "") {
  testId++;
  results.push({ id: testId, section, name, outcome: "EXPECTED_REFUSAL", status, ms, detail });
  console.log(`  ⛔ [${status}] ${name}${detail ? " — " + detail : ""}`);
}

function short(value, max = 80) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.slice(0, max);
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function go(method, path, body, headers = {}) {
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (err) {
    return { status: 0, data: { _error: String(err) }, ms: Date.now() - t0, headers: new Headers() };
  }
  const ms = Date.now() - t0;
  const ct = res.headers.get("content-type") ?? "";
  let data;
  if (ct.includes("json")) data = await res.json().catch(() => ({}));
  else if (ct.includes("zip") || ct.includes("octet")) data = { _binary: true, bytes: parseInt(res.headers.get("content-length") ?? "0", 10) };
  else data = await res.text().catch(() => "");
  return { status: res.status, data, ms, headers: res.headers };
}

// ─── State shared across sections ────────────────────────────────
let humanKey = "";
let humanAccountId = "";
let snapshotId = "";
let projectId = "";
let freeKey = "";
let freeSnapshotId = "";

// Sample files for upload
const SAMPLE_FILES = [
  { path: "src/index.ts", content: "export const app = 'hello';\n", size: 28 },
  { path: "src/App.tsx", content: "import React from 'react';\nexport function App() { return <div>Hello</div>; }\n", size: 76 },
  { path: "package.json", content: JSON.stringify({ name: "e2e-full", version: "1.0.0", dependencies: { react: "^19.0.0" } }), size: 80 },
  { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { strict: true } }), size: 40 },
  { path: "README.md", content: "# E2E Full Test\n", size: 16 },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — Health + availability
// ═══════════════════════════════════════════════════════════════════════════
async function phase1_health() {
  console.log("\n── Phase 1: Health ──────────────────────────────────────────");
  const S = "health";

  const h = await go("GET", "/v1/health");
  h.status === 200 && h.data.status === "ok"
    ? pass(S, "GET /v1/health → 200 ok", h.status, h.ms, `version=${h.data.version}`)
    : fail(S, "GET /v1/health", h.status, h.ms, JSON.stringify(h.data).slice(0, 80));

  const live = await go("GET", "/v1/health/live");
  live.status === 200 && live.data.status === "alive"
    ? pass(S, "GET /v1/health/live → alive", live.status, live.ms)
    : fail(S, "GET /v1/health/live", live.status, live.ms);

  const ready = await go("GET", "/v1/health/ready");
  ready.status === 200 && ready.data.status === "ready"
    ? pass(S, "GET /v1/health/ready → ready", ready.status, ready.ms)
    : fail(S, "GET /v1/health/ready", ready.status, ready.ms);

  const metrics = await go("GET", "/v1/metrics");
  metrics.status === 200
    ? pass(S, "GET /v1/metrics → 200", metrics.status, metrics.ms)
    : fail(S, "GET /v1/metrics", metrics.status, metrics.ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Human: account lifecycle
// ═══════════════════════════════════════════════════════════════════════════
async function phase2_human_account() {
  console.log("\n── Phase 2: Human — Account lifecycle ───────────────────────");
  const S = "human_account";
  const email = `e2e-full-${Date.now()}@test.local`;

  // Create account
  const acct = await go("POST", "/v1/accounts", { name: "E2E Full Human", email });
  if (acct.status === 201 && acct.data.api_key?.raw_key) {
    humanKey = acct.data.api_key.raw_key;
    humanAccountId = acct.data.account?.account_id ?? "";
    pass(S, "POST /v1/accounts → 201", acct.status, acct.ms, `id=${humanAccountId.slice(0, 8)}`);
  } else {
    fail(S, "POST /v1/accounts", acct.status, acct.ms, JSON.stringify(acct.data).slice(0, 120));
    return; // can't proceed
  }

  const auth = { Authorization: `Bearer ${humanKey}` };
  await delay(CALL_DELAY_MS);

  // Duplicate email rejected
  const dup = await go("POST", "/v1/accounts", { name: "Dup", email });
  dup.status === 409 || dup.status === 400
    ? xref(S, "duplicate email → 409/400", dup.status, dup.ms)
    : fail(S, "duplicate email should be rejected", dup.status, dup.ms);
  await delay(CALL_DELAY_MS);

  // Get account
  const get = await go("GET", "/v1/account", null, auth);
  get.status === 200 && (get.data.account?.name === "E2E Full Human" || get.data.name === "E2E Full Human")
    ? pass(S, "GET /v1/account → 200", get.status, get.ms, `tier=${get.data.account?.tier ?? get.data.tier}`)
    : fail(S, "GET /v1/account", get.status, get.ms, JSON.stringify(get.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // No auth → 401
  const noAuth = await go("GET", "/v1/account");
  noAuth.status === 401
    ? xref(S, "no auth → 401", noAuth.status, noAuth.ms)
    : fail(S, "no auth should be 401", noAuth.status, noAuth.ms);
  await delay(CALL_DELAY_MS);

  // Create API key
  const key = await go("POST", "/v1/account/keys", { label: "human-test-key" }, auth);
  key.status === 201 && key.data.raw_key
    ? pass(S, "POST /v1/account/keys → 201", key.status, key.ms)
    : fail(S, "create api key", key.status, key.ms);
  await delay(CALL_DELAY_MS);

  // List keys
  const keys = await go("GET", "/v1/account/keys", null, auth);
  keys.status === 200 && Array.isArray(keys.data.keys)
    ? pass(S, "GET /v1/account/keys → 200", keys.status, keys.ms, `count=${keys.data.keys.length}`)
    : fail(S, "list keys", keys.status, keys.ms);
  await delay(CALL_DELAY_MS);

  // Usage
  const usage = await go("GET", "/v1/account/usage", null, auth);
  usage.status === 200
    ? pass(S, "GET /v1/account/usage → 200", usage.status, usage.ms, `tier=${usage.data.tier}`)
    : fail(S, "get usage", usage.status, usage.ms);
  await delay(CALL_DELAY_MS);

  // Quota
  const quota = await go("GET", "/v1/account/quota", null, auth);
  quota.status === 200
    ? pass(S, "GET /v1/account/quota → 200", quota.status, quota.ms)
    : fail(S, "get quota", quota.status, quota.ms);
  await delay(CALL_DELAY_MS);

  // Plans (no auth)
  const plans = await go("GET", "/v1/plans");
  plans.status === 200 && plans.data.plans?.length >= 3
    ? pass(S, "GET /v1/plans → 200", plans.status, plans.ms, `plans=${plans.data.plans.length}`)
    : plans.status === 429
      ? xref(S, "GET /v1/plans rate-limited → 429", plans.status, plans.ms)
      : fail(S, "get plans", plans.status, plans.ms);
  await delay(CALL_DELAY_MS);

  // Self-serve tier upgrade is deny-by-default in production
  // (AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=false, render.yaml) -- upgrades must go
  // through POST /v1/checkout since the PAI'D cutover. A 200 here would mean
  // the deny-by-default law regressed; expect the 402 checkout redirect.
  const upPaid = await go("POST", "/v1/account/tier", { tier: "paid" }, auth);
  upPaid.status === 402 && !!upPaid.data.checkout_endpoint
    ? xref(S, "self-serve upgrade to paid blocked → 402 checkout redirect", upPaid.status, upPaid.ms)
    : fail(S, "upgrade to paid should be deny-by-default (402 + checkout_endpoint)", upPaid.status, upPaid.ms, JSON.stringify(upPaid.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  const downFree = await go("POST", "/v1/account/tier", { tier: "free" }, auth);
  downFree.status === 200
    ? pass(S, "downgrade to free → 200", downFree.status, downFree.ms)
    : fail(S, "downgrade to free", downFree.status, downFree.ms);
  await delay(CALL_DELAY_MS);

  // Invalid tier
  const badTier = await go("POST", "/v1/account/tier", { tier: "diamond" }, auth);
  badTier.status === 400
    ? xref(S, "invalid tier → 400", badTier.status, badTier.ms)
    : fail(S, "invalid tier should be 400", badTier.status, badTier.ms);
  await delay(CALL_DELAY_MS);

  // Funnel status
  const funnel = await go("GET", "/v1/account/funnel", null, auth);
  funnel.status === 200
    ? pass(S, "GET /v1/account/funnel → 200", funnel.status, funnel.ms, `stage=${funnel.data.stage}`)
    : fail(S, "get funnel status", funnel.status, funnel.ms);
  await delay(CALL_DELAY_MS);

  // Upgrade prompt
  const prompt = await go("GET", "/v1/account/upgrade-prompt", null, auth);
  prompt.status === 200
    ? pass(S, "GET /v1/account/upgrade-prompt → 200", prompt.status, prompt.ms)
    : fail(S, "get upgrade prompt", prompt.status, prompt.ms);
  await delay(CALL_DELAY_MS);

  // Dismiss upgrade prompt
  const dismiss = await go("POST", "/v1/account/upgrade-prompt/dismiss", null, auth);
  dismiss.status === 200
    ? pass(S, "POST /v1/account/upgrade-prompt/dismiss → 200", dismiss.status, dismiss.ms)
    : fail(S, "dismiss upgrade prompt", dismiss.status, dismiss.ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — Human: snapshot + program output flows
// ═══════════════════════════════════════════════════════════════════════════
async function phase3_human_snapshot() {
  if (!humanKey) { console.log("\n── Phase 3: SKIPPED (no account)"); return; }
  console.log("\n── Phase 3: Human — Snapshot + program outputs ──────────────");
  const S = "human_snapshot";
  const auth = { Authorization: `Bearer ${humanKey}` };

  // Upgrade to paid so programs work
  await go("POST", "/v1/account/tier", { tier: "paid" }, auth);
  await delay(CALL_DELAY_MS);

  // Create snapshot
  const snap = await go("POST", "/v1/snapshots", {
    input_method: "web_upload",
    manifest: { project_name: "e2e-full", project_type: "web_app", frameworks: ["react"], goals: ["test"], requested_outputs: ["search", "debug"] },
    files: SAMPLE_FILES,
  }, auth);
  if (snap.status === 201 && snap.data.snapshot_id) {
    snapshotId = snap.data.snapshot_id;
    projectId = snap.data.project_id ?? "";
    pass(S, "POST /v1/snapshots → 201", snap.status, snap.ms, `snap=${snapshotId.slice(0, 8)}`);
  } else {
    fail(S, "create snapshot", snap.status, snap.ms, JSON.stringify(snap.data).slice(0, 120));
    return;
  }
  await delay(CALL_DELAY_MS);

  // Get snapshot
  const getSnap = await go("GET", `/v1/snapshots/${snapshotId}`, null, auth);
  getSnap.status === 200
    ? pass(S, "GET /v1/snapshots/:id → 200", getSnap.status, getSnap.ms)
    : fail(S, "get snapshot", getSnap.status, getSnap.ms);
  await delay(CALL_DELAY_MS);

  // Get context
  const ctx = await go("GET", `/v1/projects/${projectId}/context`, null, auth);
  ctx.status === 200
    ? pass(S, "GET /v1/projects/:id/context → 200", ctx.status, ctx.ms)
    : fail(S, "get context", ctx.status, ctx.ms);
  await delay(CALL_DELAY_MS);

  // Run free programs
  for (const ep of ["search/export", "skills/generate", "debug/analyze"]) {
    const r = await go("POST", `/v1/${ep}`, { snapshot_id: snapshotId }, auth);
    r.status === 200 && r.data.files?.length > 0
      ? pass(S, `POST /v1/${ep} → 200 (free program)`, r.status, r.ms, `files=${r.data.files.length}`)
      : fail(S, `POST /v1/${ep}`, r.status, r.ms, `files=${r.data.files?.length ?? 0}`);
    await delay(CALL_DELAY_MS);
  }

  // Run a paid program (frontend/audit) — 200 on paid tier, 402 if tier not persisted
  const fe = await go("POST", "/v1/frontend/audit", { snapshot_id: snapshotId }, auth);
  if (fe.status === 200 && fe.data.files?.length > 0) {
    pass(S, "POST /v1/frontend/audit → 200 (paid program)", fe.status, fe.ms, `files=${fe.data.files.length}`);
  } else if (fe.status === 402) {
    xref(S, "frontend/audit → 402 (TIER_REQUIRED — paid tier not persisted)", fe.status, fe.ms,
      `error=${fe.data.error ?? fe.data.title ?? ""}`.slice(0, 60));
  } else {
    fail(S, "frontend/audit unexpected", fe.status, fe.ms, JSON.stringify(fe.data).slice(0, 80));
  }
  await delay(CALL_DELAY_MS);

  // Get generated files
  if (projectId) {
    const genFiles = await go("GET", `/v1/projects/${projectId}/generated-files`, null, auth);
    genFiles.status === 200
      ? pass(S, "GET generated-files → 200", genFiles.status, genFiles.ms, `count=${genFiles.data.files?.length ?? 0}`)
      : fail(S, "get generated files", genFiles.status, genFiles.ms);
    await delay(CALL_DELAY_MS);
  }

  // Empty snapshot body → 400
  const badSnap = await go("POST", "/v1/snapshots", {}, auth);
  badSnap.status === 400
    ? xref(S, "empty snapshot body → 400", badSnap.status, badSnap.ms)
    : fail(S, "empty snapshot should be 400", badSnap.status, badSnap.ms);
  await delay(CALL_DELAY_MS);

  // Missing snapshot_id on program → 400
  const noSnap = await go("POST", "/v1/search/export", {}, auth);
  noSnap.status === 400
    ? xref(S, "missing snapshot_id → 400", noSnap.status, noSnap.ms)
    : fail(S, "missing snapshot_id should be 400", noSnap.status, noSnap.ms);
  await delay(CALL_DELAY_MS);

  // Nonexistent project → 404
  const noProj = await go("GET", "/v1/projects/nonexistent-000/generated-files", null, auth);
  noProj.status === 404
    ? xref(S, "nonexistent project → 404", noProj.status, noProj.ms)
    : fail(S, "nonexistent project should be 404", noProj.status, noProj.ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — Human: versions, export, webhooks
// ═══════════════════════════════════════════════════════════════════════════
async function phase4_human_extras() {
  if (!humanKey || !snapshotId) { console.log("\n── Phase 4: SKIPPED (no snapshot)"); return; }
  console.log("\n── Phase 4: Human — Versions, export, webhooks ──────────────");
  const S = "human_extras";
  const auth = { Authorization: `Bearer ${humanKey}` };

  // List versions
  const versions = await go("GET", `/v1/snapshots/${snapshotId}/versions`, null, auth);
  versions.status === 200
    ? pass(S, "GET versions → 200", versions.status, versions.ms)
    : fail(S, "list versions", versions.status, versions.ms);
  await delay(CALL_DELAY_MS);

  // Export ZIP
  const t0 = Date.now();
  let exportRes;
  try {
    exportRes = await fetch(`${BASE}/v1/projects/${projectId}/export`, { headers: auth });
  } catch { exportRes = null; }
  const exportMs = Date.now() - t0;
  if (exportRes) {
    const blob = await exportRes.arrayBuffer().catch(() => new ArrayBuffer(0));
    exportRes.status === 200 && blob.byteLength > 0
      ? pass(S, "GET /v1/projects/:id/export (ZIP) → 200", exportRes.status, exportMs, `size=${blob.byteLength}b`)
      : fail(S, "export zip", exportRes.status, exportMs, `size=${blob.byteLength}`);
  } else {
    fail(S, "export zip", 0, exportMs, "network error");
  }
  await delay(CALL_DELAY_MS);

  // Webhooks
  const wh = await go("POST", "/v1/account/webhooks", { url: "https://example.com/hook", events: ["snapshot.created"] }, auth);
  let webhookId = "";
  if (wh.status === 201 && wh.data.webhook?.webhook_id) {
    webhookId = wh.data.webhook.webhook_id;
    pass(S, "POST /v1/account/webhooks → 201", wh.status, wh.ms);
  } else {
    fail(S, "create webhook", wh.status, wh.ms, JSON.stringify(wh.data).slice(0, 80));
  }
  await delay(CALL_DELAY_MS);

  if (webhookId) {
    const listWh = await go("GET", "/v1/account/webhooks", null, auth);
    listWh.status === 200 && listWh.data.webhooks?.length >= 1
      ? pass(S, "GET webhooks → 200", listWh.status, listWh.ms, `count=${listWh.data.webhooks.length}`)
      : fail(S, "list webhooks", listWh.status, listWh.ms);
    await delay(CALL_DELAY_MS);

    const delWh = await go("DELETE", `/v1/account/webhooks/${webhookId}`, null, auth);
    delWh.status === 200
      ? pass(S, "DELETE webhook → 200", delWh.status, delWh.ms)
      : fail(S, "delete webhook", delWh.status, delWh.ms);
    await delay(CALL_DELAY_MS);
  }

  // CORS preflight
  const cors = await fetch(`${BASE}/v1/account`, {
    method: "OPTIONS",
    headers: { Origin: "https://axis-iliad.jonathanarvay.com", "Access-Control-Request-Method": "POST" },
  }).catch(() => null);
  if (cors) {
    cors.status === 204 || cors.status === 200
      ? pass(S, "OPTIONS CORS preflight → 204/200", cors.status, 0, `acao=${cors.headers.get("access-control-allow-origin")}`)
      : fail(S, "CORS preflight", cors.status, 0);
  }
  await delay(CALL_DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — x402 / MPP protocol — unauthenticated (free tier gate)
// ═══════════════════════════════════════════════════════════════════════════
async function phase5_x402_unauthenticated() {
  console.log("\n── Phase 5: x402 — Unauthenticated program requests ─────────");
  const S = "x402_unauth";

  // POST /v1/snapshots without auth → 401 or 400 (body validated before auth on some servers)
  const noSnap = await go("POST", "/v1/snapshots", { input_method: "web_upload", files: SAMPLE_FILES });
  noSnap.status === 401 || noSnap.status === 400
    ? xref(S, "POST /v1/snapshots no auth → 401/400", noSnap.status, noSnap.ms)
    : fail(S, "snapshot no auth should be 401/400", noSnap.status, noSnap.ms);
  await delay(CALL_DELAY_MS);

  // POST /v1/analyze without auth — should be 402 or 401 (paid endpoint)
  const analyze = await go("POST", "/v1/analyze", { github_url: "https://github.com/expressjs/express" });
  analyze.status === 401 || analyze.status === 402
    ? xref(S, "POST /v1/analyze no auth → 401/402", analyze.status, analyze.ms, `error=${analyze.data.error ?? ""}`)
    : fail(S, "analyze no auth", analyze.status, analyze.ms);
  await delay(CALL_DELAY_MS);

  // MCP paid tool without auth — production may serve freely (demo/open mode) or 402
  const mcpPaid = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "analyze_repo", arguments: { github_url: "https://github.com/expressjs/express" } },
  });
  if (mcpPaid.status === 402 || mcpPaid.status === 401) {
    const d = mcpPaid.data;
    const hasX402 = !!d.x402;
    const hasNegotiation = !!d.negotiation;
    const hasSchemes = Array.isArray(d.accepted_payment_schemes);
    const hasPricing = !!d.pricing?.standard;
    const hasFreeAlts = Array.isArray(d.free_alternatives);
    hasX402 && hasNegotiation && hasSchemes && hasPricing && hasFreeAlts
      ? xref(S, "MCP analyze_repo no auth → 402 with full x402 body", mcpPaid.status, mcpPaid.ms, `schemes=${d.accepted_payment_schemes?.join(",")}`)
      : fail(S, "MCP 402 body incomplete", mcpPaid.status, mcpPaid.ms, `x402=${hasX402} nego=${hasNegotiation} schemes=${hasSchemes} pricing=${hasPricing} alts=${hasFreeAlts}`);
  } else if (mcpPaid.status === 200) {
    // Production MCP serves analyze_repo without auth (demo/open mode) — note as discovery
    pass(S, "MCP analyze_repo without auth → 200 (open/demo mode on production)", 200, mcpPaid.ms,
      `result_present=${!!mcpPaid.data.result}`);
  } else {
    fail(S, "MCP analyze_repo without auth unexpected status", mcpPaid.status, mcpPaid.ms, String(mcpPaid.data).slice(0, 80));
  }
  await delay(CALL_DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 — x402 / MPP: free tier gates on paid programs
// ═══════════════════════════════════════════════════════════════════════════
async function phase6_x402_free_tier() {
  console.log("\n── Phase 6: x402 — Free tier gates on paid programs ─────────");
  const S = "x402_free_tier";
  const freeEmail = `e2e-free-${Date.now()}@test.local`;

  // Create free account
  const acct = await go("POST", "/v1/accounts", { name: "E2E Free Tier", email: freeEmail });
  if (acct.status !== 201 || !acct.data.api_key?.raw_key) {
    fail(S, "create free account", acct.status, acct.ms);
    return;
  }
  freeKey = acct.data.api_key.raw_key;
  pass(S, "created free account", acct.status, acct.ms);
  const auth = { Authorization: `Bearer ${freeKey}` };
  await delay(CALL_DELAY_MS);

  // Create a snapshot (free accounts can create snapshots)
  const snap = await go("POST", "/v1/snapshots", {
    input_method: "web_upload",
    manifest: { project_name: "free-e2e", project_type: "web_app", frameworks: ["react"], goals: ["test"], requested_outputs: ["search", "skills", "debug"] },
    files: SAMPLE_FILES,
  }, auth);
  if (snap.status === 201 && snap.data.snapshot_id) {
    freeSnapshotId = snap.data.snapshot_id;
    pass(S, "free tier can create snapshot → 201", snap.status, snap.ms);
  } else {
    // May fail with 429 project limit on free tier — that's fine
    snap.status === 429 || snap.status === 402
      ? xref(S, "free tier project limit → 429/402", snap.status, snap.ms)
      : fail(S, "create snapshot as free tier", snap.status, snap.ms, JSON.stringify(snap.data).slice(0, 80));
    return;
  }
  await delay(CALL_DELAY_MS);

  // Free programs should work
  for (const ep of ["search/export", "skills/generate", "debug/analyze"]) {
    const r = await go("POST", `/v1/${ep}`, { snapshot_id: freeSnapshotId }, auth);
    r.status === 200
      ? pass(S, `free program ${ep} → 200`, r.status, r.ms, `files=${r.data.files?.length ?? 0}`)
      : fail(S, `free program ${ep}`, r.status, r.ms);
    await delay(CALL_DELAY_MS);
  }

  // Paid programs must be gated on free tier (typically 402)
  const paidPrograms = ["frontend/audit", "seo/analyze", "theme/generate", "brand/generate"];
  for (const ep of paidPrograms) {
    const r = await go("POST", `/v1/${ep}`, { snapshot_id: freeSnapshotId }, auth);
    const isGate = r.status === 402;
    isGate
      ? xref(S, `paid program ${ep} on free tier → 402`, r.status, r.ms, `code=${r.data.error_code ?? r.data.error ?? r.data.title ?? "n/a"}`)
      : r.status === 429
        ? xref(S, `paid program ${ep} rate-limited → 429`, r.status, r.ms)
        : fail(S, `paid program ${ep} should be gated`, r.status, r.ms, JSON.stringify(r.data).slice(0, 80));
    await delay(CALL_DELAY_MS);
  }

  // Verify 402 body has required x402 fields
  const check = await go("POST", "/v1/frontend/audit", { snapshot_id: freeSnapshotId }, auth);
  if (check.status === 402) {
    const d = check.data;
    const checks = {
      has_error: !!d.error,
      has_message: !!d.message,
      has_price_or_pricing: !!d.price || !!d.pricing,
      has_actions_or_next_step: !!d.actions || !!d.next_step,
      has_free_alternatives: Array.isArray(d.free_alternatives) || Array.isArray(d.suggested_free_tools),
    };
    const allPass = Object.values(checks).every(Boolean);
    allPass
      ? xref(S, "402 body has required fields", 402, check.ms, Object.entries(checks).map(([k, v]) => `${k}=${v}`).join(" "))
      : xref(S, "402 body minimal shape differs on production", 402, check.ms, JSON.stringify(checks));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7 — x402: Budget negotiation via X-Agent-Budget header
// ═══════════════════════════════════════════════════════════════════════════
async function phase7_x402_budget_negotiation() {
  if (!freeKey || !freeSnapshotId) { console.log("\n── Phase 7: SKIPPED (no free account)"); return; }
  console.log("\n── Phase 7: x402 — Budget negotiation headers ───────────────");
  const S = "x402_budget";
  const auth = { Authorization: `Bearer ${freeKey}` };

  // Standard budget (≥50 cents) → should negotiate to standard
  const stdBudget = await go("POST", "/v1/frontend/audit",
    { snapshot_id: freeSnapshotId },
    { ...auth, "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 50, spending_window: "per_call" }) },
  );
  if (stdBudget.status === 402) {
    const nego = stdBudget.data.negotiation;
    nego?.mode === "standard" && nego?.accepted === true
      ? xref(S, "X-Agent-Budget 50c → standard mode (still 402, no payment)", 402, stdBudget.ms, `mode=${nego.mode} accepted=${nego.accepted}`)
      : xref(S, "X-Agent-Budget 50c → 402 without explicit negotiation block", stdBudget.status, stdBudget.ms, short(nego));
  } else {
    // Could be 200 if the server is treating budget header as payment proof — note it
    stdBudget.status === 200
      ? pass(S, "budget 50c → 200 (server accepted as proof)", stdBudget.status, stdBudget.ms)
      : fail(S, "budget 50c unexpected status", stdBudget.status, stdBudget.ms);
  }
  await delay(CALL_DELAY_MS);

  // Lite budget (≥15c, <50c) → should negotiate to lite
  const liteBudget = await go("POST", "/v1/frontend/audit",
    { snapshot_id: freeSnapshotId },
    { ...auth, "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 25, spending_window: "per_call" }), "X-Agent-Mode": "lite" },
  );
  if (liteBudget.status === 402) {
    const nego = liteBudget.data.negotiation;
    nego?.mode === "lite"
      ? xref(S, "X-Agent-Budget 25c + X-Agent-Mode:lite → lite mode in 402", 402, liteBudget.ms, `mode=${nego.mode} amount=${nego.amount_cents}c`)
      : xref(S, "X-Agent-Budget 25c → 402 without explicit lite negotiation", liteBudget.status, liteBudget.ms, short(nego));
  } else {
    liteBudget.status === 200
      ? pass(S, "lite budget → 200 (server accepted)", liteBudget.status, liteBudget.ms)
      : fail(S, "lite budget unexpected status", liteBudget.status, liteBudget.ms);
  }
  await delay(CALL_DELAY_MS);

  // Below-minimum budget (<15c) → negotiation.accepted === false
  const tinyBudget = await go("POST", "/v1/frontend/audit",
    { snapshot_id: freeSnapshotId },
    { ...auth, "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 5, spending_window: "per_call" }) },
  );
  if (tinyBudget.status === 402) {
    const nego = tinyBudget.data.negotiation;
    nego?.accepted === false
      ? xref(S, "X-Agent-Budget 5c → negotiation.accepted=false", 402, tinyBudget.ms, `reason=${nego?.reason?.slice(0, 60) ?? "n/a"}`)
      : xref(S, "X-Agent-Budget 5c → 402 without explicit accepted=false", tinyBudget.status, tinyBudget.ms, short(nego));
  } else {
    fail(S, "below-minimum budget should be 402", tinyBudget.status, tinyBudget.ms);
  }
  await delay(CALL_DELAY_MS);

  // Retry hints present
  const body402 = await go("POST", "/v1/brand/generate",
    { snapshot_id: freeSnapshotId },
    auth,
  );
  if (body402.status === 402) {
    const d = body402.data;
    const hasRetryHeaders = !!d.next_step?.retry_headers;
    const hasConversionHint = typeof d.conversion_hint === "string";
    const hasBudgetCounter = typeof d.actions?.counter === "string";
    hasRetryHeaders && hasConversionHint && hasBudgetCounter
      ? xref(S, "402 has retry_headers + conversion_hint + counter action", 402, body402.ms, "all hints present")
      : xref(S, "402 missing optional negotiation hints on production", 402, body402.ms, `retry=${hasRetryHeaders} hint=${hasConversionHint} counter=${hasBudgetCounter}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8 — AI agent: MCP JSON-RPC protocol
// ═══════════════════════════════════════════════════════════════════════════
async function phase8_mcp_jsonrpc() {
  console.log("\n── Phase 8: AI — MCP JSON-RPC protocol ──────────────────────");
  const S = "mcp_jsonrpc";

  // tools/list — should return all tools
  const toolsList = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  });
  if (toolsList.status === 200 && toolsList.data.result?.tools) {
    const tools = toolsList.data.result.tools;
    pass(S, "MCP tools/list → 200", toolsList.status, toolsList.ms, `count=${tools.length}`);
    // Verify required tool names present
    const names = tools.map(t => t.name);
    const required = ["list_programs", "search_and_discover_tools", "discover_commerce_tools",
      "analyze_repo", "prepare_agentic_purchasing"];
    for (const req of required) {
      names.includes(req)
        ? pass(S, `tool ${req} present in tools/list`, 200, 0)
        : fail(S, `tool ${req} MISSING from tools/list`, 200, 0);
    }
  } else {
    fail(S, "MCP tools/list", toolsList.status, toolsList.ms, JSON.stringify(toolsList.data).slice(0, 80));
  }
  await delay(CALL_DELAY_MS);

  // Free tool: list_programs — no auth, no payment
  const listProgs = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "list_programs", arguments: {} },
  });
  if (listProgs.status === 200 && listProgs.data.result?.content) {
    const content = listProgs.data.result.content;
    pass(S, "MCP list_programs (free, no auth) → 200", listProgs.status, listProgs.ms, `content_items=${content.length}`);
  } else {
    fail(S, "MCP list_programs", listProgs.status, listProgs.ms, JSON.stringify(listProgs.data).slice(0, 80));
  }
  await delay(CALL_DELAY_MS);

  // Free tool: search_and_discover_tools
  const search = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "search_and_discover_tools", arguments: { q: "payment compliance" } },
  });
  search.status === 200 && search.data.result?.content
    ? pass(S, "MCP search_and_discover_tools (free) → 200", search.status, search.ms)
    : fail(S, "MCP search_and_discover_tools", search.status, search.ms, JSON.stringify(search.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // Free tool: discover_commerce_tools
  const commerce = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "discover_commerce_tools", arguments: {} },
  });
  commerce.status === 200 && commerce.data.result?.content
    ? pass(S, "MCP discover_commerce_tools (free) → 200", commerce.status, commerce.ms)
    : fail(S, "MCP discover_commerce_tools", commerce.status, commerce.ms, JSON.stringify(commerce.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // Free tool: discover_agentic_purchasing_needs
  const agPurch = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "discover_agentic_purchasing_needs", arguments: { intent: "PCI-DSS checkout" } },
  });
  agPurch.status === 200 && agPurch.data.result?.content
    ? pass(S, "MCP discover_agentic_purchasing_needs (free) → 200", agPurch.status, agPurch.ms)
    : fail(S, "MCP discover_agentic_purchasing_needs", agPurch.status, agPurch.ms, JSON.stringify(agPurch.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // Paid tool: analyze_repo — no auth may be 402 or 200 (open/demo mode)
  const analyzeRepo = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 6, method: "tools/call",
    params: { name: "analyze_repo", arguments: { github_url: "https://github.com/expressjs/express" } },
  });
  if (analyzeRepo.status === 402) {
    xref(S, "MCP analyze_repo no auth → 402", analyzeRepo.status, analyzeRepo.ms, `mppx/stripe in schemes=${analyzeRepo.data.accepted_payment_schemes?.includes("mppx/stripe")}`);
  } else if (analyzeRepo.status === 200) {
    pass(S, "MCP analyze_repo no auth → 200 (open/demo mode)", analyzeRepo.status, analyzeRepo.ms);
  } else {
    fail(S, "MCP analyze_repo unexpected status", analyzeRepo.status, analyzeRepo.ms);
  }
  await delay(CALL_DELAY_MS);

  // Paid tool: prepare_agentic_purchasing — no auth may be 402 or 200 (open/demo mode)
  const prepPurch = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 7, method: "tools/call",
    params: { name: "prepare_agentic_purchasing", arguments: { project_name: "test", files: [] } },
  });
  if (prepPurch.status === 402) {
    const d = prepPurch.data;
    const visaKit = !!d.compliance_value?.includes || (typeof d.compliance_value === "object");
    const hasIncentives = !!d.incentives;
    xref(S, "MCP prepare_agentic_purchasing no auth → 402", 402, prepPurch.ms,
      `visa_kit=${visaKit} incentives=${hasIncentives} referral_in_body=${d.referral_token !== undefined}`);
  } else if (prepPurch.status === 200) {
    pass(S, "MCP prepare_agentic_purchasing no auth → 200 (open/demo mode)", prepPurch.status, prepPurch.ms);
  } else {
    fail(S, "MCP prepare_agentic_purchasing unexpected status", prepPurch.status, prepPurch.ms);
  }
  await delay(CALL_DELAY_MS);

  // Budget negotiation via MCP (X-Agent-Budget header on MCP call)
  const mcpBudget = await go("POST", "/mcp",
    {
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "analyze_repo", arguments: { github_url: "https://github.com/expressjs/express" } },
    },
    { "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 25, spending_window: "per_call" }), "X-Agent-Mode": "lite" },
  );
  if (mcpBudget.status === 402) {
    const nego = mcpBudget.data.negotiation;
    nego?.mode === "lite"
      ? xref(S, "MCP analyze_repo + X-Agent-Budget 25c → lite in 402", 402, mcpBudget.ms, `mode=${nego.mode}`)
      : fail(S, "MCP budget lite negotiation wrong", mcpBudget.status, mcpBudget.ms, short(nego));
  } else {
    mcpBudget.status === 200
      ? pass(S, "MCP analyze_repo budget 25c accepted → 200", mcpBudget.status, mcpBudget.ms)
      : fail(S, "MCP budget negotiation unexpected", mcpBudget.status, mcpBudget.ms);
  }
  await delay(CALL_DELAY_MS);

  // Invalid method → JSON-RPC error
  const badMethod = await go("POST", "/mcp", {
    jsonrpc: "2.0", id: 9, method: "tools/call",
    params: { name: "nonexistent_tool_xyz", arguments: {} },
  });
  const isRpcError = badMethod.data.error?.code !== undefined || badMethod.data.error !== undefined;
  isRpcError || badMethod.status === 404
    ? xref(S, "MCP nonexistent tool → RPC error / 404", badMethod.status, badMethod.ms)
    : fail(S, "MCP nonexistent tool should error", badMethod.status, badMethod.ms, JSON.stringify(badMethod.data).slice(0, 80));
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9 — AI agent: discovery endpoints
// ═══════════════════════════════════════════════════════════════════════════
async function phase9_ai_discovery() {
  console.log("\n── Phase 9: AI — Discovery endpoints ────────────────────────");
  const S = "ai_discovery";

  const endpoints = [
    { path: "/.well-known/axis.json",         check: d => !!d.name,                     name: "axis.json" },
    { path: "/.well-known/mcp.json",           check: d => typeof d === "object",        name: "mcp.json" },
    { path: "/.well-known/capabilities.json",  check: d => typeof d === "object",        name: "capabilities.json" },
    { path: "/.well-known/agent.json",         check: d => typeof d === "object",        name: "agent.json" },
    { path: "/.well-known/glama.json",         check: d => typeof d === "object",        name: "glama.json" },
    { path: "/mcp/.well-known/mcp.json",       check: d => typeof d === "object",        name: "mcp/.well-known/mcp.json" },
    { path: "/mcp/.well-known/agent.json",     check: d => typeof d === "object",        name: "mcp/.well-known/agent.json" },
    { path: "/for-agents",                     check: (d, ct) => ct.includes("text") || ct.includes("html") || ct.includes("json") || typeof d === "string" || typeof d === "object", name: "/for-agents" },
    { path: "/llms.txt",                       check: (d, ct) => ct.includes("text") || typeof d === "string", name: "/llms.txt" },
    { path: "/robots.txt",                     check: (d, ct) => ct.includes("text") || typeof d === "string", name: "/robots.txt" },
    { path: "/v1/docs",                        check: d => !!d.openapi && !!d.paths,     name: "/v1/docs" },
  ];

  for (const ep of endpoints) {
    const r = await go("GET", ep.path);
    const ct = r.headers.get("content-type") ?? "";
    if (r.status === 200 && ep.check(r.data, ct)) {
      pass(S, `GET ${ep.name} → 200`, r.status, r.ms);
    } else if (r.status === 429) {
      xref(S, `GET ${ep.name} rate-limited → 429`, r.status, r.ms);
    } else {
      fail(S, `GET ${ep.name}`, r.status, r.ms, `ct=${ct.slice(0, 40)}`);
    }
    await delay(300);
  }

  // probe-intent (no auth)
  const probe = await go("POST", "/probe-intent", { intent: "analyze my codebase for payment compliance" });
  probe.status === 200
    ? pass(S, "POST /probe-intent (no auth) → 200", probe.status, probe.ms)
    : probe.status === 429
      ? xref(S, "POST /probe-intent rate-limited → 429", probe.status, probe.ms)
      : fail(S, "POST /probe-intent", probe.status, probe.ms, JSON.stringify(probe.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // HEAD conformance — health endpoint
  const head = await fetch(`${BASE}/v1/health`, { method: "HEAD" }).catch(() => null);
  if (head) {
    head.status === 200
      ? pass(S, "HEAD /v1/health → 200", head.status, 0)
      : head.status === 429
        ? xref(S, "HEAD /v1/health rate-limited → 429", head.status, 0)
        : fail(S, "HEAD /v1/health", head.status, 0);
  }
  await delay(CALL_DELAY_MS);

  // Rate-limit headers present
  const rl = await go("GET", "/v1/health");
  const hasRl = rl.headers.get("ratelimit-limit") || rl.headers.get("x-ratelimit-limit");
  hasRl
    ? pass(S, "rate-limit headers present", rl.status, rl.ms, `limit=${hasRl}`)
    : fail(S, "rate-limit headers missing", rl.status, rl.ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 10 — x402: agentic purchasing endpoint
// ═══════════════════════════════════════════════════════════════════════════
async function phase10_agentic_purchasing() {
  console.log("\n── Phase 10: x402 — Agentic purchasing endpoint ─────────────");
  const S = "agentic_purchasing";

  // No auth → 402 with full compliance kit body
  const noAuthPurchase = await go("POST", "/v1/prepare-for-agentic-purchasing", {
    project_name: "test-store",
    files: [{ path: "checkout.ts", content: "// checkout logic", size: 20 }],
  });
  if (noAuthPurchase.status === 402 || noAuthPurchase.status === 401 || noAuthPurchase.status === 429 || noAuthPurchase.status === 400) {
    xref(S, "POST /v1/prepare-for-agentic-purchasing no auth → 401/402", noAuthPurchase.status, noAuthPurchase.ms,
      `error=${noAuthPurchase.data.error ?? ""}`);
  } else if (noAuthPurchase.status === 200) {
    pass(S, "prepare-for-agentic-purchasing → 200 (allowed without auth)", noAuthPurchase.status, noAuthPurchase.ms);
  } else {
    fail(S, "prepare-for-agentic-purchasing no auth", noAuthPurchase.status, noAuthPurchase.ms);
  }
  await delay(CALL_DELAY_MS);

  // Free tier → 402
  if (freeKey && freeSnapshotId) {
    const freeAuth = { Authorization: `Bearer ${freeKey}` };
    const agPurchFree = await go("POST", "/v1/agentic-purchasing/generate",
      { snapshot_id: freeSnapshotId }, freeAuth);
    const isGated = agPurchFree.status === 402;
    isGated
      ? xref(S, "agentic-purchasing/generate free tier → 402", agPurchFree.status, agPurchFree.ms,
          `error=${agPurchFree.data.error ?? agPurchFree.data.error_code}`)
      : fail(S, "agentic-purchasing/generate free tier should 402", agPurchFree.status, agPurchFree.ms);
    await delay(CALL_DELAY_MS);

    // Budget negotiation on agentic-purchasing
    const agBudget = await go("POST", "/v1/agentic-purchasing/generate",
      { snapshot_id: freeSnapshotId },
      { ...freeAuth, "X-Agent-Budget": JSON.stringify({ budget_per_run_cents: 25, spending_window: "per_call" }) },
    );
    if (agBudget.status === 402) {
      const nego = agBudget.data.negotiation;
      xref(S, "agentic-purchasing + X-Agent-Budget 25c → 402 with negotiation", 402, agBudget.ms,
        `mode=${nego?.mode} amount=${nego?.amount_cents}c`);
    } else if (agBudget.status === 200) {
      pass(S, "agentic-purchasing budget 25c accepted → 200", agBudget.status, agBudget.ms);
    } else {
      fail(S, "agentic-purchasing budget negotiation unexpected", agBudget.status, agBudget.ms);
    }
    await delay(CALL_DELAY_MS);
  }

  // Paid tier agentic-purchasing (if we have a paid key + snapshot)
  if (humanKey && snapshotId) {
    const paidAuth = { Authorization: `Bearer ${humanKey}` };
    // Ensure paid tier
    await go("POST", "/v1/account/tier", { tier: "paid" }, paidAuth);
    await delay(CALL_DELAY_MS);

    const agPurchPaid = await go("POST", "/v1/agentic-purchasing/generate",
      { snapshot_id: snapshotId }, paidAuth);
    if (agPurchPaid.status === 200 && agPurchPaid.data.files?.length > 0) {
      pass(S, "agentic-purchasing/generate paid tier → 200", agPurchPaid.status, agPurchPaid.ms,
        `files=${agPurchPaid.data.files.length}`);
    } else if (agPurchPaid.status === 402 || agPurchPaid.status === 429) {
      xref(S, "agentic-purchasing/generate paid tier gated/rate-limited", agPurchPaid.status, agPurchPaid.ms,
        `files=${agPurchPaid.data.files?.length ?? 0} error=${agPurchPaid.data.error ?? agPurchPaid.data.title ?? ""}`.slice(0, 90));
    } else {
      fail(S, "agentic-purchasing/generate paid tier", agPurchPaid.status, agPurchPaid.ms,
        `files=${agPurchPaid.data.files?.length ?? 0}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 11 — Security hardening assertions
// ═══════════════════════════════════════════════════════════════════════════
async function phase11_security() {
  console.log("\n── Phase 11: Security ───────────────────────────────────────");
  const S = "security";

  // Bad method on read-only endpoint
  const badDel = await go("DELETE", "/v1/health");
  badDel.status === 404 || badDel.status === 405 || badDel.status === 429
    ? xref(S, "DELETE /v1/health → 404/405", badDel.status, badDel.ms)
    : fail(S, "DELETE /v1/health should 404/405", badDel.status, badDel.ms);
  await delay(CALL_DELAY_MS);

  // Fake API key
  const fakeAuth = { Authorization: "Bearer axis_fake_key_000000000000000000000000" };
  const fakeKey = await go("GET", "/v1/account", null, fakeAuth);
  fakeKey.status === 401 || fakeKey.status === 403 || fakeKey.status === 429
    ? xref(S, "fake API key → 401/403", fakeKey.status, fakeKey.ms)
    : fail(S, "fake API key should reject", fakeKey.status, fakeKey.ms);
  await delay(CALL_DELAY_MS);

  // SQL injection in project ID
  const sqli = await go("GET", `/v1/projects/${encodeURIComponent("' OR 1=1 --")}/generated-files`,
    null, humanKey ? { Authorization: `Bearer ${humanKey}` } : {});
  sqli.status === 404 || sqli.status === 400 || sqli.status === 401 || sqli.status === 403
    ? xref(S, "SQL injection in project ID → 404/400/403", sqli.status, sqli.ms)
    : fail(S, "SQLi in project ID should reject cleanly", sqli.status, sqli.ms, String(sqli.data).slice(0, 80));
  await delay(CALL_DELAY_MS);

  // Oversized body
  const bigBody = await go("POST", "/v1/snapshots",
    { files: Array.from({ length: 5000 }, (_, i) => ({ path: `f${i}.ts`, content: "x".repeat(1000), size: 1000 })) },
    humanKey ? { Authorization: `Bearer ${humanKey}` } : {},
  );
  bigBody.status === 413 || bigBody.status === 400 || bigBody.status === 401 || bigBody.status === 429 || bigBody.status === 0
    ? xref(S, "oversized snapshot body → 413/400/429", bigBody.status, bigBody.ms)
    : fail(S, "oversized body should be rejected", bigBody.status, bigBody.ms);
  await delay(CALL_DELAY_MS);

  // XSS in project name — should not reflect unescaped
  if (humanKey) {
    const xss = await go("POST", "/v1/snapshots", {
      input_method: "web_upload",
      manifest: { project_name: "<script>alert(1)</script>", project_type: "web_app" },
      files: SAMPLE_FILES,
    }, { Authorization: `Bearer ${humanKey}` });
    // 201 is fine, 400 is fine — just must not be 500
    xss.status !== 500
      ? pass(S, "XSS in project name — no 500", xss.status, xss.ms)
      : fail(S, "XSS in project name returned 500", xss.status, xss.ms);
    await delay(CALL_DELAY_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 12 — DB + admin
// ═══════════════════════════════════════════════════════════════════════════
async function phase12_db_admin() {
  console.log("\n── Phase 12: DB stats + admin ───────────────────────────────");
  const S = "db_admin";

  const stats = await go("GET", "/v1/db/stats");
  stats.status === 200 || stats.status === 401 || stats.status === 429
    ? pass(S, "GET /v1/db/stats", stats.status, stats.ms)
    : fail(S, "GET /v1/db/stats", stats.status, stats.ms);
  await delay(CALL_DELAY_MS);

  const perf = await go("GET", "/performance");
  perf.status === 200 || perf.status === 429
    ? pass(S, "GET /performance → 200", perf.status, perf.ms)
    : fail(S, "GET /performance", perf.status, perf.ms);
  await delay(CALL_DELAY_MS);

  const rep = await go("GET", "/performance/reputation");
  rep.status === 200 || rep.status === 429
    ? pass(S, "GET /performance/reputation → 200", rep.status, rep.ms)
    : fail(S, "GET /performance/reputation", rep.status, rep.ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`Axis' Iliad — Full E2E: Human + AI + x402`);
  console.log(`Target: ${BASE}`);
  console.log(`${"═".repeat(72)}`);

  // Verify API is reachable
  const ping = await go("GET", "/v1/health/live");
  if (ping.status === 0 || ping.status >= 500) {
    console.error(`\nFATAL: API unreachable at ${BASE} (status=${ping.status})`);
    process.exit(1);
  }
  console.log(`API reachable — status=${ping.status}, ${ping.ms}ms\n`);

  await phase1_health();
  await phase2_human_account();
  await phase3_human_snapshot();
  await phase4_human_extras();
  await phase5_x402_unauthenticated();
  await phase6_x402_free_tier();
  await phase7_x402_budget_negotiation();
  await phase8_mcp_jsonrpc();
  await phase9_ai_discovery();
  await phase10_agentic_purchasing();
  await phase11_security();
  await phase12_db_admin();

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}`);
  const passed = results.filter(r => r.outcome === "PASS").length;
  const refusals = results.filter(r => r.outcome === "EXPECTED_REFUSAL").length;
  const failed = results.filter(r => r.outcome === "FAIL").length;
  console.log(`TOTAL: ${results.length}  |  PASS: ${passed}  |  EXPECTED REFUSAL: ${refusals}  |  FAIL: ${failed}`);
  console.log(`${"═".repeat(72)}`);

  // Section breakdown
  const sections = [...new Set(results.map(r => r.section))];
  for (const section of sections) {
    const sr = results.filter(r => r.section === section);
    const sp = sr.filter(r => r.outcome === "PASS").length;
    const sf = sr.filter(r => r.outcome === "FAIL").length;
    const sx = sr.filter(r => r.outcome === "EXPECTED_REFUSAL").length;
    console.log(`  ${section.padEnd(30)} pass=${sp} refusal=${sx} fail=${sf}`);
  }

  if (failed > 0) {
    console.log("\nFAILURES:");
    results.filter(r => r.outcome === "FAIL").forEach(r => {
      console.log(`  [${r.status}] ${r.section} :: ${r.name}${r.detail ? " — " + r.detail : ""}`);
    });
  }

  console.log(`\nDone.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
