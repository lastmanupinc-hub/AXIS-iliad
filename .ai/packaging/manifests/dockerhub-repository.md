# Docker Hub Listing — axis-iliad

## Overview
Production-grade axis-iliad packaging and release kit

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
- Signed Merkle attestation in `packaging/trust-fabric/attestation.json`.
- Multi-stage non-root build (see Dockerfile in the source repo).
- HEALTHCHECK on `/health` so orchestrators can drive rolling restarts.

## Publishing
Replace `<your-org>` above with your Docker Hub namespace before pushing:

```bash
docker tag axis-iliad:latest <your-org>/axis-iliad:latest
docker push <your-org>/axis-iliad:latest
```