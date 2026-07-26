# syntax=docker/dockerfile:1.7
# AXIS deploy/Dockerfile — local-build → registry → Render existing-image pull.
# Detected stack: node-server (package manager: pnpm). Build from repo root:
#   docker build -f deploy/Dockerfile -t ghcr.io/<owner>/axis-iliad:prod .
# NOTE: monorepo detected — the build below runs at the repo root and the
#       runtime CMD assumes ./dist. Point WORKDIR/COPY/CMD at your deployable
#       app (e.g. apps/<service>) before pushing.

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile
COPY . .
# Skip build step gracefully if the project has no build script.
RUN pnpm run build --if-present

FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
# Copy resolved dependencies + build output from the builder (package-manager-agnostic).
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER app
# Monorepo: build output is likely apps/<service>/dist — set CMD to your service entry.
CMD ["node", "dist/index.js"]
