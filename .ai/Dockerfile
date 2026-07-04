# syntax=docker/dockerfile:1.7
# Multi-stage Node build. Builder installs all deps + compiles TS;
# runtime image only has node_modules/* needed for production + npm prod deps.

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* npm-shrinkwrap.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build --if-present
RUN rm -rf node_modules && npm ci --omit=dev --ignore-scripts

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