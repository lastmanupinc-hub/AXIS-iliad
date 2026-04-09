# ─── Axis Toolbox — Multi-stage Production Dockerfile ────────────
#
# Build:   docker build -t axis-toolbox .
# Run:     docker run -p 4000:4000 -p 5173:5173 axis-toolbox
# API only: docker run -p 4000:4000 axis-toolbox node apps/api/dist/server.js
#
# Stages:
#   1. deps     — install all dependencies (cached layer)
#   2. builder  — build all packages and apps
#   3. runner   — minimal production image

# ── Stage 1: Install dependencies ────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile + workspace config first (cache deps layer)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY packages/snapshots/package.json packages/snapshots/package.json
COPY packages/repo-parser/package.json packages/repo-parser/package.json
COPY packages/context-engine/package.json packages/context-engine/package.json
COPY packages/generator-core/package.json packages/generator-core/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy all source
COPY . .

# Build all packages and apps
RUN pnpm -r build

# ── Stage 3: Production runner ───────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate

# Non-root user for security
RUN groupadd --gid 1001 axis && \
    useradd --uid 1001 --gid axis --shell /bin/sh --create-home axis

# Copy built artifacts and production dependencies
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/node_modules apps/api/node_modules
COPY --from=builder /app/apps/web/package.json apps/web/package.json
COPY --from=builder /app/apps/web/dist apps/web/dist
COPY --from=builder /app/apps/cli/package.json apps/cli/package.json
COPY --from=builder /app/apps/cli/dist apps/cli/dist
COPY --from=builder /app/apps/cli/bin apps/cli/bin
COPY --from=builder /app/packages/snapshots/package.json packages/snapshots/package.json
COPY --from=builder /app/packages/snapshots/dist packages/snapshots/dist
COPY --from=builder /app/packages/snapshots/node_modules packages/snapshots/node_modules
COPY --from=builder /app/packages/repo-parser/package.json packages/repo-parser/package.json
COPY --from=builder /app/packages/repo-parser/dist packages/repo-parser/dist
COPY --from=builder /app/packages/context-engine/package.json packages/context-engine/package.json
COPY --from=builder /app/packages/context-engine/dist packages/context-engine/dist
COPY --from=builder /app/packages/generator-core/package.json packages/generator-core/package.json
COPY --from=builder /app/packages/generator-core/dist packages/generator-core/dist

# Re-link workspace packages so Node can resolve @axis/* imports
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Environment
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:4000/v1/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Run as non-root
USER axis

CMD ["node", "apps/api/dist/server.js"]
