import { describe, it, expect } from "vitest";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generatePackagingReadme,
  generatePackagingLicense,
  generateCloserReleaseWorkflow,
  generateCloserCiWorkflow,
  generateCloserManifestGitHubMarketplace,
  generateCloserPackagingReport,
} from "./generators-closer.js";

function ctxWith(over: Partial<ContextMap> = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "myproj", type: "app", primary_language: "TypeScript", description: null, repo_url: "https://github.com/o/myproj", go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    ...over,
  } as ContextMap;
}
const profile = { project: { primary_language: "TypeScript" }, health: { separation_score: 0.5 } } as unknown as RepoProfile;

// ── release workflow names the release after the REAL project (was hardcoded "project") ──
describe("POLISH: release workflow uses the real project name, not a 'project' stub", () => {
  it("names the release after ctx.project_identity.name when no branding.json is present", () => {
    const c = generateCloserReleaseWorkflow(ctxWith(), profile, []).content;
    expect(c).toContain("myproj ${{ github.ref_name }}");
    expect(c).not.toMatch(/name: "?project \$\{\{/);
  });
});

// ── honest default tagline (was "Production-grade …", contradicting the readiness band) ──
describe("POLISH: default tagline makes no unearned 'Production-grade' claim", () => {
  it("README (no branding.json) uses a neutral kit tagline", () => {
    const c = generatePackagingReadme(ctxWith(), profile, []).content;
    expect(c).toContain("Packaging and release kit for myproj");
    expect(c).not.toContain("Production-grade");
  });
});

// ── Installation installs & starts; it does not run the full release pipeline ──
describe("POLISH: Installation runs install/start, not the release pipeline", () => {
  it("README + github-marketplace Installation use `make install`/`make start`, never `make ship`", () => {
    const readme = generatePackagingReadme(ctxWith(), profile, []).content;
    const ghm = generateCloserManifestGitHubMarketplace(ctxWith(), profile, []).content;
    for (const c of [readme, ghm]) {
      expect(c).toContain("make install && make start");
      // `make ship` must not appear under an Installation heading
      const install = c.slice(c.indexOf("## Installation"));
      expect(install.slice(0, 120)).not.toContain("make ship");
    }
  });
  it("CI does not invoke the docker-heavy `make ship`", () => {
    expect(generateCloserCiWorkflow(ctxWith(), profile, []).content).not.toContain("make ship");
  });
});

// ── no fabricated contact / pricing baked into shipped files ──
describe("POLISH: no fake contact or invented pricing in shipped artifacts", () => {
  it("a Proprietary LICENSE carries a placeholder contact, not a fake @company.example", () => {
    // "internal use only" forces the Proprietary branch (which renders a contact line).
    const files: SourceFile[] = [{ path: "NOTICE", content: "internal use only", size: 20 } as SourceFile];
    const lic = generatePackagingLicense(ctxWith(), profile, files).content;
    expect(lic).toContain("Proprietary");
    expect(lic).not.toContain("@company.example");
    expect(lic).toContain("<add your legal contact>");
  });
  it("README does not hardcode a specific $ price", () => {
    const c = generatePackagingReadme(ctxWith(), profile, []).content;
    expect(c).not.toMatch(/\$\d+-\$\d+/);
  });
});

// ── monetization signal no longer fires on the mere presence of a license ──
describe("POLISH: monetization detection ignores the generic word 'license'", () => {
  it("a repo whose only 'signal' is a LICENSE file reports no monetization intent", () => {
    const files: SourceFile[] = [{ path: "LICENSE", content: "MIT License\nCopyright (c) 2026", size: 40 } as SourceFile];
    const report = generateCloserPackagingReport(ctxWith(), profile, files).content;
    expect(report).not.toContain("Monetization intent detected");
  });
  it("still fires on a genuine pricing/billing signal", () => {
    const files: SourceFile[] = [{ path: "src/billing.ts", content: "export const pricing = { subscription: true };", size: 50 } as SourceFile];
    const report = generateCloserPackagingReport(ctxWith(), profile, files).content;
    expect(report).toContain("Monetization intent detected");
  });
});
