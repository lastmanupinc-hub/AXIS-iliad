#!/usr/bin/env bash
# AXIS deploy/deploy.sh — local build → GHCR push, no CI minutes consumed.
# Usage:
#   GHCR_OWNER=youruser  ./deploy/deploy.sh         # builds + pushes :prod
#   GHCR_OWNER=youruser  ./deploy/deploy.sh v1.2.3  # custom tag
#
# Prereqs:
#   docker login ghcr.io  -u <user>  --password-stdin   (PAT with write:packages)

set -euo pipefail

: "${GHCR_OWNER:?Set GHCR_OWNER, e.g. export GHCR_OWNER=yourgithubuser}"
TAG="${1:-prod}"
IMAGE="ghcr.io/${GHCR_OWNER}/axis-iliad:${TAG}"

echo "▶ Building ${IMAGE}"
docker build -f deploy/Dockerfile -t "${IMAGE}" .

echo "▶ Pushing ${IMAGE}"
docker push "${IMAGE}"

echo "✓ Pushed ${IMAGE}"
echo
echo "Next:"
echo "  Render dashboard → axis-iliad service → Manual Deploy → Deploy latest image"
echo "  (or set autoDeploy: true in deploy/render.yaml to redeploy on every push)"
