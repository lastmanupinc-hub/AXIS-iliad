# syntax=docker/dockerfile:1.7

# D2 (https://d2lang.com, MPL-2.0) — a single Go binary the canvas Watch
# consumer (apps/api/src/canvas-diagram-watcher.ts) shells out to at runtime.
# Installed in its own stage so curl/make/ca-certificates never bloat the
# slim runtime image — only the resulting /usr/local/bin/d2 binary is copied.
FROM node:26-bookworm-slim AS d2
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates make \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://d2lang.com/install.sh | sh -s -- --prefix /usr/local

FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY CHANGELOG.md begin.yaml continuation.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN corepack enable && corepack prepare pnpm@10 --activate && pnpm install --frozen-lockfile

FROM node:26-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app /app
RUN corepack enable && corepack prepare pnpm@10 --activate && pnpm run build

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r axis && useradd -r -g axis axis
COPY --from=d2 /usr/local/bin/d2 /usr/local/bin/d2
COPY --from=builder /app /app
RUN chown -R axis:axis /app
USER axis
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]