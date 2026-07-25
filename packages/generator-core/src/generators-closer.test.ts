import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import {
  generatePackagingReadme,
  generatePackagingLicense,
  generateCloserDockerfile,
  generateCloserDockerCompose,
  generateCloserCiWorkflow,
  generateCloserReleaseWorkflow,
  generateCloserManifestNpm,
  generateCloserManifestUnreal,
  generateCloserManifestVsCode,
  generateCloserManifestDockerHub,
  generateCloserManifestGitHubMarketplace,
  generateCloserTrustAttestation,
  generateCloserMerkleProof,
  generateCloserPackagingReport,
  generateDistributableGuide,
  generateMakefileWithShipTarget,
} from "./generators-closer.js";

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  const files: FileEntry[] = [
    {
      path: "src/main.ts",
      content: "export function main() { return 'ok'; }",
      size: 38,
    },
    {
      path: "README.md",
      content: "# Demo\nMarketplace ready plugin and subscription tiers.",
      size: 59,
    },
    {
      path: "closer.config.json",
      content: JSON.stringify(
        {
          product_name: "Closer Demo Product",
          tagline: "Ship your almost-done build as a premium marketplace-ready product",
          target_marketplaces: ["npm", "vscode", "github-marketplace"],
        },
        null,
        2,
      ),
      size: 176,
    },
  ];

  return {
    snapshot_id: "snap-closer-001",
    project_id: "proj-closer-001",
    created_at: new Date().toISOString(),
    input_method: "api_submission",
    manifest: {
      project_name: "closer-demo",
      project_type: "library",
      frameworks: ["node"],
      goals: ["package for marketplace"],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
    status: "ready",
    account_id: null,
    ...overrides,
  };
}

