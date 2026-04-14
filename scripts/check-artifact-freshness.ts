#!/usr/bin/env tsx
/**
 * Artifact Freshness Gate — CI check that AGENTS.md / CLAUDE.md
 * stay roughly in sync with the actual codebase.
 *
 * Checks:
 *  1. Route count in server.ts vs AGENTS.md "… N more" claim
 *  2. Domain model count vs AGENTS.md/CLAUDE.md "… N more" claim
 *  3. Key files referenced in AGENTS.md actually exist
 *
 * Exit 0 = fresh enough, exit 1 = stale (needs re-generation).
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

let warnings = 0;
let errors = 0;

function warn(msg: string) {
  console.log(`⚠  ${msg}`);
  warnings++;
}
function fail(msg: string) {
  console.error(`✗  ${msg}`);
  errors++;
}
function pass(msg: string) {
  console.log(`✓  ${msg}`);
}

// ── 1. Route count ──────────────────────────────────────────────

const serverSrc = read("apps/api/src/server.ts");
const actualRoutes = (serverSrc.match(/router\.(get|post|put|delete|patch)\(/g) ?? []).length;

const agentsMd = read("AGENTS.md");
// Extract the "… N more" line in the Routes section
const moreRoutesMatch = agentsMd.match(/\*…\s*(\d+)\s*more.*routes/i)
  ?? agentsMd.match(/\*…\s*(\d+)\s*more\s*\(see\s*OpenAPI/i);
const explicitRoutes = (agentsMd.match(/`(GET|POST|PUT|DELETE|PATCH) \//g) ?? []).length;
const claimedExtra = moreRoutesMatch ? parseInt(moreRoutesMatch[1], 10) : 0;
const claimedTotal = explicitRoutes + claimedExtra;

const routeDelta = Math.abs(actualRoutes - claimedTotal);
if (routeDelta <= 5) {
  pass(`Route count: ${actualRoutes} actual, ${claimedTotal} documented (delta ${routeDelta})`);
} else if (routeDelta <= 15) {
  warn(`Route count drift: ${actualRoutes} actual vs ${claimedTotal} documented (delta ${routeDelta})`);
} else {
  fail(`Route count stale: ${actualRoutes} actual vs ${claimedTotal} documented (delta ${routeDelta}). Re-run AXIS.`);
}

// ── 2. Domain model count ───────────────────────────────────────

const claudeMd = read("CLAUDE.md");
const modelCountMatch = claudeMd.match(/defines\s+(\d+)\s+domain\s+models/i);
const claimedModels = modelCountMatch ? parseInt(modelCountMatch[1], 10) : 0;

// Count interfaces + type aliases in source
const pkgDirs = ["packages/context-engine/src", "packages/generator-core/src", "packages/repo-parser/src", "packages/snapshots/src"];
let actualModels = 0;
const countPattern = /\b(interface|type)\s+[A-Z]\w+/g;

function countInDir(dir: string) {
  const absDir = join(ROOT, dir);
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir)) {
    const full = join(absDir, entry);
    if (statSync(full).isDirectory()) {
      countInDir(join(dir, entry));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      const content = readFileSync(full, "utf-8");
      const matches = content.match(countPattern);
      if (matches) actualModels += matches.length;
    }
  }
}

countInDir("apps/api/src");
for (const d of pkgDirs) countInDir(d);

const modelDelta = Math.abs(actualModels - claimedModels);
if (modelDelta <= 10) {
  pass(`Domain models: ${actualModels} actual, ${claimedModels} documented (delta ${modelDelta})`);
} else if (modelDelta <= 25) {
  warn(`Domain model drift: ${actualModels} actual vs ${claimedModels} documented (delta ${modelDelta})`);
} else {
  fail(`Domain models stale: ${actualModels} actual vs ${claimedModels} documented (delta ${modelDelta}). Re-run AXIS.`);
}

// ── 3. Key file existence ───────────────────────────────────────

const keyFiles = [
  "apps/api/src/server.ts",
  "apps/web/src/App.tsx",
  "packages/context-engine/src/index.ts",
  "packages/generator-core/src/index.ts",
  "packages/repo-parser/src/index.ts",
];

for (const f of keyFiles) {
  if (existsSync(join(ROOT, f))) {
    pass(`Key file exists: ${f}`);
  } else {
    fail(`Key file missing: ${f} (referenced in AGENTS.md)`);
  }
}

// ── Summary ─────────────────────────────────────────────────────

console.log(`\n── Artifact freshness: ${errors} errors, ${warnings} warnings ──`);
if (errors > 0) {
  console.error("FAIL — artifacts are stale. Re-run AXIS analysis to update AGENTS.md / CLAUDE.md.");
  process.exit(1);
}
if (warnings > 0) {
  console.log("WARN — artifacts are drifting. Consider re-running AXIS analysis.");
}
process.exit(0);
