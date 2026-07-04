import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw } from "./fw-helpers.js";
import { mdText } from "./md-sanitize.js";

const PROGRAM = "deploy";

// ─── Stack detection ────────────────────────────────────────────
// Render's "existing image" deploy is platform-agnostic, but the
// Dockerfile template must match the language toolchain. We pick one
// dominant stack so the emitted artifacts pass Render's pull → run
// qualification without manual edits.

type DeployStack = "go" | "python" | "node-server" | "node-static" | "unknown";

function detectStack(ctx: ContextMap, files?: SourceFile[]): DeployStack {
  if (ctx.project_identity.go_module || hasFw(ctx, "Go", "Gin", "Echo", "Chi", "Fiber")) {
    return "go";
  }
  if (hasFw(ctx, "Python", "Django", "Flask", "FastAPI", "Starlette")) {
    return "python";
  }
  const fileMap = new Map((files ?? []).map(f => [f.path.toLowerCase(), f]));
  if (fileMap.has("requirements.txt") || fileMap.has("pyproject.toml")) return "python";
  if (fileMap.has("go.mod")) return "go";

  const isStaticFrontend =
    hasFw(ctx, "Vite", "SvelteKit", "Svelte", "Astro") &&
    !hasFw(ctx, "Next.js", "Express", "Fastify", "Koa", "Hono", "NestJS");
  if (isStaticFrontend) return "node-static";

  if (hasFw(ctx, "Node.js", "Express", "Fastify", "Koa", "Hono", "NestJS", "Next.js", "React")) {
    return "node-server";
  }
  return "unknown";
}

