import { describe, it, expect } from "vitest";
import { runHygieneScan, buildRemediationPlan, buildHygienePatch, buildHygieneSarif, type HygieneFile } from "./hygiene.js";

const f = (path: string, content: string): HygieneFile => ({ path, content, size: Buffer.byteLength(content, "utf-8") });

describe("iliad_hygiene rule engine", () => {
  it("grades a clean, well-covered file set highly (no high/medium findings)", () => {
    const r = runHygieneScan([
      f("src/a.ts", "export const a = 1;\n"),
      f("src/a.test.ts", "import { a } from './a'; test('a', () => expect(a).toBe(1));\n"),
      f(".gitignore", "node_modules/\ndist/\n"),
    ]);
    expect(r.counts.high).toBe(0);
    expect(r.counts.medium).toBe(0);
    expect(["A", "B"]).toContain(r.grade);
  });

  it("flags a committed live secret as high and caps the grade at F", () => {
    const r = runHygieneScan([f("config.ts", 'export const KEY = "sk_live_0123456789abcdefghij";\n')]);
    expect(r.grade).toBe("F");
    const secret = r.findings.find(x => x.ruleId === "secret_scan");
    expect(secret?.severity).toBe("high");
  });

  it("does NOT flag placeholder/test secrets (false-positive guard)", () => {
    const r = runHygieneScan([
      f("readme.md", "use sk_live_xxxxxxxxxxxxxxxx as a placeholder"),
      f("api_test.go", 'key := "sk_live_abcdef1234567890"'),
    ]);
    expect(r.findings.filter(x => x.ruleId === "secret_scan")).toHaveLength(0);
  });

  it("detects a .env secret-file gitignore gap as high severity", () => {
    const r = runHygieneScan([f(".env", "TOKEN=plainvalue\n"), f(".gitignore", "dist/\n")]);
    const gap = r.findings.find(x => x.ruleId === "gitignore_gaps");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("high");
  });

  it("flags an oversized tracked file", () => {
    const big = "x".repeat(600_000);
    const r = runHygieneScan([f("vendor/blob.js", big)]);
    expect(r.findings.some(x => x.ruleId === "large_files")).toBe(true);
  });

  it("flags stub/placeholder markers in non-test code", () => {
    const r = runHygieneScan([f("src/handler.ts", "export function h() { /* TODO: implement */ throw new Error('not implemented'); }")]);
    expect(r.findings.some(x => x.ruleId === "stub_detection")).toBe(true);
  });

  it("detects byte-identical duplicate files", () => {
    const body = "export const shared = 42;\n// some logic here\n";
    const r = runHygieneScan([f("src/one.ts", body), f("src/two.ts", body)]);
    expect(r.findings.some(x => x.ruleId === "duplicate_content")).toBe(true);
  });

  it("reports source test-peer coverage and dimension", () => {
    const r = runHygieneScan([f("src/x.ts", "export const x = 1;"), f("src/y.ts", "export const y = 2;")]);
    const dim = r.dimensions.find(d => d.id === "test_peer_coverage");
    expect(dim).toBeDefined();
    expect(dim?.detail).toMatch(/coverage=/);
  });

  it("buildRemediationPlan orders by severity and emits gitignore additions", () => {
    const r = runHygieneScan([
      f(".env", "SECRET=sk_live_0123456789abcdefghij\n"),
      f("node_modules/pkg/index.js", "module.exports = {}"),
      f(".gitignore", ""),
    ]);
    const plan = buildRemediationPlan(r);
    expect(plan.ordered_steps.length).toBeGreaterThan(0);
    expect(plan.ordered_steps[0].severity).toBe("high"); // secrets first
    expect(plan.gitignore_additions).toContain("node_modules/");
  });

  it("is deterministic: identical input yields identical output", () => {
    const files = [f("src/a.ts", "export const a = 1;"), f(".env", "K=sk_live_0123456789abcdefghij")];
    expect(JSON.stringify(runHygieneScan(files))).toBe(JSON.stringify(runHygieneScan(files)));
  });

  it("never runs repo-only rules and lists them", () => {
    const r = runHygieneScan([f("a.ts", "export const a = 1;")]);
    expect(r.repo_only_rules.length).toBeGreaterThan(0);
    expect(r.findings.some(x => x.ruleId === "worktree_pruning")).toBe(false);
  });

  // ─── regression: dogfood fixes (env templates, pytest coverage, stub intent, aggregation) ───

  it("does NOT flag a committed .env.example template, and it cannot force an F", () => {
    const r = runHygieneScan([
      f(".env.example", "STRIPE_KEY=sk_live_your_key_here\nDB_URL=changeme\n"),
      f("src/a.ts", "export const a = 1;\n"),
      f("src/a.test.ts", "test('a',()=>{});\n"),
      f(".gitignore", ".env\n"),
    ]);
    expect(r.findings.some(x => x.ruleId === "gitignore_gaps" && x.path === ".env.example")).toBe(false);
    expect(r.grade).not.toBe("F");
  });

  it("still flags a real committed .env (not a template) as high", () => {
    const r = runHygieneScan([f(".env", "TOKEN=plainvalue\n"), f(".gitignore", "dist/\n")]);
    const gap = r.findings.find(x => x.ruleId === "gitignore_gaps");
    expect(gap?.severity).toBe("high");
  });

  it("credits a separate pytest tests/ tree as coverage (not just co-located peers)", () => {
    const r = runHygieneScan([
      f("pkg/foo.py", "def foo():\n    return 1\n"),
      f("pkg/bar.py", "def bar():\n    return 2\n"),
      f("tests/test_foo.py", "from pkg.foo import foo\n\ndef test_foo():\n    assert foo() == 1\n"),
      f("tests/test_bar.py", "from pkg.bar import bar\n\ndef test_bar():\n    assert bar() == 2\n"),
    ]);
    const dim = r.dimensions.find(d => d.id === "test_peer_coverage");
    expect(dim?.detail).toMatch(/coverage=100%/);
  });

  it("floors coverage to >= B when a substantial suite exists despite non-mirroring test names", () => {
    const sources = Array.from({ length: 4 }, (_, i) => f(`pkg/m${i}.py`, `def m${i}():\n    return ${i}\n`));
    const tests = Array.from({ length: 4 }, (_, i) => f(`tests/test_feature_${i}.py`, `def test_${i}():\n    assert True\n`));
    const r = runHygieneScan([...sources, ...tests]);
    const dim = r.dimensions.find(d => d.id === "test_peer_coverage");
    expect(dim?.detail).toMatch(/suite-floored/);
    expect(["A", "B"]).toContain(dim?.grade);
  });

  it("does NOT flag intentional NotImplementedError guards / tombstones / detector mentions / data files", () => {
    const r = runHygieneScan([
      f("engine/pipeline.py", 'def n(fmt):\n    raise NotImplementedError(\n        f"No normalizer for format {fmt}"\n    )\n'),
      f("engine/meshy_backend.py", "_RemovedError = NotImplementedError\n"),
      f("tools/grade_repo.py", 'import re\nNOT_IMPL = re.compile(r"\\bNotImplementedError\\b")\n'),
      f("CAPABILITY_GAP_MATRIX.yaml", "rows:\n  - gap: roi_stub\n    note: not implemented yet, tracked\n"),
    ]);
    expect(r.findings.filter(x => x.ruleId === "stub_detection")).toHaveLength(0);
  });

  it("DOES flag a genuine TODO-tagged stub", () => {
    const r = runHygieneScan([f("engine/rig.py", 'def rig():\n    raise NotImplementedError("TODO: implement quadruped rigging")\n')]);
    expect(r.findings.some(x => x.ruleId === "stub_detection")).toBe(true);
  });

  it("does not let a single non-secret medium finding crater the grade below B", () => {
    const r = runHygieneScan([
      f("data/blob.json", "x".repeat(600_000)), // oversized → medium
      f("src/a.ts", "export const a=1;"),
      f("src/a.test.ts", "test('a',()=>{});"),
    ]);
    expect(r.counts.high).toBe(0);
    expect(["A", "B"]).toContain(r.grade);
  });

  it("recommends pruning (not import) for byte-identical non-code assets", () => {
    const body = "v 0 0 0\nv 1 1 1\nf 1 1 1\n";
    const r = runHygieneScan([f("assets/a.obj", body), f("assets/b.obj", body)]);
    const dup = r.findings.find(x => x.ruleId === "duplicate_content");
    expect(dup?.recommendedAction).toMatch(/remove the redundant/);
  });
});

