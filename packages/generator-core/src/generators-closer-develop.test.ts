import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  generateCloserTrustAttestation,
  generateCloserMerkleProof,
  generateCloserDockerfile,
  generatePackagingReadme,
  generateMakefileWithShipTarget,
  generateCloserManifestGitHubMarketplace,
  generateCloserDockerCompose,
  generateCloserCiWorkflow,
  generateCloserReleaseWorkflow,
  generateCloserManifestNpm,
  generateCloserManifestUnreal,
  generateCloserManifestVsCode,
  generatePackagingLicense,
  generateCloserManifestDockerHub,
  generateCloserPackagingReport,
  generateDistributableGuide,
} from "./generators-closer.js";
import { appendAutonomyLoop } from "./autonomy-loop.js";
import type { GeneratedFile } from "./types.js";

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
    const dockerfile = generateCloserDockerfile(ctxWith(), profile, files);
    const leaf = att.leaves.find((l: { path: string }) => l.path === "Dockerfile");
    expect(leaf.digest).toBe(sha256(`${dockerfile.path}\n${dockerfile.content}`));
  });
  it("tampering with any artifact's content changes the Merkle root", () => {
    const rootA = JSON.parse(generateCloserTrustAttestation(ctxWith("alpha"), profile, files).content).merkle_root;
    const rootB = JSON.parse(generateCloserTrustAttestation(ctxWith("bravo"), profile, files).content).merkle_root;
    expect(rootA).not.toBe(rootB);
  });
  it("attests only the verbatim-shipped build/config files — no self-attestation, no footered docs", () => {
    const att = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    expect(att.leaf_count).toBe(9);
    expect(att.leaves.some((l: { path: string }) => l.path.includes("trust-fabric"))).toBe(false);
    // markdown docs carry a post-generation ⟳ footer, so they can't be content-attested here
    expect(att.leaves.some((l: { path: string }) => l.path.endsWith(".md"))).toBe(false);
  });
  it("the attestation and merkle-proof compute an identical root, deterministically", () => {
    const att = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    const mp = JSON.parse(generateCloserMerkleProof(ctxWith(), profile, files).content);
    expect(mp.merkle_root).toBe(att.merkle_root);
    const att2 = JSON.parse(generateCloserTrustAttestation(ctxWith(), profile, files).content);
    expect(att2.merkle_root).toBe(att.merkle_root);
    expect(att.merkle_root).toHaveLength(64);
  });

  // END-TO-END: the recompute recipe must reproduce every leaf on the SHIPPED
  // package — i.e. AFTER appendAutonomyLoop footers the markdown. Attesting a
  // footered doc would make an untouched package verify as tampered; this test
  // fails if any footered file ever re-enters the attested set.
  it("every attested leaf recomputes on the post-footer shipped files", () => {
    const gens = [
      generatePackagingReadme, generatePackagingLicense, generateCloserDockerfile, generateCloserDockerCompose,
      generateCloserCiWorkflow, generateCloserReleaseWorkflow, generateCloserManifestNpm, generateCloserManifestUnreal,
      generateCloserManifestVsCode, generateCloserManifestDockerHub, generateCloserManifestGitHubMarketplace,
      generateCloserPackagingReport, generateDistributableGuide, generateMakefileWithShipTarget,
      generateCloserTrustAttestation, generateCloserMerkleProof,
    ];
    const result = { files: gens.map((g) => g(ctxWith(), profile, files)) as GeneratedFile[] };
    appendAutonomyLoop(result, ctxWith()); // footers every .md IN PLACE, like the real ship path
    const footered = result.files.filter((f) => f.content_type === "text/markdown" && f.content.includes("Continue"));
    expect(footered.length).toBeGreaterThan(0); // the hazard is real: docs DID get footered
    const att = JSON.parse(result.files.find((f) => f.path.endsWith("attestation.json"))!.content);
    for (const leaf of att.leaves as Array<{ path: string; digest: string }>) {
      const shipped = result.files.find((f) => f.path === leaf.path)!;
      expect(sha256(`${shipped.path}\n${shipped.content}`), `leaf ${leaf.path} must match shipped bytes`).toBe(leaf.digest);
    }
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