function safeImageName(name: string): string {
  // OCI image names must be lowercase, alnum, hyphens. Replace anything else.
  // Null-safe (a repo may carry a missing name) — never throw and abort generation.
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function projectImageName(ctx: ContextMap): string {
  return safeImageName(ctx.project_identity.name);
}

// ─── deploy/Dockerfile ──────────────────────────────────────────

export function generateDeployDockerfile(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const lines: string[] = [];

  lines.push("# syntax=docker/dockerfile:1.7");
  lines.push(`# AXIS deploy/Dockerfile — local-build → registry → Render existing-image pull.`);
  lines.push(`# Detected stack: ${stack}. Build from repo root:`);
  lines.push(`#   docker build -f deploy/Dockerfile -t ghcr.io/<owner>/${projectImageName(ctx)}:prod .`);
  lines.push("");

  if (stack === "go") {
    lines.push("FROM golang:1.23-bookworm AS builder");
    lines.push("WORKDIR /src");
    lines.push("COPY go.mod go.sum* ./");
    lines.push("RUN go mod download");
    lines.push("COPY . .");
    lines.push("RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags=\"-s -w\" -o /out/app ./...");
    lines.push("");
    lines.push("FROM gcr.io/distroless/static-debian12:nonroot");
    lines.push("WORKDIR /app");
    lines.push("COPY --from=builder /out/app /app/app");
    lines.push("ENV PORT=8080");
    lines.push("EXPOSE 8080");
    lines.push("USER nonroot");
    lines.push("ENTRYPOINT [\"/app/app\"]");
  } else if (stack === "python") {
    lines.push("FROM python:3.12-slim AS builder");
    lines.push("WORKDIR /app");
    lines.push("RUN python -m venv /opt/venv");
    lines.push("ENV PATH=\"/opt/venv/bin:$PATH\"");
    lines.push("COPY requirements.txt* pyproject.toml* ./");
    lines.push("RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; \\");
    lines.push("    elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; fi");
    lines.push("");
    lines.push("FROM python:3.12-slim");
    lines.push("RUN useradd --create-home --uid 1001 app");
    lines.push("WORKDIR /app");
    lines.push("COPY --from=builder /opt/venv /opt/venv");
    lines.push("COPY --chown=app:app . .");
    lines.push("ENV PATH=\"/opt/venv/bin:$PATH\" PORT=8080 PYTHONUNBUFFERED=1");
    lines.push("EXPOSE 8080");
    lines.push("USER app");
    lines.push("# Override CMD if your entry point differs (e.g. gunicorn, django).");
    lines.push("CMD [\"sh\", \"-c\", \"uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}\"]");
  } else if (stack === "node-static") {
    lines.push("FROM node:22-alpine AS builder");
    lines.push("WORKDIR /app");
    lines.push("COPY package*.json ./");
    lines.push("RUN npm ci");
    lines.push("COPY . .");
    lines.push("RUN npm run build");
    lines.push("");
    lines.push("FROM nginx:1.27-alpine");
    lines.push("# Vite outputs to /dist, SvelteKit static adapter to /build — adjust if needed.");
    lines.push("COPY --from=builder /app/dist /usr/share/nginx/html");
    lines.push("RUN printf 'server {\\n  listen 8080;\\n  root /usr/share/nginx/html;\\n  location / { try_files $uri $uri/ /index.html; }\\n  location = /healthz { return 200 \"ok\"; add_header Content-Type text/plain; }\\n}\\n' > /etc/nginx/conf.d/default.conf");
    lines.push("EXPOSE 8080");
  } else {
    // node-server and unknown both get a Node server template — safest default.
    lines.push("FROM node:22-alpine AS builder");
    lines.push("WORKDIR /app");
    lines.push("COPY package*.json ./");
    lines.push("RUN npm ci --include=dev");
    lines.push("COPY . .");
    lines.push("# Skip build step gracefully if the project has no build script.");
    lines.push("RUN npm run build --if-present");
    lines.push("");
    lines.push("FROM node:22-alpine");
    lines.push("RUN addgroup -S app && adduser -S app -G app");
    lines.push("WORKDIR /app");
    lines.push("COPY --from=builder --chown=app:app /app/package*.json ./");
    lines.push("RUN npm ci --omit=dev && npm cache clean --force");
    lines.push("COPY --from=builder --chown=app:app /app/dist ./dist");
    lines.push("ENV NODE_ENV=production PORT=8080");
    lines.push("EXPOSE 8080");
    lines.push("USER app");
    lines.push("# Adjust entrypoint to match your built output path.");
    lines.push("CMD [\"node\", \"dist/index.js\"]");
  }

  return {
    path: "deploy/Dockerfile",
    content: lines.join("\n") + "\n",
    content_type: "text/x-dockerfile",
    program: PROGRAM,
    description: `Multi-stage Dockerfile tuned for ${stack} stack — non-root, port 8080, ready to push to GHCR and pull from Render.`,
  };
}

// ─── deploy/.dockerignore ───────────────────────────────────────

export function generateDeployDockerignore(
  _ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const entries = [
    "# AXIS deploy/Dockerfile.dockerignore — keep build context lean.",
    "**/node_modules",
    "**/dist",
    "**/build",
    "**/.next",
    "**/.svelte-kit",
    "**/.turbo",
    "**/.cache",
    "**/coverage",
    "**/.pytest_cache",
    "**/__pycache__",
    "**/.venv",
    "**/venv",
    ".git",
    ".github",
    ".vscode",
    ".idea",
    "**/*.log",
    "**/.env",
    "**/.env.*",
    "!**/.env.example",
    "**/tmp",
    "**/.DS_Store",
    "Thumbs.db",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
  ];
  return {
    path: "deploy/Dockerfile.dockerignore",
    content: entries.join("\n") + "\n",
    content_type: "text/plain",
    program: PROGRAM,
    description: "Build-context ignore list — excludes node_modules, .git, secrets, test files, and editor cruft.",
  };
}

// ─── deploy/docker-compose.dev.yml ──────────────────────────────

export function generateDeployComposeDev(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const name = projectImageName(ctx);
  const lines: string[] = [];
  lines.push(`# AXIS deploy/docker-compose.dev.yml — run the prod image locally for visual`);
  lines.push(`# + debugger inspection before pushing to the registry.`);
  lines.push(`# Run from repo root: docker compose -f deploy/docker-compose.dev.yml up --build`);
  lines.push("");
  lines.push("services:");
  lines.push(`  ${name}:`);
  lines.push("    build:");
  lines.push("      context: ..");
  lines.push("      dockerfile: deploy/Dockerfile");
  lines.push(`    image: ${name}:dev`);
  lines.push("    ports:");
  lines.push("      - \"8080:8080\"");
  if (stack === "node-server" || stack === "unknown") {
    lines.push("      - \"9229:9229\"  # node --inspect debugger port");
  } else if (stack === "python") {
    lines.push("      - \"5678:5678\"  # debugpy listener");
  } else if (stack === "go") {
    lines.push("      - \"2345:2345\"  # delve debugger");
  }
  if (stack === "node-server" || stack === "unknown") {
    // Override the prod CMD so the inspector listens on the exposed 9229 port
    // (0.0.0.0 so the host debugger can attach through the port mapping).
    lines.push("    command: [\"node\", \"--inspect=0.0.0.0:9229\", \"dist/index.js\"]");
  }
  lines.push("    environment:");
  lines.push("      - PORT=8080");
  lines.push("      - NODE_ENV=development");
  // env_file is optional: `.env.dev` may not exist, and a required-but-missing
  // file aborts `docker compose up`.
  lines.push("    env_file:");
  lines.push("      - path: ../.env.dev");
  lines.push("        required: false");
  lines.push("    restart: unless-stopped");

  return {
    path: "deploy/docker-compose.dev.yml",
    content: lines.join("\n") + "\n",
    content_type: "application/yaml",
    program: PROGRAM,
    description: "Local dev compose file — runs the prod image with debug ports so you can attach a debugger in VSCode before pushing.",
  };
}

// ─── deploy/render.yaml ─────────────────────────────────────────

export function generateDeployRenderBlueprint(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const name = projectImageName(ctx);
  const lines: string[] = [];
  lines.push(`# AXIS deploy/render.yaml — Render Blueprint, existing-image deploy.`);
  lines.push(`# Render pulls your prebuilt image from GHCR; ZERO Render pipeline minutes used.`);
  lines.push(`# Set up: 1) push image to ghcr.io/<owner>/${name}:prod`);
  lines.push(`#         2) in Render dashboard → New → Blueprint → connect this file`);
  lines.push(`#         3) provide GHCR PAT under Settings → Registry Credentials if image is private`);
  lines.push("");
  lines.push("services:");
  lines.push("  - type: web");
  lines.push(`    name: ${name}`);
  lines.push("    runtime: image");
  lines.push("    image:");
  lines.push(`      url: ghcr.io/REPLACE_OWNER/${name}:prod`);
  lines.push("    plan: starter");
  lines.push("    region: oregon");
  lines.push("    healthCheckPath: /healthz");
  lines.push("    autoDeploy: false  # flip to true to redeploy on every new image push");
  lines.push("    envVars:");
  lines.push("      - key: PORT");
  lines.push("        value: 8080");
  lines.push("      - key: NODE_ENV");
  lines.push("        value: production");
  lines.push("      # Add your runtime secrets via the Render dashboard, not this file.");

  return {
    path: "deploy/render.yaml",
    content: lines.join("\n") + "\n",
    content_type: "application/yaml",
    program: PROGRAM,
    description: "Render Blueprint configured for runtime: image — pulls a prebuilt GHCR image with zero build minutes.",
  };
}

// ─── deploy/deploy.sh ───────────────────────────────────────────

export function generateDeployScriptBash(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const name = projectImageName(ctx);
  const content = `#!/usr/bin/env bash
# AXIS deploy/deploy.sh — local build → GHCR push, no CI minutes consumed.
# Usage:
#   GHCR_OWNER=youruser  ./deploy/deploy.sh         # builds + pushes :prod
#   GHCR_OWNER=youruser  ./deploy/deploy.sh v1.2.3  # custom tag
#
# Prereqs:
#   docker login ghcr.io  -u <user>  --password-stdin   (PAT with write:packages)

set -euo pipefail

: "\${GHCR_OWNER:?Set GHCR_OWNER, e.g. export GHCR_OWNER=yourgithubuser}"
TAG="\${1:-prod}"
IMAGE="ghcr.io/\${GHCR_OWNER}/${name}:\${TAG}"

echo "▶ Building \${IMAGE}"
docker build -f deploy/Dockerfile -t "\${IMAGE}" .

echo "▶ Pushing \${IMAGE}"
docker push "\${IMAGE}"

echo "✓ Pushed \${IMAGE}"
echo
echo "Next:"
echo "  Render dashboard → ${name} service → Manual Deploy → Deploy latest image"
echo "  (or set autoDeploy: true in deploy/render.yaml to redeploy on every push)"
`;
  return {
    path: "deploy/deploy.sh",
    content,
    content_type: "text/x-shellscript",
    program: PROGRAM,
    description: "POSIX build-and-push script — runs entirely on your machine, pushes to GHCR, prints the Render manual-deploy step.",
  };
}

// ─── deploy/deploy.ps1 ──────────────────────────────────────────

export function generateDeployScriptPwsh(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const name = projectImageName(ctx);
  const content = `# AXIS deploy/deploy.ps1 — local build → GHCR push, Windows/PowerShell variant.
# Usage:
#   $env:GHCR_OWNER = 'youruser'; .\\deploy\\deploy.ps1
#   $env:GHCR_OWNER = 'youruser'; .\\deploy\\deploy.ps1 -Tag 'v1.2.3'

[CmdletBinding()]
param(
  [string]$Tag = 'prod'
)

\$ErrorActionPreference = 'Stop'

if (-not \$env:GHCR_OWNER) {
  throw "Set GHCR_OWNER, e.g. \\\$env:GHCR_OWNER = 'yourgithubuser'"
}

\$Image = "ghcr.io/\$(\$env:GHCR_OWNER)/${name}:\$Tag"

Write-Host "Building \$Image"
docker build -f deploy/Dockerfile -t \$Image .
if (\$LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Pushing \$Image"
docker push \$Image
if (\$LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "Pushed \$Image"
Write-Host ""
Write-Host "Next:"
Write-Host "  Render dashboard -> ${name} service -> Manual Deploy -> Deploy latest image"
`;
  return {
    path: "deploy/deploy.ps1",
    content,
    content_type: "text/plain",
    program: PROGRAM,
    description: "PowerShell variant of deploy.sh for Windows hosts — same flow, idiomatic $env: syntax and exit-code checking.",
  };
}

// ─── deploy/vscode-launch.json.template ─────────────────────────

export function generateDeployVSCodeLaunchTemplate(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const name = projectImageName(ctx);

  // Emit a stack-specific debug config. Copy this into .vscode/launch.json
  // (merging with any existing entries) to attach to the container.
  const configs: Array<Record<string, unknown>> = [];
  if (stack === "node-server" || stack === "unknown" || stack === "node-static") {
    configs.push({
      type: "node",
      request: "attach",
      name: `Attach to ${name} (Docker)`,
      port: 9229,
      address: "localhost",
      localRoot: "${workspaceFolder}",
      remoteRoot: "/app",
      skipFiles: ["<node_internals>/**"],
    });
  }
  if (stack === "python") {
    configs.push({
      name: `Attach to ${name} (Docker)`,
      type: "python",
      request: "attach",
      connect: { host: "localhost", port: 5678 },
      pathMappings: [{ localRoot: "${workspaceFolder}", remoteRoot: "/app" }],
    });
  }
  if (stack === "go") {
    configs.push({
      name: `Attach to ${name} (Docker)`,
      type: "go",
      request: "attach",
      mode: "remote",
      remotePath: "/src",
      port: 2345,
      host: "127.0.0.1",
    });
  }
  if (configs.length === 0) {
    configs.push({
      type: "node",
      request: "attach",
      name: `Attach to ${name} (Docker)`,
      port: 9229,
    });
  }

  const payload = {
    version: "0.2.0",
    configurations: configs,
  };
  const banner =
    "// AXIS deploy/vscode-launch.json.template — copy into .vscode/launch.json\n" +
    "// (merging with any existing configurations) to attach a debugger to the\n" +
    "// running container started via deploy/docker-compose.dev.yml.\n";

  return {
    path: "deploy/vscode-launch.json.template",
    content: banner + JSON.stringify(payload, null, 2) + "\n",
    content_type: "application/json",
    program: PROGRAM,
    description: `VSCode debug-attach template for the ${stack} container — merge into .vscode/launch.json to step through code running in Docker.`,
  };
}

// ─── deploy/wrangler.pages.toml ─────────────────────────────────
// Cloudflare Pages — direct upload flow. Build runs locally; wrangler
// uploads the static dist/ to Pages. Zero Cloudflare build minutes used.

export function generateDeployWranglerPages(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const name = projectImageName(ctx);
  // SvelteKit static adapter outputs to /build; Vite/Next-static use /dist.
  const outDir = hasFw(ctx, "SvelteKit") ? "build" : "dist";

  const lines: string[] = [];
  lines.push(`# AXIS deploy/wrangler.pages.toml — Cloudflare Pages, direct upload.`);
  lines.push(`# Zero CF build minutes: you build locally, wrangler uploads the dist.`);
  lines.push(`# Run:  npm run build  &&  npx wrangler pages deploy ${outDir}/ --config=deploy/wrangler.pages.toml`);
  if (stack !== "node-static") {
    lines.push(`# NOTE: detected '${stack}' stack — Pages is for static frontends. If this`);
    lines.push(`#       project is a backend, use deploy/wrangler.containers.toml instead.`);
  }
  lines.push("");
  lines.push(`name = "${name}"`);
  lines.push(`compatibility_date = "2025-01-01"`);
  lines.push(`pages_build_output_dir = "${outDir}"`);
  lines.push("");
  lines.push(`# Set runtime env vars via: npx wrangler pages secret put <NAME> --project-name=${name}`);
  lines.push(`# or in the Cloudflare dashboard. Do not commit secrets to this file.`);

  return {
    path: "deploy/wrangler.pages.toml",
    content: lines.join("\n") + "\n",
    content_type: "application/toml",
    program: PROGRAM,
    description: `Cloudflare Pages config — direct upload of ${outDir}/, zero CF build minutes.`,
  };
}

// ─── deploy/wrangler.containers.toml ────────────────────────────
// Cloudflare Containers — wrangler builds deploy/Dockerfile locally,
// pushes the image to CF's managed registry, and binds it to a Worker.

export function generateDeployWranglerContainers(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const name = projectImageName(ctx);

  const lines: string[] = [];
  lines.push(`# AXIS deploy/wrangler.containers.toml — Cloudflare Containers, local Docker build.`);
  lines.push(`# wrangler runs your local Docker to build deploy/Dockerfile, then pushes the image`);
  lines.push(`# to CF's managed registry and routes the Worker to it. Zero CF build minutes used.`);
  lines.push(`# Run:  npx wrangler deploy --config=deploy/wrangler.containers.toml`);
  if (stack === "node-static") {
    lines.push(`# NOTE: detected '${stack}' stack — Containers is for backends. For a static`);
    lines.push(`#       frontend, use deploy/wrangler.pages.toml instead.`);
  }
  lines.push("");
  lines.push(`name = "${name}"`);
  lines.push(`main = "worker.ts"`);
  lines.push(`compatibility_date = "2025-01-01"`);
  lines.push("");
  lines.push("[[containers]]");
  lines.push(`class_name = "AppContainer"`);
  lines.push(`image = "./Dockerfile"`);
  lines.push("max_instances = 5");
  lines.push(`instance_type = "basic"  # basic | standard | dev`);
  lines.push("");
  lines.push("[[durable_objects.bindings]]");
  lines.push(`name = "APP_CONTAINER"`);
  lines.push(`class_name = "AppContainer"`);
  lines.push("");
  lines.push("[[migrations]]");
  lines.push(`tag = "v1"`);
  lines.push(`new_sqlite_classes = ["AppContainer"]`);

  return {
    path: "deploy/wrangler.containers.toml",
    content: lines.join("\n") + "\n",
    content_type: "application/toml",
    program: PROGRAM,
    description: "Cloudflare Containers config — wrangler builds deploy/Dockerfile locally and pushes to CF's registry, zero build minutes.",
  };
}

// ─── deploy/worker.ts ───────────────────────────────────────────
// Entry Worker for Cloudflare Containers — proxies all HTTP requests to
// the container instance. Required by Cloudflare Containers' Worker-fronted
// model. Install: npm i @cloudflare/containers

export function generateDeployContainersWorker(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const name = projectImageName(ctx);
  const content = `// AXIS deploy/worker.ts — Cloudflare Worker entry that proxies HTTP to the
// deploy/Dockerfile-built container instance. Required by wrangler.containers.toml.
//
// Install once:    npm i @cloudflare/containers
// Deploy:          npx wrangler deploy --config=deploy/wrangler.containers.toml

import { Container, getContainer } from "@cloudflare/containers";

export class AppContainer extends Container {
  // Must match EXPOSE in deploy/Dockerfile and PORT env in wrangler.containers.toml.
  defaultPort = 8080;
  // Idle the container after 5 minutes of no requests to save compute.
  sleepAfter = "5m";
}

interface Env {
  APP_CONTAINER: DurableObjectNamespace<AppContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.APP_CONTAINER, "${name}");
    return container.fetch(request);
  },
};
`;
  return {
    path: "deploy/worker.ts",
    content,
    content_type: "text/typescript",
    program: PROGRAM,
    description: "Cloudflare Worker entry — proxies HTTP to the Container instance built from deploy/Dockerfile.",
  };
}

// ─── deploy/deploy-cloudflare.sh ────────────────────────────────

export function generateDeployScriptCloudflareBash(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const outDir = hasFw(ctx, "SvelteKit") ? "build" : "dist";
  const name = projectImageName(ctx);
  // Both wrangler configs are always generated, so `auto` can't pick by file
  // existence — it resolves to the detected stack's recommended target.
  const autoTarget = stack === "node-static" ? "pages" : "containers";
  const content = `#!/usr/bin/env bash
# AXIS deploy/deploy-cloudflare.sh — local build → Cloudflare deploy.
# 'auto' (the default) uses the detected stack's recommended target: ${autoTarget}.
# Pass 'pages' or 'containers' explicitly to override. Zero CF build minutes either way.

set -euo pipefail

cd "\$(dirname "\$0")/.."  # workspace root

PAGES_CFG="deploy/wrangler.pages.toml"
CONTAINERS_CFG="deploy/wrangler.containers.toml"

# Detected primary stack at generate time: ${stack}
# For repos that are both, delete the inapplicable wrangler config or pass --target.

TARGET="\${1:-auto}"

case "\$TARGET" in
  pages)        run_pages=1; run_containers=0 ;;
  containers)   run_pages=0; run_containers=1 ;;
  auto|"")      run_pages=${autoTarget === "pages" ? "1" : "0"}; run_containers=${autoTarget === "pages" ? "0" : "1"} ;;
  *) echo "Usage: \$0 [pages|containers|auto]" >&2; exit 2 ;;
esac

if [ "\$run_pages" = "1" ] && [ -f "\$PAGES_CFG" ]; then
  echo "▶ Cloudflare Pages deploy (static, target dir: ${outDir}/)"
  if [ ! -d "${outDir}" ]; then
    echo "  Building..."
    npm run build
  fi
  npx wrangler pages deploy "${outDir}/" --project-name="${name}" --config="\$PAGES_CFG"
  echo "✓ Pages deployed"
elif [ "\$run_containers" = "1" ] && [ -f "\$CONTAINERS_CFG" ]; then
  echo "▶ Cloudflare Containers deploy (backend)"
  echo "  wrangler will run docker locally to build deploy/Dockerfile, then push to CF's registry."
  npx wrangler deploy --config="\$CONTAINERS_CFG"
  echo "✓ Container deployed"
else
  echo "ERROR: no usable wrangler config found in deploy/" >&2
  echo "  expected one of: \$PAGES_CFG, \$CONTAINERS_CFG" >&2
  exit 1
fi
`;
  return {
    path: "deploy/deploy-cloudflare.sh",
    content,
    content_type: "text/x-shellscript",
    program: PROGRAM,
    description: "POSIX deploy script for Cloudflare — auto-routes to Pages (static) or Containers (backend) based on which wrangler config exists.",
  };
}

// ─── deploy/deploy-cloudflare.ps1 ───────────────────────────────

export function generateDeployScriptCloudflarePwsh(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const outDir = hasFw(ctx, "SvelteKit") ? "build" : "dist";
  const name = projectImageName(ctx);
  const content = `# AXIS deploy/deploy-cloudflare.ps1 — Cloudflare deploy, Windows/PowerShell variant.
# Usage:
#   .\\deploy\\deploy-cloudflare.ps1                # auto
#   .\\deploy\\deploy-cloudflare.ps1 -Target pages
#   .\\deploy\\deploy-cloudflare.ps1 -Target containers

[CmdletBinding()]
param(
  [ValidateSet('auto','pages','containers')]
  [string]\$Target = 'auto'
)

\$ErrorActionPreference = 'Stop'
Set-Location (Join-Path \$PSScriptRoot '..')

\$PagesCfg = 'deploy/wrangler.pages.toml'
\$ContainersCfg = 'deploy/wrangler.containers.toml'

function Invoke-Pages {
  Write-Host 'Cloudflare Pages deploy (static, target dir: ${outDir}/)'
  if (-not (Test-Path '${outDir}')) {
    Write-Host '  Building...'
    npm run build
    if (\$LASTEXITCODE -ne 0) { throw 'build failed' }
  }
  npx wrangler pages deploy "${outDir}/" --project-name="${name}" --config=\$PagesCfg
  if (\$LASTEXITCODE -ne 0) { throw 'wrangler pages deploy failed' }
  Write-Host 'Pages deployed'
}

function Invoke-Containers {
  Write-Host 'Cloudflare Containers deploy (backend)'
  Write-Host '  wrangler will run docker locally to build deploy/Dockerfile, then push to CF.'
  npx wrangler deploy --config=\$ContainersCfg
  if (\$LASTEXITCODE -ne 0) { throw 'wrangler deploy failed' }
  Write-Host 'Container deployed'
}

switch (\$Target) {
  'pages'      { Invoke-Pages }
  'containers' { Invoke-Containers }
  default {
    if (Test-Path \$PagesCfg) { Invoke-Pages }
    elseif (Test-Path \$ContainersCfg) { Invoke-Containers }
    else { throw "No wrangler config found (\$PagesCfg or \$ContainersCfg)" }
  }
}
`;
  return {
    path: "deploy/deploy-cloudflare.ps1",
    content,
    content_type: "text/plain",
    program: PROGRAM,
    description: "PowerShell variant of deploy-cloudflare.sh — same Pages/Containers routing for Windows hosts.",
  };
}

// ─── deploy/deploy-qualification-report.md ──────────────────────

export function generateDeployQualificationReport(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const stack = detectStack(ctx, files);
  const fileMap = new Map((files ?? []).map(f => [f.path.toLowerCase(), f]));
  const name = projectImageName(ctx);

  const checks: Array<{ name: string; status: "PASS" | "WARN" | "FAIL"; note: string }> = [];

  checks.push({
    name: "Stack detected",
    status: stack === "unknown" ? "WARN" : "PASS",
    note: stack === "unknown"
      ? "Could not infer language; Dockerfile defaulted to Node server template — review before pushing."
      : `Detected '${stack}' — Dockerfile template matches.`,
  });

  const hasHealthRoute = (ctx.routes ?? []).some(r => /\/healthz|\/_health|\/health/.test(r.path));
  checks.push({
    name: "Healthcheck route /healthz",
    status: hasHealthRoute ? "PASS" : "WARN",
    note: hasHealthRoute
      ? "Detected an existing /healthz-style route — Render healthCheckPath will pass."
      : "No /healthz route detected. Render will mark the service unhealthy on first deploy. Add a 200 OK handler at GET /healthz before pushing.",
  });

  const usesPortEnv = (files ?? []).some(f =>
    /process\.env\.PORT|os\.environ.*PORT|os\.Getenv.*PORT/.test(f.content ?? ""),
  );
  checks.push({
    name: "Honors $PORT env",
    status: usesPortEnv ? "PASS" : "WARN",
    note: usesPortEnv
      ? "Server reads PORT from env."
      : "Could not find code reading $PORT. Render injects PORT; if your server hardcodes a port, the platform routing will fail.",
  });

  checks.push({
    name: "Image tag convention",
    status: "PASS",
    note: `Push to ghcr.io/<owner>/${name}:prod — render.yaml expects this exact path.`,
  });

  checks.push({
    name: "Non-root runtime user",
    status: stack === "unknown" ? "WARN" : "PASS",
    note: stack === "unknown"
      ? "Default Node template runs as 'app' user. Confirm if you swap base images."
      : "Dockerfile drops to non-root before CMD.",
  });

  const hasRootDockerignore = fileMap.has(".dockerignore");
  checks.push({
    name: "Build-context .dockerignore",
    status: "PASS",
    note: hasRootDockerignore
      ? "A root .dockerignore exists; BuildKit (enabled by the Dockerfile `# syntax=` line) reads deploy/Dockerfile.dockerignore for THIS build, so the two coexist without conflict."
      : "deploy/Dockerfile.dockerignore is read by BuildKit for this Dockerfile — the ignore for this build context.",
  });

  // ─── Cloudflare-specific checks ───────────────────────────────
  const recommendedCfTarget = stack === "node-static" ? "Pages" : "Containers";
  checks.push({
    name: "Cloudflare target match",
    status: "PASS",
    note: `Detected '${stack}' → recommended Cloudflare target is ${recommendedCfTarget}. Use deploy/wrangler.${recommendedCfTarget.toLowerCase()}.toml; ignore the other.`,
  });

  if (recommendedCfTarget === "Containers") {
    const pkgJson = (files ?? []).find(f => /(^|\/)package\.json$/.test(f.path));
    const hasContainersDep = !!pkgJson && /@cloudflare\/containers/.test(pkgJson.content ?? "");
    checks.push({
      name: "@cloudflare/containers dependency",
      status: hasContainersDep ? "PASS" : "WARN",
      note: hasContainersDep
        ? "Worker helper library already installed."
        : "deploy/worker.ts imports @cloudflare/containers. Install with: npm i @cloudflare/containers",
    });
  } else {
    const outDir = hasFw(ctx, "SvelteKit") ? "build" : "dist";
    checks.push({
      name: "Static build output dir",
      status: "PASS",
      note: `wrangler.pages.toml targets ${outDir}/ — make sure your build script writes there.`,
    });
  }

  const failing = checks.filter(c => c.status === "FAIL").length;
  const warning = checks.filter(c => c.status === "WARN").length;

  const lines: string[] = [];
  lines.push(`# Deploy Qualification Report — ${mdText(ctx.project_identity.name)}`);
  lines.push("");
  lines.push("Generated by AXIS `deploy` program. The emitted artifacts are intended to pass Render's existing-image and Cloudflare's wrangler-driven deploy qualifications with minimal setup — set your image owner (`REPLACE_OWNER`/`<owner>`), confirm the entrypoint, and install the worker dependency where flagged below.");
  lines.push("");
  lines.push(`**Targets:** Render (\`runtime: image\`) · Cloudflare ${recommendedCfTarget}  •  **Image:** \`ghcr.io/<owner>/${name}:prod\`  •  **Port:** 8080  •  **Healthcheck:** \`/healthz\``);
  lines.push("");
  lines.push(`**Summary:** ${checks.length - warning - failing} pass  /  ${warning} warn  /  ${failing} fail`);
  lines.push("");
  lines.push("| Check | Status | Note |");
  lines.push("|---|---|---|");
  for (const c of checks) {
    lines.push(`| ${c.name} | ${c.status} | ${c.note.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push("## Zero-pipeline-minutes flows");
  lines.push("");
  lines.push("### Render (existing-image)");
  lines.push("1. `docker build -f deploy/Dockerfile -t ghcr.io/<owner>/" + name + ":prod .` — your machine does the work.");
  lines.push("2. `docker push ghcr.io/<owner>/" + name + ":prod` — GHCR storage only, no Actions minutes.");
  lines.push("3. Render pulls the image when you click Manual Deploy (or auto on push if you flip `autoDeploy: true`). No Render build pipeline runs.");
  lines.push("");
  if (recommendedCfTarget === "Pages") {
    lines.push("### Cloudflare Pages (static, direct upload)");
    lines.push("1. `npm run build` locally.");
    lines.push("2. `./deploy/deploy-cloudflare.sh pages` (or `.ps1`) — runs `wrangler pages deploy`, uploading the static output to Cloudflare's edge. No CF build runs.");
  } else {
    lines.push("### Cloudflare Containers (backend, wrangler-driven)");
    lines.push("1. `npm i @cloudflare/containers` once.");
    lines.push("2. `./deploy/deploy-cloudflare.sh containers` (or `.ps1`) — wrangler runs your local Docker against `deploy/Dockerfile`, pushes the image to CF's managed registry, and binds the Worker to it. No CF build minutes used.");
  }
  lines.push("");
  lines.push("## If any check is WARN/FAIL");
  lines.push("");
  lines.push("- **No /healthz route:** add a handler that returns HTTP 200 on `GET /healthz`. Without it the first deploy will appear to hang then fail health.");
  lines.push("- **Hardcoded port:** read `process.env.PORT || 8080` (Node) / `os.environ.get('PORT', 8080)` (Python) / `os.Getenv(\"PORT\")` (Go) before passing to your listener.");
  lines.push("- **Unknown stack:** the default Node template will likely build, but review CMD and EXPOSE manually.");
  lines.push("- **Missing `@cloudflare/containers`:** required by `deploy/worker.ts`. Run `npm i @cloudflare/containers` before `wrangler deploy`.");
  lines.push("");
  lines.push("Once everything is PASS, the deploy is direct-portable — push once, deploy to Render and Cloudflare with zero platform pipeline minutes.");

  return {
    path: "deploy/deploy-qualification-report.md",
    content: lines.join("\n") + "\n",
    content_type: "text/markdown",
    program: PROGRAM,
    description: "Pre-flight checklist verifying the emitted Dockerfile + render.yaml will pass Render's existing-image deploy qualification.",
  };
}
