# Docker Hub Listing — axis-iliad

## Overview
Packaging and release kit for axis-iliad

## Tags
- `latest` — current stable build
- `1.0.0` — pinned semver

## Quick Start
```bash
docker run --rm -p ${PORT:-8080}:8080 <your-org>/axis-iliad:latest
```

## Environment
| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `8080` | HTTP listen port. Honored by the container entrypoint. |
| `NODE_ENV` | `production` | Runtime mode. Set to `development` for verbose logging. |

## Compliance & Trust
- Merkle integrity attestation (content-derived digest, not a cryptographic signature) in `packaging/trust-fabric/attestation.json`.
- Multi-stage non-root build (see Dockerfile in the source repo).
- HEALTHCHECK on `/health` so orchestrators can drive rolling restarts.

## Publishing
Replace `<your-org>` above with your Docker Hub namespace before pushing:

```bash
docker tag axis-iliad:latest <your-org>/axis-iliad:latest
docker push <your-org>/axis-iliad:latest
```

---

## ⟳ Continue the loop

- **You are here:** `packaging/manifests/dockerhub-repository.md` — agent step 66 of 70.
- **Next:** `packaging/manifests/github-marketplace-listing.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
