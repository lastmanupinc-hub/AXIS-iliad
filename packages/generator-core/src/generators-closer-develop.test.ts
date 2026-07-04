import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateCloserTrustAttestation,
  generateCloserMerkleProof,
  generatePackagingReadme,
  generateMakefileWithShipTarget,
  generateCloserManifestGitHubMarketplace,
} from "./generators-closer.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function ctxWith(name = "myproj"): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name, type: "app", primary_language: "TypeScript", description: null, repo_url: "https://github.com/o/r", go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000, file_tree_summary: [] as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
    dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const profile = { project: { primary_language: "TypeScript" }, health: { separation_score: 0.5 } } as unknown as RepoProfile;
const files: SourceFile[] = [];

// ── the Merkle attestation is genuinely CONTENT-derived (was: path + IDs only) ──
describe("DEVELOP: trust-fabric attestation covers real file content", () => {
  it("each leaf digest is sha256(path + '\\n' + content) of the actual artifact", () => {
    const att = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    const readme = generatePackagingReadme(ctxWith(), profile, files);
    const leaf = att.leaves.find((l: { path: string }) => l.path === "packaging/README.md");
    expect(leaf.digest).toBe(sha256(`${readme.path}\n${readme.content}`));
  });
  it("tampering with any artifact's content changes the Merkle root", () => {
    const rootA = JSON.parse(generateCloserTrustAttestation(ctxWith("alpha"), profile, files).content).merkle_root;
    const rootB = JSON.parse(generateCloserTrustAttestation(ctxWith("bravo"), profile, files).content).merkle_root;
    expect(rootA).not.toBe(rootB);
  });
  it("excludes the two trust-fabric files from its own leaves (no self-attestation)", () => {
    const att = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    expect(att.leaf_count).toBe(14);
    expect(att.leaves.some((l: { path: string }) => l.path.includes("trust-fabric"))).toBe(false);
  });
  it("the attestation and merkle-proof compute an identical root, deterministically", () => {
    const att = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    const mp = JSON.parse(generateCloserMerkleProof(ctxWith(), profile, files).content);
    expect(mp.merkle_root).toBe(att.merkle_root);
    const att2 = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    expect(att2.merkle_root).toBe(att.merkle_root);
    expect(att.merkle_root).toHaveLength(64);
  });
});

// ── the two verification paths now work (were: wrong field / missing script) ──
describe("DEVELOP: verification consumers reference real fields, not phantoms", () => {
  it("consumers read .merkle_root (the real field), never .digest", () => {
    const mk = generateMakefileWithShipTarget(ctxWith(), profile, files).content;
    const ghm = generateCloserManifestGitHubMarketplace(ctxWith(), profile, files).content;
    for (const c of [mk, ghm]) {
      expect(c).toContain(".merkle_root");
      expect(c).not.toMatch(/jq[^\n]*\.digest\b/);
    }
  });
  it("the merkle-proof documents a real recompute recipe, not a missing verify-attestation.js", () => {
    const mp = generateCloserMerkleProof(ctxWith(), profile, files).content;
    expect(mp).not.toContain("verify-attestation.js");
    const parsed = JSON.parse(mp);
    expect(parsed.verification.recompute_leaf).toContain("sha256sum");
  });
});
