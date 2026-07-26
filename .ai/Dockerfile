# syntax=docker/dockerfile:1.7
# Multi-stage Node build. Builder installs all deps + compiles TS;
# runtime image only has node_modules/* needed for production + pnpm prod deps.

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build --if-present
RUN rm -rf node_modules && corepack enable && pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /src/node_modules ./node_modules
COPY --from=build --chown=app:app /src/dist ./dist
COPY --from=build --chown=app:app /src/package.json ./package.json
USER app
EXPOSE 8080
LABEL org.opencontainers.image.title="axis-iliad"
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1
CMD ["sh", "-lc", "node dist/server.js"]