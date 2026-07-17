# syntax=docker/dockerfile:1.7

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
COPY --from=builder /app /app
RUN chown -R axis:axis /app
USER axis
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]