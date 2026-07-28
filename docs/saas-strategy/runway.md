# Runway — `deploy` as a standalone product

**Landing page:** `runway.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 13 generated files

---

## The problem it closes

Getting an unfamiliar service deployable means writing a Dockerfile that actually builds, a compose file for local parity, and platform config — usually by trial and error against a slow CI loop.

13 generators producing Dockerfile, .dockerignore, docker-compose, render.yaml and wrangler configs shaped to the detected stack.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `deploy/Dockerfile`
- `deploy/Dockerfile.dockerignore`
- `deploy/deploy-cloudflare.ps1`
- `deploy/deploy-cloudflare.sh`
- `deploy/deploy-qualification-report.md`
- `deploy/deploy.ps1`
- `deploy/deploy.sh`
- `deploy/docker-compose.dev.yml`
- `deploy/render.yaml`
- `deploy/vscode-launch.json.template`
- `deploy/worker.ts`
- `deploy/wrangler.containers.toml`
- `deploy/wrangler.pages.toml`

## Standalone verdict

Sellable. The output is runnable, which is rare in this portfolio, and the pain is acute and recurring.

## Gap before this can be sold alone

We never execute what we emit. A Dockerfile that does not build is worse than none, and today nothing proves it builds. This is the single highest-value gap in the portfolio: add a build-verification step and this becomes defensible.

## Pricing thesis

$19/mo, or $49 one-time per service. Deployment is bursty — subscription fits teams, one-time fits contractors.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Runway is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
