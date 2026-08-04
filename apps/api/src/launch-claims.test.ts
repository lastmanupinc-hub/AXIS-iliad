import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// Shared with every other honesty guard — see count-extractors.ts. The CORPUS
// below stays scoped per SPEC-12; only the extraction logic is shared.
import { visible, programClaims, generatorClaims, endpointClaims } from "./count-extractors.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ARTIFACT_COUNT, PROGRAM_COUNT, ENDPOINT_COUNT, MCP_TOOL_COUNT, API_VERSION } from "./counts.js";
import { PLAN_CATALOG, MARKETED_TIERS } from "@axis/snapshots";

// apps/api/src -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ─── Minimal hand-rolled LAUNCH_CLAIMS.yaml reader ──────────────
//
// The `yaml` package is not a workspace dependency (per SPEC-12: don't add one
// for this). LAUNCH_CLAIMS.yaml has a fixed, narrow shape this file controls —
// a flat list of claims, each `  - id: ...` followed by `    key: value` lines,
// with exactly one nested flow-map value (`pricing`'s `{ ... }`). This parser
// only needs to handle that shape, not general YAML.

interface Claim {
  id: string;
  text: string;
  value: unknown;
  source: string;
  status: string;
  verified_at?: string;
}

function parseScalar(raw: string): unknown {
  if (raw.startsWith("{")) {
    const inner = raw.slice(1, raw.lastIndexOf("}"));
    const obj: Record<string, number> = {};
    for (const pair of inner.split(",")) {
      const [k, v] = pair.split(":").map((s) => s.trim());
      if (k) obj[k] = Number(v);
    }
    return obj;
  }
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseLaunchClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  let current: Record<string, unknown> | null = null;
  const flush = () => {
    if (current) claims.push(current as unknown as Claim);
    current = null;
  };
  // Split on CRLF or LF: on a Windows (autocrlf) checkout the file has CRLF, and
  // a trailing \r would otherwise ride along in every value ("artifact_count\r",
  // "140\r" → not a number), silently emptying the registry and no-opping the gate.
  for (const rawLine of text.split(/\r?\n/)) {
    const itemMatch = rawLine.match(/^ {2}- (\w+): (.*)$/);
    if (itemMatch) {
      flush();
      current = { [itemMatch[1]]: parseScalar(itemMatch[2].trim()) };
      continue;
    }
    const fieldMatch = rawLine.match(/^ {4}(\w+): (.*)$/);
    if (fieldMatch && current) {
      current[fieldMatch[1]] = parseScalar(fieldMatch[2].trim());
    }
  }
  flush();
  return claims;
}

function loadClaims(): Claim[] {
  return parseLaunchClaims(readFileSync(join(ROOT, "LAUNCH_CLAIMS.yaml"), "utf8"));
}

function claimById(claims: Claim[], id: string): Claim {
  const c = claims.find((x) => x.id === id);
  if (!c) throw new Error(`LAUNCH_CLAIMS.yaml: no claim with id "${id}"`);
  return c;
}

// ─── Launch corpus (NOT the same scope as count-honesty's README+web) ──

function corpus(): Array<{ name: string; text: string }> {
  const files = [
    "launch-content.md",
    "marketing-pack.md",
    "AXIS_Board_Pitch.md",
    // Hand-maintained root packs, added 2026-08-04 after
    // count-surface-coverage.test.ts found they were guarded by NOTHING and had
    // gone stale: "102 Artifacts" (real 143) and "75+ REST endpoints" (real
    // 166), untouched since 2026-06-30. Siblings of marketing-pack.md in every
    // respect — hand-maintained, repo-root, customer-facing — and outside the
    // corpus only because nothing had forced the question.
    //
    // obsidian-vault-pack.md and superpowers-pack.md are NOT here yet, on
    // purpose: their counts are now correct, but both still assert "81/82 at
    // Grade A" — the unverifiable capability-inventory self-audit SPEC-12
    // already stripped from this corpus. Removing it from them is a content
    // call for the owner, not something a test refactor should do silently, so
    // they are exempted in count-surface-coverage.test.ts with that reason
    // recorded rather than quietly rewritten here.
    "canvas-pack.md",
    "remotion-pack.md",
  ];
  return files.map((name) => ({ name, text: readFileSync(join(ROOT, name), "utf8") }));
}

const VALID_STATUSES = new Set(["verified", "needs_regeneration_before_publish", "forbidden_until_owner_decision"]);

describe("LAUNCH_CLAIMS.yaml registry hygiene", () => {
  it("every claim has id/text/value/source/status, unique ids, and a recognized status", () => {
    const claims = loadClaims();
    expect(claims.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const c of claims) {
      expect(c.id, "a claim is missing id").toBeTruthy();
      expect(c.text, `${c.id}: missing text`).toBeTruthy();
      expect(c.value !== undefined && c.value !== null, `${c.id}: missing value`).toBe(true);
      expect(c.source, `${c.id}: missing source`).toBeTruthy();
      expect(VALID_STATUSES.has(c.status), `${c.id}: unrecognized status "${c.status}"`).toBe(true);
      expect(seen.has(c.id), `duplicate claim id "${c.id}"`).toBe(false);
      seen.add(c.id);
    }
  });
});

