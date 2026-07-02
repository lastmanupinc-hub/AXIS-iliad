#!/usr/bin/env tsx
/**
 * Artifact Freshness Gate — CI check that AGENTS.md / CLAUDE.md
 * stay roughly in sync with the actual codebase.
 *
 * Checks:
 *  1. Route count in server.ts vs AGENTS.md "… N more" claim        (soft: warn on drift)
 *  2. Domain model count vs CLAUDE.md "defines N domain models"     (soft: warn on drift)
 *  3. Key files referenced in AGENTS.md actually exist              (hard: fail if missing)
 *
 * Calibration (fixed 2026-07-02): the two count checks are inherently FUZZY proxies —
 * the true model/route totals depend on scan scope, and a headline count drifts as the
 * codebase grows between regenerations. A CI gate must not HARD-FAIL on a fuzzy proxy
 * (that only trains people to ignore it). So count drift now WARNS; only a missing
 * key file — an unambiguous structural breakage — hard-fails (exit 1).
 *
 * The domain-model count uses the CANONICAL extractor (extractDomainModels from
 * @axis/repo-parser) — the same code path that GENERATES the "defines N domain models"
 * line in CLAUDE.md — instead of a crude `interface|type` regex that over-counted union
 * type-aliases and missed enums. The gate now measures drift the way the analyzer does.
 *
 * Exit 0 = no structural breakage (may warn on count drift), exit 1 = a key file is gone.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractDomainModels } from "../packages/repo-parser/src/domain-extractor.js";

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

// Collect non-test source files under the given roots as { path, content } —
// the FileEntry shape extractDomainModels consumes (it reads .path + .content only).
interface SrcFile { path: string; content: string; size: number }
function collectSource(roots: string[], exts: RegExp): SrcFile[] {
  const out: SrcFile[] = [];
  const isTest = (p: string) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) || p.endsWith(".d.ts");
  const walk = (dir: string) => {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs)) {
      const rel = join(dir, entry);
      const full = join(ROOT, rel);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
        walk(rel);
      } else if (exts.test(entry) && !isTest(entry)) {
        const content = readFileSync(full, "utf-8");
        out.push({ path: rel.replace(/\\/g, "/"), content, size: content.length });
      }
    }
  };
  for (const r of roots) walk(r);
  return out;
}

// ── 1. Route count (soft — warn on drift) ───────────────────────

const serverSrc = read("apps/api/src/server.ts");
const actualRoutes = (serverSrc.match(/router\.(get|post|put|delete|patch)\(/g) ?? []).length;

const agentsMd = read("AGENTS.md");
const moreRoutesMatch = agentsMd.match(/\*…\s*(\d+)\s*more.*routes/i)
  ?? agentsMd.match(/\*…\s*(\d+)\s*more\s*\(see\s*OpenAPI/i);
const explicitRoutes = (agentsMd.match(/`(GET|POST|PUT|DELETE|PATCH) \//g) ?? []).length;
const claimedExtra = moreRoutesMatch ? parseInt(moreRoutesMatch[1], 10) : 0;
const claimedTotal = explicitRoutes + claimedExtra;

const routeDelta = Math.abs(actualRoutes - claimedTotal);
if (routeDelta <= 5) {
  pass(`Route count: ${actualRoutes} actual, ${claimedTotal} documented (delta ${routeDelta})`);
} else {
  warn(`Route count drift: ${actualRoutes} actual vs ${claimedTotal} documented (delta ${routeDelta}). Consider re-running AXIS.`);
}

// ── 2. Domain model count (soft — warn on drift; CANONICAL extractor) ──

const claudeMd = read("CLAUDE.md");
const modelCountMatch = claudeMd.match(/defines\s+(\d+)\s+domain\s+models/i);
const claimedModels = modelCountMatch ? parseInt(modelCountMatch[1], 10) : 0;

// Use the same extractor the analyzer uses to generate the documented count, over the
// codebase source (apps + packages, non-test). This makes the drift measurement faithful
// instead of a crude regex that counted union type-aliases and missed enums.
const sourceFiles = collectSource(["apps", "packages"], /\.(ts|tsx|go|py)$/);
const actualModels = extractDomainModels(sourceFiles as never).length;

const modelDelta = Math.abs(actualModels - claimedModels);
if (modelDelta <= 25) {
  pass(`Domain models: ${actualModels} actual (canonical extractor), ${claimedModels} documented (delta ${modelDelta})`);
} else {
  warn(`Domain model drift: ${actualModels} actual (canonical extractor) vs ${claimedModels} documented (delta ${modelDelta}). Re-run AXIS to refresh CLAUDE.md.`);
}

// ── 3. Key file existence (hard — the only fail-worthy signal) ──

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
  console.error("FAIL — a key source file referenced by the artifacts is missing. Regenerate AGENTS.md / CLAUDE.md.");
  process.exit(1);
}
if (warnings > 0) {
  console.log("WARN — artifact counts are drifting from the codebase. Re-run AXIS analysis when convenient.");
}
process.exit(0);