// ─── Engineer tier (E1): patch + SARIF ──────────────────────────
// Minimal applier for the two patch shapes this engine emits, so the test
// proves the patch is semantically correct (not just well-formed).
function applyGitignorePatch(original: string, patch: string): string {
  const adds = patch.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).map(l => l.slice(1));
  if (patch.includes("--- /dev/null")) return adds.join("\n") + "\n";
  return original.replace(/\n+$/, "") + "\n" + adds.join("\n") + "\n";
}

describe("iliad_hygiene — engineer tier (patch + SARIF)", () => {
  it("creates a /dev/null .gitignore patch when none exists, and it applies", () => {
    const files = [f("dist/app.js", "console.log(1)")];
    const patch = buildHygienePatch(runHygieneScan(files), files);
    expect(patch).toContain("--- /dev/null");
    expect(patch).toContain("+++ b/.gitignore");
    expect(patch).toContain("@@ -0,0 +1,");
    expect(patch).toMatch(/^\+dist\/$/m);
    expect(applyGitignorePatch("", patch)).toContain("dist/");
  });

  it("appends to an existing .gitignore with the last line as context, and it applies", () => {
    const existing = "node_modules/\n";
    const files = [f("dist/app.js", "x"), f(".gitignore", existing)];
    const patch = buildHygienePatch(runHygieneScan(files), files);
    expect(patch).toContain("--- a/.gitignore");
    expect(patch).toContain(" node_modules/"); // single context line
    expect(patch).toMatch(/^\+dist\/$/m);
    const applied = applyGitignorePatch(existing, patch);
    expect(applied).toContain("node_modules/");
    expect(applied).toContain("dist/");
  });

  it("returns an empty patch when there is nothing safely auto-fixable", () => {
    const files = [f("src/a.ts", "export const a = 1;\n"), f("src/a.test.ts", "test('a',()=>{})\n")];
    expect(buildHygienePatch(runHygieneScan(files), files)).toBe("");
  });

  it("emits a valid SARIF 2.1.0 log with severity→level mapping", () => {
    const files = [f("config.ts", 'export const KEY = "sk_live_0123456789abcdefghij";\n')];
    const sarif = buildHygieneSarif(runHygieneScan(files)) as Record<string, unknown>;
    expect(sarif.version).toBe("2.1.0");
    const run = (sarif.runs as Array<Record<string, unknown>>)[0];
    const driver = (run.tool as Record<string, Record<string, unknown>>).driver;
    expect(driver.name).toBe("iliad-hygiene");
    const results = run.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    const secret = results.find(r => r.ruleId === "secret_scan")!;
    expect(secret.level).toBe("error"); // high → error
    const loc = (secret.locations as Array<Record<string, Record<string, Record<string, string>>>>)[0];
    expect(loc.physicalLocation.artifactLocation.uri).toBe("config.ts");
  });
});
