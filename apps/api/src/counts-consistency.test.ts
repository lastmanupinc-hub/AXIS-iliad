import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ARTIFACT_COUNT, PROGRAM_COUNT, MCP_TOOL_COUNT, ENDPOINT_COUNT } from "./counts.js";
import { MCP_TOOLS } from "./mcp-server.js";
import { listAvailableGenerators } from "@axis/generator-core";

// apps/api/src -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("counts.ts consistency", () => {
  it("ARTIFACT_COUNT equals the live generator registry size", () => {
    expect(ARTIFACT_COUNT).toBe(listAvailableGenerators().length);
  });

  it("PROGRAM_COUNT equals the distinct generator-program count", () => {
    const programs = new Set(listAvailableGenerators().map(g => g.program));
    expect(PROGRAM_COUNT).toBe(programs.size);
  });

  it("MCP_TOOL_COUNT equals the live MCP_TOOLS array length", () => {
    // est_02: deliberately unchanged by the estate split — MCP_TOOL_COUNT is
    // "how many tools total" (agent-facing catalog honesty is build-not-redact
    // regardless of estate status), not "how many Iliad-owned tools". The
    // NON-estate count (what the human webapp's TOOL_COUNT shows) is a
    // separate, derived value — see count-honesty.test.ts's nonEstateToolCount().
    expect(MCP_TOOL_COUNT).toBe(MCP_TOOLS.length);
  });

  it("ENDPOINT_COUNT equals the live server.ts route count (excluding /.well-known + /oauth infra)", () => {
    // Derive from server.ts by parsing it as a FILE (importing it here would create the
    // very cycle counts.ts documents). Count every router.METHOD("path") registration
    // except pure protocol infrastructure: /.well-known/* discovery manifests (RFC 8615)
    // and /oauth/* authorization-server endpoints (RFC 8414). Any newly (un)registered
    // product route now drifts this count and fails CI until ENDPOINT_COUNT is updated —
    // the guard counts.ts has always claimed but never actually had.
    const serverSrc = readFileSync(new URL("./server.ts", import.meta.url), "utf-8");
    let derived = 0;
    for (const m of serverSrc.matchAll(/router\.(get|post|put|delete|patch)\("([^"]+)"/g)) {
      const path = m[2];
      if (path.startsWith("/.well-known/") || path.startsWith("/oauth/")) continue;
      derived++;
    }
    // Floor guards against a broken regex silently reporting zero and "passing".
    expect(derived, "route parser found nothing in server.ts").toBeGreaterThan(100);
    expect(ENDPOINT_COUNT).toBe(derived);
  });
});

// Root + every workspace package's own package.json -- npm-publishable surfaces
// (@axis/sdk, @axis/mpp, iliad-md) ship this text verbatim. Root said "99
// artifacts"; generator-core said "102 generators across 18 programs"; snapshots
// said "SQLite persistence" for a package that has been Postgres/Neon-backed
// since the Neon migration -- all three sat outside every honesty test's scan
// scope until R1.5/R3.1.
describe("package.json descriptions match live counts (R3.1)", () => {
  function packageJsonPaths(): string[] {
    const paths = [join(ROOT, "package.json")];
    const packagesDir = join(ROOT, "packages");
    for (const name of readdirSync(packagesDir)) {
      const pkgPath = join(packagesDir, name, "package.json");
      try {
        readFileSync(pkgPath, "utf-8");
        paths.push(pkgPath);
      } catch {
        // Not every packages/* entry is a package (or one might lack a manifest) -- skip.
      }
    }
    return paths;
  }

  // Same >=95 / >=18 floors as count-honesty.test.ts's generatorClaims/programClaims:
  // legitimate small subset mentions (a single program's file count, a per-tier
  // program count) fall under these, so only a genuine GLOBAL total claim is checked.
  const GEN_RE = /(\d+)\s*(?:\+\s*)?(?:generators?|artifacts?)\b/gi;
  const PROG_RE = /(\d+)\s+(?:programs?)\b/gi;

  it("no package.json claims a stale global generator/artifact/program total", () => {
    const paths = packageJsonPaths();
    expect(paths.length, "expected to find root + workspace package manifests").toBeGreaterThan(5);

    const bad: string[] = [];
    for (const path of paths) {
      const pkg = JSON.parse(readFileSync(path, "utf-8")) as { description?: string };
      const text = pkg.description ?? "";
      const rel = path.slice(ROOT.length + 1).replace(/\\/g, "/");
      for (const m of text.matchAll(GEN_RE)) {
        const n = Number(m[1]);
        if (n >= 95 && n !== ARTIFACT_COUNT) bad.push(`${rel}: "${m[0]}" claims ${n} (expected ${ARTIFACT_COUNT})`);
      }
      for (const m of text.matchAll(PROG_RE)) {
        const n = Number(m[1]);
        if (n >= 18 && n !== PROGRAM_COUNT) bad.push(`${rel}: "${m[0]}" claims ${n} (expected ${PROGRAM_COUNT})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("@axis/snapshots' description and keywords don't claim SQLite (it's Postgres/Neon-backed)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "snapshots", "package.json"), "utf-8")) as {
      description?: string;
      keywords?: string[];
    };
    expect((pkg.description ?? "").toLowerCase()).not.toContain("sqlite");
    expect((pkg.keywords ?? []).map((k) => k.toLowerCase())).not.toContain("sqlite");
  });
});