describe("LAUNCH_CLAIMS.yaml registry vs live constants", () => {
  it("counts-backed entries equal the canonical counts.ts constants", () => {
    const claims = loadClaims();
    expect(claimById(claims, "artifact_count").value).toBe(ARTIFACT_COUNT);
    expect(claimById(claims, "program_count").value).toBe(PROGRAM_COUNT);
    expect(claimById(claims, "endpoint_count").value).toBe(ENDPOINT_COUNT);
    expect(claimById(claims, "mcp_tool_count").value).toBe(MCP_TOOL_COUNT);
    expect(claimById(claims, "api_version").value).toBe(API_VERSION);
  });

  it("the pricing entry equals PLAN_CATALOG's live monthly prices", () => {
    const claims = loadClaims();
    const pricing = claimById(claims, "pricing").value as { starter_cents: number; pro_cents: number; growth_cents: number };
    const byId = (id: string) => PLAN_CATALOG.find((p) => p.id === id)!;
    expect(pricing.starter_cents).toBe(byId("starter").price_monthly_cents);
    expect(pricing.pro_cents).toBe(byId("pro").price_monthly_cents);
    expect(pricing.growth_cents).toBe(byId("growth").price_monthly_cents);
  });

  it("the billing_tiers entry equals MARKETED_TIERS' live monthly credit grants", () => {
    const claims = loadClaims();
    const b = claimById(claims, "billing_tiers").value as {
      free_credits: number;
      starter_credits: number;
      pro_credits: number;
      growth_credits: number;
    };
    const byId = (id: string) => MARKETED_TIERS.find((t) => t.plan_id === id)!;
    expect(b.free_credits).toBe(10000);
    expect(b.starter_credits).toBe(75000);
    expect(b.pro_credits).toBe(300000);
    expect(b.growth_credits).toBe(1200000);
    expect(b.free_credits).toBe(byId("free").monthly_credits);
    expect(b.starter_credits).toBe(byId("starter").monthly_credits);
    expect(b.pro_credits).toBe(byId("pro").monthly_credits);
    expect(b.growth_credits).toBe(byId("growth").monthly_credits);
  });

  it("the open_source claim stays forbidden until the registry itself is flipped by the owner", () => {
    const claims = loadClaims();
    const claim = claimById(claims, "open_source");
    if (claim.value === false) {
      expect(claim.status).toBe("forbidden_until_owner_decision");
    }
  });
});

describe("launch corpus vs the registry (SPEC-12)", () => {
  it("every GLOBAL artifact/generator/output total in the launch corpus equals ARTIFACT_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const n of generatorClaims(visible(text))) if (n !== ARTIFACT_COUNT) bad.push(`${name}: ${n} (expected ${ARTIFACT_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  it("every GLOBAL program total in the launch corpus equals PROGRAM_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const n of programClaims(visible(text))) if (n !== PROGRAM_COUNT) bad.push(`${name}: ${n} (expected ${PROGRAM_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  it("every advertised endpoint total in the launch corpus equals ENDPOINT_COUNT", () => {
    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const n of endpointClaims(visible(text))) if (n !== ENDPOINT_COUNT) bad.push(`${name}: ${n} (expected ${ENDPOINT_COUNT})`);
    }
    expect(bad).toEqual([]);
  });

  it("no stale SQLite/better-sqlite3/FTS5 data-layer claims (the store is Neon Postgres)", () => {
    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const m of text.matchAll(/\b(?:SQLite|better-sqlite3|FTS5)\b/gi)) bad.push(`${name}: "${m[0]}"`);
    }
    expect(bad).toEqual([]);
  });

  it("no unverifiable 'N capabilities … Grade A' self-audit claims in the corpus", () => {
    // The capability-grade numbers ("81/82", "83/83", "all 82 … Grade A") trace
    // to a stale capability_inventory.yaml (v0.5.0, predating this program) and
    // can't be verified against runtime — SPEC-12 removed them. This guards the
    // class the numbers-only gate (generatorClaims etc.) structurally can't see,
    // so a reworded "capabilities at Grade A" can't creep back into launch copy.
    const CAPABILITY_GRADE = /capabilit(?:y|ies)\b[^.\n]{0,40}\bgrade\s*a\b/gi;
    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const m of visible(text).matchAll(CAPABILITY_GRADE)) bad.push(`${name}: "${m[0].trim()}"`);
    }
    expect(bad).toEqual([]);
  });

  // Targets the SELF-referential phrasings SPEC-12 actually names ("now open
  // source", "I open-sourced") rather than any bare co-occurrence of the words —
  // AXIS_Board_Pitch.md legitimately discusses THIRD-PARTY open-source projects
  // (Style Dictionary, Remotion) and audience segments ("open-source
  // maintainers"), and that file gets a numbers-only pass, not a prose rewrite.
  const SELF_CLAIM_OPEN_SOURCE = /\bnow\s+open[- ]?sourced?\b|\bI(?:'ve| have)?\s+open[- ]?sourced\b|\bjust\s+open[- ]?sourced\b|#open[- ]?source\b/gi;

  it("no self-referential 'open source' claim while the registry's open_source entry is unverified", () => {
    const claims = loadClaims();
    const openSource = claimById(claims, "open_source");
    if (openSource.value === true) return; // owner has flipped the registry — the phrase is allowed now

    const bad: string[] = [];
    for (const { name, text } of corpus()) {
      for (const m of text.matchAll(SELF_CLAIM_OPEN_SOURCE)) bad.push(`${name}: "${m[0]}"`);
    }
    expect(bad).toEqual([]);
  });
});
