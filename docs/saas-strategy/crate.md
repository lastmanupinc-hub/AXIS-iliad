# Crate — `closer` as a standalone product

**Landing page:** `crate.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 16 generated files

---

## The problem it closes

The distance between working code and a shippable package — LICENSE, README, Dockerfile, CI, release manifests, marketplace metadata — is a week of unglamorous work that gets skipped, and then the project never ships.

16 generators covering packaging, licensing, containerisation and marketplace certification artifacts.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `DISTRIBUTABLE.md`
- `Dockerfile`
- `Makefile`
- `docker-compose.yml`
- `packaging-report.md`
- `packaging/LICENSE`
- `packaging/README.md`
- `packaging/manifests/dockerhub-repository.md`
- `packaging/manifests/github-marketplace-listing.md`
- `packaging/manifests/npm-package.json`
- `packaging/manifests/unreal.uplugin`
- `packaging/manifests/vscode-extension.json`
- `packaging/trust-fabric/attestation.json`
- `packaging/trust-fabric/merkle-proof.json`

## Standalone verdict

Sellable. Second-largest program, and 9 of 16 outputs are real files rather than advice.

## Gap before this can be sold alone

Marketplace certification is asserted, not verified against any actual marketplace's requirements. If npm or the VS Code marketplace changes rules, we would not know.

## Pricing thesis

$49 one-time per package. This is a moment-in-time need, not a subscription — pricing it monthly would fight the use case.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Crate is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
