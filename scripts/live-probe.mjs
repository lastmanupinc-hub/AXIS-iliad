#!/usr/bin/env node
// H6.3: live-probe battery — a repeatable version of the manual "July systems
// check". Curls a handful of production endpoints and reports pass/fail for
// each. Non-gating by design (see HARDEN_POLISH_LOOP.md's H6.3 spec): this
// script always exits 0 so it can run in CI as an informational step without
// blocking merges on transient external-service state — a human (or the loop)
// reads the FAILED list and acts on it.
//
// Usage: pnpm run live-probe   (or: node scripts/live-probe.mjs)

const API_BASE = "https://api.iliad.trustfabric.ai";
const WEB_BASE = "https://iliad.trustfabric.ai";
const EXPECTED_MCP_TOOL_COUNT = 37; // keep in sync with apps/api/src/counts.ts MCP_TOOL_COUNT
const TIMEOUT_MS = 10_000;

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function checkHealth() {
  try {
    const { res, body } = await getJson(`${API_BASE}/v1/health`);
    record("health", res.status === 200 && body.status === "ok", `status=${res.status} body.status=${body.status}`);
  } catch (err) {
    record("health", false, `fetch error: ${err.message}`);
  }
}

async function checkReady() {
  try {
    // Only checks.shutting_down and checks.database gate readiness by design —
    // checks.payment_rail is diagnostic-only (absence degrades paid calls to 429,
    // it is never an outage), so it's surfaced below but not part of the pass test.
    const { res, body } = await getJson(`${API_BASE}/v1/health/ready`);
    record("ready", res.status === 200 && body.status === "ready", `status=${res.status} checks=${JSON.stringify(body.checks)}`);
  } catch (err) {
    record("ready", false, `fetch error: ${err.message}`);
  }
}

async function checkMcpTools() {
  try {
    const { res, body } = await getJson(`${API_BASE}/v1/mcp/server.json`);
    const count = Array.isArray(body.tools) ? body.tools.length : -1;
    record("mcp_tools_count", res.status === 200 && count === EXPECTED_MCP_TOOL_COUNT, `expected=${EXPECTED_MCP_TOOL_COUNT} actual=${count}`);
  } catch (err) {
    record("mcp_tools_count", false, `fetch error: ${err.message}`);
  }
}

async function checkPaidConfig() {
  try {
    const { res, body } = await getJson(`${API_BASE}/portal/api/paid/config`);
    record("paid_config", res.status === 200 && typeof body.configured === "boolean", `status=${res.status} configured=${body.configured}`);
  } catch (err) {
    record("paid_config", false, `fetch error: ${err.message}`);
  }
}

async function checkAnon413() {
  // A client-declared `size` field (not actual bytes sent) is enough to trip
  // the free-tier per-file size gate for an anonymous caller — confirmed
  // against apps/api/src/analyze.test.ts, so this never transmits a real
  // multi-MB payload. `programs` must name a free program (skills) or an
  // anonymous request 401s on auth before ever reaching the size check.
  try {
    const { res, body } = await getJson(`${API_BASE}/v1/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ path: "big.bin", content: "x", size: 6_291_456 }],
        programs: ["skills"],
      }),
    });
    record("anon_413_gate", res.status === 413 && body.error_code === "FILE_TOO_LARGE", `status=${res.status} error_code=${body.error_code}`);
  } catch (err) {
    record("anon_413_gate", false, `fetch error: ${err.message}`);
  }
}

async function checkWebBundle() {
  try {
    const res = await fetch(`${WEB_BASE}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const html = await res.text();
    const match = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
    record("web_bundle_marker", res.status === 200 && !!match, `status=${res.status} bundle=${match?.[0] ?? "not found"}`);
  } catch (err) {
    record("web_bundle_marker", false, `fetch error: ${err.message}`);
  }
}

async function main() {
  console.log(`[live-probe] ${new Date().toISOString()}`);
  console.log(`[live-probe] API: ${API_BASE}  WEB: ${WEB_BASE}\n`);

  await checkHealth();
  await checkReady();
  await checkMcpTools();
  await checkPaidConfig();
  await checkAnon413();
  await checkWebBundle();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((r) => r.name).join(", ")}`);
  }

  // H8.9: additive, machine-readable summary for GitHub Actions consumers —
  // a harmless no-op when GITHUB_OUTPUT isn't set (e.g. running locally).
  // The synthetic monitor workflow reads these to decide whether to
  // open/update or close its dead-man's-switch issue; this script's own
  // exit code stays 0 either way (non-gating contract unchanged).
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `failed_count=${failed.length}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `total_count=${results.length}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `failed_names=${failed.map((r) => r.name).join(",")}\n`);
  }

  // Always exit 0 — non-gating by design, see the header comment above.
  process.exit(0);
}

main();
