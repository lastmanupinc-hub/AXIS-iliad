// spoke_06's actual deliverable: proof that a spoke is a NARROWED hub run, not a
// second implementation. "A spoke whose output drifts from the hub is a bug."
//
// The assertion is byte-identity, per product, against the real registry and the
// real generator set — because the failure this prevents (REST/MCP twin
// divergence) is a named recurring bug family here, and it never looks like a
// bug at the time. It looks like a small convenient special case.
import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import { generateFiles } from "./generate.js";
import { PRODUCT_REGISTRY } from "./product-registry.js";
import { GENERATOR_PROGRAMS } from "./program-manifest.js";
import { outputsForPrograms, outputsForProduct, programsForProduct } from "./spoke-scope.js";
import type { GeneratorInput } from "./types.js";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";

function registry(): Array<{ id: string; programs: string[] }> {
  const r = PRODUCT_REGISTRY as unknown;
  return (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)) as Array<{
    id: string;
    programs: string[];
  }>;
}

// A repo with enough shape that most generators produce real content. The
// SnapshotRecord shape (manifest + files + counts) is the one the context engine
// actually consumes — the first draft passed a flat {project_name, files} and
// every test in the file errored at collection rather than failing an assertion.
const BR = String.fromCharCode(10); // literal newline without an escape sequence

function makeSnapshot(): SnapshotRecord {
  const files: FileEntry[] = [
    { path: "package.json", content: '{"name":"spoke-fixture","dependencies":{"react":"19.0.0","next":"14.0.0"},"devDependencies":{"typescript":"5.7.0","vitest":"2.0.0"}}', size: 150 },
    { path: "src/index.tsx", content: "export function App() { return <h1>hi</h1>; }", size: 60 },
    { path: "src/server.ts", content: "app.get('/health', (_q, r) => r.json({ ok: true }));", size: 70 },
    { path: "src/models.ts", content: "export interface User { id: string; email: string }", size: 60 },
    { path: "components/Button.tsx", content: "export function Button() { return <button>go</button> }", size: 70 },
    { path: "README.md", content: "# Fixture" + BR + BR + "A fixture repo for the spoke/hub identity guard.", size: 70 },
    { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}', size: 45 },
    { path: "tests/index.test.ts", content: 'import { test } from "vitest";' + BR + 'test("works", () => {});', size: 60 },
  ];
  return {
    snapshot_id: "snap-spoke-001",
    project_id: "proj-spoke-001",
    created_at: "2026-08-17T00:00:00.000Z",
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "spoke-fixture",
      project_type: "web_application",
      frameworks: ["next", "react"],
      goals: ["Prove a spoke is a narrowed hub run"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  } as SnapshotRecord;
}

function inputFor(requested: string[]): GeneratorInput {
  const snapshot = makeSnapshot();
  return {
    context_map: buildContextMap(snapshot),
    repo_profile: buildRepoProfile(snapshot),
    requested_outputs: requested,
  } as GeneratorInput;
}

/** Every output the hub can emit. */
const ALL_OUTPUTS = Object.keys(GENERATOR_PROGRAMS).sort();

describe("spoke scope — resolved from the registry, not hand-maintained", () => {
  it("resolves a product's programs from the registry", () => {
    expect(programsForProduct(registry(), "theme")).toEqual(["theme"]);
  });

  it("distinguishes an unknown product from one that sells nothing", () => {
    // null vs [] — an unknown id is a caller bug; an empty program set is a
    // legitimate (if odd) answer. Collapsing them hides the bug.
    expect(programsForProduct(registry(), "no-such-product")).toBeNull();
    expect(outputsForProduct(registry(), "no-such-product")).toBeNull();
    expect(outputsForPrograms([])).toEqual([]);
  });

  it("derives outputs from the generator manifest, so a new artifact needs no edit here", () => {
    const themeOutputs = outputsForProduct(registry(), "theme")!;
    const fromManifest = Object.entries(GENERATOR_PROGRAMS)
      .filter(([, program]) => program === "theme")
      .map(([generator]) => generator)
      .sort();
    expect(themeOutputs).toEqual(fromManifest);
    expect(themeOutputs.length).toBeGreaterThan(0);
  });
});

// ─── the guard ──────────────────────────────────────────────────────
describe("a spoke is a narrowed hub run — byte-identical, never a fork", () => {
  // Generated once: the hub's full output is the reference every spoke is
  // compared against.
  const hub = generateFiles(inputFor(ALL_OUTPUTS));
  const hubByPath = new Map(hub.files.map((f) => [f.path, f.content]));

  it("the hub fixture actually produced files (guards against a vacuous comparison)", () => {
    expect(hub.files.length).toBeGreaterThan(20);
  });

  it("every product's spoke run is byte-identical to the hub's, file for file", () => {
    const drifted: string[] = [];
    let compared = 0;
    for (const product of registry()) {
      const requested = outputsForProduct(registry(), product.id);
      expect(requested, `${product.id} is in the registry but resolved to null`).not.toBeNull();

      const spoke = generateFiles(inputFor(requested!));
      for (const file of spoke.files) {
        const hubVersion = hubByPath.get(file.path);
        if (hubVersion === undefined) continue; // spoke-only core file, covered below
        compared++;
        if (hubVersion !== file.content) drifted.push(`${product.id}:${file.path}`);
      }
    }

    // Without this, the assertion below is VACUOUS: if no spoke path were ever
    // found in the hub map, every file would `continue` and `drifted` would be
    // empty while comparing nothing at all. 147 generators across 21 products
    // means the real number is in the hundreds.
    expect(compared, "the identity check compared no files — the guard is not actually running").toBeGreaterThan(150);
    expect(
      drifted,
      "A spoke produced different bytes than the hub for the same artifact. A spoke must be the " +
        "SAME generators with a narrowed program set — never a forked path. This is the REST/MCP " +
        "twin-divergence bug family, repeated 21 times.",
    ).toEqual([]);
  });

  it("a spoke emits its own program's artifacts and does not silently emit the whole hub", () => {
    const themeOutputs = outputsForProduct(registry(), "theme")!;
    const spoke = generateFiles(inputFor(themeOutputs));
    const paths = new Set(spoke.files.map((f) => f.path));

    for (const output of themeOutputs) expect(paths.has(output), `theme spoke missing ${output}`).toBe(true);
    // generateFiles always adds the three core search outputs; beyond those, a
    // theme spoke must not be emitting another program's artifacts.
    expect(paths.has("brand-guidelines.md")).toBe(false);
    expect(paths.has("pitch-deck.md")).toBe(false);
    expect(spoke.files.length).toBeLessThan(hub.files.length);
  });

  it("skips nothing for any product — every registry program resolves to real generators", () => {
    const broken: string[] = [];
    for (const product of registry()) {
      const spoke = generateFiles(inputFor(outputsForProduct(registry(), product.id)!));
      if (spoke.skipped.length > 0) broken.push(`${product.id}: ${spoke.skipped.map((s) => s.path).join(",")}`);
    }
    expect(broken, "a product's registry program set names an output no generator produces").toEqual([]);
  });
});
