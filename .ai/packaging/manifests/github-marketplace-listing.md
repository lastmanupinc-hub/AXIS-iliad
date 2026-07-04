# GitHub Marketplace Listing — axis-iliad

## Value Proposition
Packaging and release kit for axis-iliad

## Features
- Production packaging profile — CI, release workflow, multi-stage container.
- Marketplace manifests for npm, Unreal, VS Code, and Docker Hub.
- Trust Fabric attestation bundle with deterministic Merkle root.
- `make ship` runs the full release sequence locally before tagging.

## Installation
```bash
git clone <repo-url>
cd axis-iliad
make install && make start
```

## Verification
Every release attaches the attestation bundle. Verify after install:

```bash
cat packaging/trust-fabric/attestation.json | jq -r .merkle_root
```

## Support
Open an issue on the source repository for bug reports or feature requests. Commercial support tiers, response-time SLAs, and contact information are owned by the publisher — fill those in here before submitting the listing.

---

## ⟳ Continue the loop

- **You are here:** `packaging/manifests/github-marketplace-listing.md` — agent step 67 of 70.
- **Next:** `packaging-report.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
