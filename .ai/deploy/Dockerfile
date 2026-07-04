# syntax=docker/dockerfile:1.7
# AXIS deploy/Dockerfile — local-build → registry → Render existing-image pull.
# Detected stack: node-server (package manager: npm). Build from repo root:
#   docker build -f deploy/Dockerfile -t ghcr.io/<owner>/axis-iliad:prod .

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
# Skip build step gracefully if the project has no build script.
RUN npm run build --if-present

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
# Adjust entrypoint to match your built output path.
CMD ["node", "dist/index.js"]
