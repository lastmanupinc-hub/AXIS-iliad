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
        // 60MB declared: ABOVE the free per-file cap (raised 5MB -> 50MB in
        // b6d713c, 2026-07-31, "fix(pricing)"). This probe asserted the 5MB-era
        // behavior for two weeks after that change and nobody saw it fail,
        // because this script always exited 0 — a monitor that cannot fail.
        // Both defects fixed together (see exit code below).
        files: [{ path: "big.bin", content: "x", size: 62_914_560 }],
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
    // H8.9: known false-positive from datacenter/CI IPs, confirmed live during
    // the synthetic-monitor rehearsal — Cloudflare's bot mitigation serves a
    // "Just a moment..." JS challenge (403, cf-mitigated: challenge) to
    // GitHub Actions runner IP ranges specifically; a real browser (and this
    // exact same check run from a residential IP) gets 200 + the real bundle
    // every time. Surfacing it here so the detail message is honest about
    // WHAT happened instead of a bare "bundle not found" — see
    // EXCLUDED_FROM_AUTO_ALERT below for how this stays visible without
    // paging anyone on a false alarm.
    const cfChallenged = res.headers.get("cf-mitigated") === "challenge";
    record(
      "web_bundle_marker",
      res.status === 200 && !!match,
      cfChallenged
        ? `status=${res.status} — Cloudflare bot-mitigation challenge (cf-mitigated: challenge), known false-positive from datacenter/CI IPs, not a real deploy issue`
        : `status=${res.status} bundle=${match?.[0] ?? "not found"}`,
    );
  } catch (err) {
    record("web_bundle_marker", false, `fetch error: ${err.message}`);
  }
}

// H8.9: checks known to false-positive specifically from datacenter/CI IPs
// (currently just web_bundle_marker — see its Cloudflare-challenge comment
// above) never trigger the synthetic monitor's auto-opened issue. They stay
// fully visible in the console/log output and in `failed_names` above — this
// only narrows what the SCHEDULED MONITOR treats as alert-worthy, so a
// real, human-facing web outage (a genuine 5xx, a broken build, DNS down)
// still alerts via the other checks that exercise the same production stack
// from the same IP range. Never grows silently: adding a name here requires
// the same live-confirmed, IP-specific root cause this one has.
const EXCLUDED_FROM_AUTO_ALERT = new Set(["web_bundle_marker"]);

/**
 * No paying customer is locked out of everything.
 *
 * On 2026-08-18 an account was upgraded to `paid`, charged, and granted ZERO
 * programs — TIER_LIMITS.paid carries programs:[] ("governed by entitlements"),
 * so the tier alone opens nothing. Nobody noticed because nothing counted it.
 * This is the alarm for that exact state.
 *
 * Needs ADMIN_API_KEY (the value Render holds, not necessarily key.txt's copy —
 * those had drifted). SKIPS rather than fails when unset, so the probe stays
 * runnable without admin credentials; a check that silently passes because it
 * could not authenticate would be worse than no check.
 */
async function checkNoStrandedPayers() {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    console.log("  ○ stranded_payers — SKIPPED (ADMIN_API_KEY unset)");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json();
    const stranded = body.paid_accounts_without_entitlements;
    if (typeof stranded !== "number") {
      // Deployed API predates the field, or admin auth failed. Either way this
      // check cannot answer its question, and must not report a pass.
      record("stranded_payers", false, `field absent (status=${res.status}) — cannot verify`);
      return;
    }
    record("stranded_payers", stranded === 0, `paid accounts with zero programs=${stranded}`);
  } catch (err) {
    record("stranded_payers", false, `fetch error: ${err.message}`);
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
  await checkNoStrandedPayers();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((r) => r.name).join(", ")}`);
  }
  const alertWorthy = failed.filter((r) => !EXCLUDED_FROM_AUTO_ALERT.has(r.name));
  const suppressed = failed.filter((r) => EXCLUDED_FROM_AUTO_ALERT.has(r.name));
  if (suppressed.length > 0) {
    console.log(`SUPPRESSED (known CI-IP false positive, not alert-worthy): ${suppressed.map((r) => r.name).join(", ")}`);
  }

  // H8.9: additive, machine-readable summary for GitHub Actions consumers —
  // a harmless no-op when GITHUB_OUTPUT isn't set (e.g. running locally).
  // The synthetic monitor workflow reads these to decide whether to
  // open/update or close its dead-man's-switch issue; this script's own
  // exit code stays 0 either way (non-gating contract unchanged).
  // alert_failed_count/alert_failed_names exclude EXCLUDED_FROM_AUTO_ALERT
  // (see its definition above) — failed_count/failed_names stay the raw,
  // unfiltered totals for anyone who wants the full picture.
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `failed_count=${failed.length}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `total_count=${results.length}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `failed_names=${failed.map((r) => r.name).join(",")}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `alert_failed_count=${alertWorthy.length}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `alert_failed_names=${alertWorthy.map((r) => r.name).join(",")}\n`);
  }

  // Exit reflects reality. The old "always exit 0 — non-gating by design"
  // served a CI job that must not block merges; that CI is disabled (garage
  // doctrine, 2026-08-15) and this now runs as the OPERATOR's synthetic via
  // `ship probe`. Its one meaningful failure went invisible for two weeks
  // behind the unconditional 0 — never again.
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
