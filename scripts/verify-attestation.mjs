#!/usr/bin/env node
// Real verification for the trust-fabric bundle that release.yml attaches to
// every GitHub Release.
//
// WHY THIS EXISTS. The release step called "Verify attestation bundle" ran:
//     test -f packaging/trust-fabric/attestation.json
//     test -f packaging/trust-fabric/merkle-proof.json
// That checks the files EXIST. It never checked they were true — so a bundle
// asserting integrity over bytes that no longer match sailed into every Release
// unchallenged. An integrity check that only confirms a file is present is
// worse than none: it produces the paperwork of verification with none of it.
//
// WHAT THIS CHECKS (recompute recipe, taken from the bundle's own stated
// formula in merkle-proof.json — leaf = sha256(path + "\n" + bytes), tree built
// pairwise with the last node duplicated when odd, CRLF normalized to LF):
//   1. generated_at is a real timestamp, not the epoch
//   2. every leaf digest matches the file at that path, as shipped
//   3. the merkle root rebuilds from the leaves
//   4. the signature matches sha256(profile + ":" + root)
//
// KNOWN STATE, 2026-08-04 (verified, not assumed): this currently FAILS on
// check 2 for 5 of 9 leaves — Dockerfile, docker-compose.yml, both workflows,
// packaging/manifests/npm-package.json and Makefile. The cause is structural,
// not staleness: the bundle's leaves are produced by generator-core's
// `closerAttestedArtifacts`, which hashes what the CLOSER PROGRAM GENERATES for
// a project, not what this repository ships — while the leaf paths read like
// repo paths. The 4 that match do so only because the closer's output for them
// happens to be committed verbatim.
//
// So "regenerate at ship time" does NOT make this honest; it would attest
// generated content under repo-looking paths just as before. The remedies that
// actually resolve it are (a) re-point the attestation at the repo's real files,
// or (b) stop publishing it / mark it SAMPLE. That is an owner decision —
// docs/OPEN_WORK_STRATEGY.md §A1. This script does not choose; it makes the
// next release FAIL LOUDLY instead of quietly publishing a false claim, which
// is the correct behaviour under either remedy.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const failures = [];

let attestation;
let proof;
try {
  attestation = JSON.parse(read("packaging/trust-fabric/attestation.json"));
  proof = JSON.parse(read("packaging/trust-fabric/merkle-proof.json"));
} catch (err) {
  console.error(`attestation bundle unreadable: ${err.message}`);
  process.exit(1);
}

// 1 — a real generation time
if (!attestation.generated_at || Date.parse(attestation.generated_at) <= 0) {
  failures.push(`generated_at is not a real timestamp: ${JSON.stringify(attestation.generated_at)}`);
}

// 2 — every leaf matches the file it names, as shipped
for (const leaf of attestation.leaves ?? []) {
  let actual;
  try {
    actual = sha256(`${leaf.path}\n${read(leaf.path).replace(/\r\n/g, "\n")}`);
  } catch {
    failures.push(`${leaf.path}: attested but missing from the tree`);
    continue;
  }
  if (actual !== leaf.digest) {
    failures.push(`${leaf.path}: attested digest does not match the shipped file`);
  }
}

// 3 — the root rebuilds from the leaves
let level = (attestation.leaves ?? []).map((l) => l.digest);
if (level.length === 0) {
  failures.push("attestation has no leaves");
} else {
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(`${level[i]}${level[i + 1] ?? level[i]}`));
    level = next;
  }
  if (level[0] !== attestation.merkle_root) {
    failures.push(`merkle_root does not rebuild from the leaves (declared ${attestation.merkle_root}, rebuilt ${level[0]})`);
  }
  if (proof.merkle_root !== attestation.merkle_root) {
    failures.push("merkle-proof.json and attestation.json declare different roots");
  }
}

// 4 — signature binds the profile to the root
const expectedSignature = sha256(`${attestation.certlib_profile}:${attestation.merkle_root}`);
if (attestation.signature?.value !== expectedSignature) {
  failures.push("signature does not match sha256(certlib_profile + \":\" + merkle_root)");
}

if (failures.length > 0) {
  console.error("Attestation bundle FAILED verification — refusing to publish it:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nThis bundle is attached to the GitHub Release as an integrity claim. Publishing it\n" +
      "while it does not verify would assert something untrue about the shipped bytes.\n" +
      "See docs/OPEN_WORK_STRATEGY.md section A1 for the two remedies and why\n" +
      "'regenerate at ship time' is not one of them.",
  );
  process.exit(1);
}

console.log(`Attestation bundle verified: ${attestation.leaf_count} leaves, root ${attestation.merkle_root.slice(0, 12)}…`);
