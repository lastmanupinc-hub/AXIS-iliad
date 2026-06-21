# GitHub Marketplace Listing — axis-iliad

## Value Proposition
Production-grade axis-iliad packaging and release kit

## Features
- Production packaging profile — CI, release workflow, multi-stage container.
- Marketplace manifests for npm, Unreal, VS Code, and Docker Hub.
- Trust Fabric attestation bundle with deterministic Merkle root.
- `make ship` runs the full release sequence locally before tagging.

## Installation
```bash
git clone <repo-url>
cd axis-iliad
make ship
```

## Verification
Every release attaches the attestation bundle. Verify after install:

```bash
cat packaging/trust-fabric/attestation.json | jq .digest
```

## Support
Open an issue on the source repository for bug reports or feature requests. Commercial support tiers, response-time SLAs, and contact information are owned by the publisher — fill those in here before submitting the listing.