describe("generators-closer", () => {
  const snapshot = makeSnapshot();
  const ctx = buildContextMap(snapshot);
  const profile = buildRepoProfile(snapshot);

  it("generates packaging README with required commercial sections", () => {
    const file = generatePackagingReadme(ctx, profile, snapshot.files);
    expect(file.path).toBe("packaging/README.md");
    expect(file.program).toBe("closer");
    expect(file.content_type).toBe("text/markdown");
    expect(file.content).toContain("Why Teams Buy This");
    expect(file.content).toContain("Installation");
    expect(file.content).toContain("Trust Signals");
    expect(file.content).toContain("Monetization");
  });

  it("selects a valid license and emits packaging/LICENSE", () => {
    const file = generatePackagingLicense(ctx, profile, snapshot.files);
    expect(file.path).toBe("packaging/LICENSE");
    expect(file.program).toBe("closer");
    expect(file.content.length).toBeGreaterThan(100);
    expect(
      file.content.includes("MIT License") ||
        file.content.includes("Apache License") ||
        file.content.includes("Proprietary License"),
    ).toBe(true);
  });

  it("generates container + CI + release automation files", () => {
    const dockerfile = generateCloserDockerfile(ctx, profile, snapshot.files);
    const compose = generateCloserDockerCompose(ctx, profile, snapshot.files);
    const ci = generateCloserCiWorkflow(ctx, profile, snapshot.files);
    const release = generateCloserReleaseWorkflow(ctx, profile, snapshot.files);

    expect(dockerfile.path).toBe("Dockerfile");
    expect(compose.path).toBe("docker-compose.yml");
    expect(ci.path).toBe(".github/workflows/ci.yml");
    expect(release.path).toBe(".github/workflows/release.yml");
    // POLISH: CI runs install/lint/test/build/audit directly; the docker-heavy
    // `make ship` step was redundant (and re-ran the whole release pipeline).
    expect(ci.content).toContain("actions/checkout@v4");
    expect(ci.content).not.toContain("make ship");
    expect(release.content).toContain("workflow_dispatch");
  });

  it("release workflow installs with pnpm when a pnpm-lock.yaml marker is present", () => {
    const pnpmFiles: FileEntry[] = [
      ...snapshot.files,
      { path: "pnpm-lock.yaml", content: "", size: 0 },
    ];
    const pnpmSnapshot = makeSnapshot({ files: pnpmFiles, file_count: pnpmFiles.length });
    const pnpmCtx = buildContextMap(pnpmSnapshot);
    const pnpmProfile = buildRepoProfile(pnpmSnapshot);

    const release = generateCloserReleaseWorkflow(pnpmCtx, pnpmProfile, pnpmSnapshot.files);

    expect(release.content).toContain("pnpm/action-setup@v4");
    expect(release.content).toContain("pnpm install --frozen-lockfile");
    expect(release.content).not.toContain("npm ci");
  });

  it("never recommends `npm publish` for a private root package.json (R0.3)", () => {
    // A monorepo whose root manifest is private (this repo's own shape) has no
    // single package to publish from root -- defaulting to "publish to npm"
    // here produced a release workflow that failed on every tag push.
    const privateRootFiles: FileEntry[] = [
      ...snapshot.files,
      { path: "package.json", content: JSON.stringify({ name: "root", private: true }), size: 40 },
    ];
    const privateSnapshot = makeSnapshot({ files: privateRootFiles, file_count: privateRootFiles.length });
    const privateCtx = buildContextMap(privateSnapshot);
    const privateProfile = buildRepoProfile(privateSnapshot);

    const release = generateCloserReleaseWorkflow(privateCtx, privateProfile, privateSnapshot.files);

    expect(release.content).not.toContain("Publish to npm");
    expect(release.content).not.toContain("npm publish");
  });

  it("still recommends npm publish when the root package.json is not private", () => {
    // The demo fixture's closer.config.json requests target_marketplaces
    // including "npm" and has no root package.json at all (root_package_private
    // stays false) -- publishing should still be recommended by default.
    const release = generateCloserReleaseWorkflow(ctx, profile, snapshot.files);
    expect(release.content).toContain("Publish to npm");
  });

  it("generates all marketplace manifests under packaging/manifests", () => {
    const manifests = [
      generateCloserManifestNpm(ctx, profile, snapshot.files),
      generateCloserManifestUnreal(ctx, profile, snapshot.files),
      generateCloserManifestVsCode(ctx, profile, snapshot.files),
      generateCloserManifestDockerHub(ctx, profile, snapshot.files),
      generateCloserManifestGitHubMarketplace(ctx, profile, snapshot.files),
    ];

    const paths = manifests.map(f => f.path);
    expect(paths).toContain("packaging/manifests/npm-package.json");
    expect(paths).toContain("packaging/manifests/unreal.uplugin");
    expect(paths).toContain("packaging/manifests/vscode-extension.json");
    expect(paths).toContain("packaging/manifests/dockerhub-repository.md");
    expect(paths).toContain("packaging/manifests/github-marketplace-listing.md");

    const jsonManifests = manifests.filter(f => f.content_type === "application/json");
    for (const manifest of jsonManifests) {
      expect(() => JSON.parse(manifest.content)).not.toThrow();
    }
  });

  it("builds trust fabric attestation bundle with merkle metadata", () => {
    const attestation = generateCloserTrustAttestation(ctx, profile, snapshot.files);
    const proof = generateCloserMerkleProof(ctx, profile, snapshot.files);

    expect(attestation.path).toBe("packaging/trust-fabric/attestation.json");
    expect(proof.path).toBe("packaging/trust-fabric/merkle-proof.json");

    const attestationJson = JSON.parse(attestation.content) as {
      certlib_profile: string;
      merkle_root: string;
      signature: { value: string };
      leaf_count: number;
    };
    const proofJson = JSON.parse(proof.content) as { merkle_root: string; levels: string[][] };

    expect(attestationJson.certlib_profile).toBe("certlib-offline-v1");
    expect(attestationJson.merkle_root.length).toBe(64);
    expect(attestationJson.signature.value.length).toBe(64);
    // DEVELOP: attests the verbatim-shipped build/config files (9) — the 2 trust-fabric
    // files (self-reference) and the 5 footered markdown docs are excluded.
    expect(attestationJson.leaf_count).toBeGreaterThan(5);
    expect(proofJson.merkle_root).toBe(attestationJson.merkle_root);
    expect(proofJson.levels.length).toBeGreaterThan(1);
  });

  it("generates packaging report with score and remaining steps", () => {
    const file = generateCloserPackagingReport(ctx, profile, snapshot.files);
    expect(file.path).toBe("packaging-report.md");
    expect(file.content).toContain("Readiness Score");
    expect(file.content).toContain("Auto-Added");
    expect(file.content).toContain("Remaining Human Steps");
    expect(file.content).toContain("Commercial Potential");
  });

  it("generates DISTRIBUTABLE guide and Makefile with ship target", () => {
    const guide = generateDistributableGuide(ctx, profile, snapshot.files);
    const makefile = generateMakefileWithShipTarget(ctx, profile, snapshot.files);

    expect(guide.path).toBe("DISTRIBUTABLE.md");
    expect(guide.content).toContain("Ship Checklist");
    expect(makefile.path).toBe("Makefile");
    // The ship target gates on clean → install → lint → test → build → package → attest.
    // We don't pin the exact dependency list (it can grow), but we require ship to depend
    // on the four core stages and to be marked .PHONY so it always runs.
    expect(makefile.content).toMatch(/^ship:.*\btest\b.*\bbuild\b.*\bpackage\b.*\battest\b/m);
    expect(makefile.content).toContain(".PHONY:");
    expect(makefile.content).toMatch(/\bship\b/);
  });
});
