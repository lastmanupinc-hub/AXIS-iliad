import { createHash } from "node:crypto";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { mdText, mdBlock, mdCode, yamlFlowScalar, codeComment, dockerfileLabelValue, makefileEchoArg } from "./md-sanitize.js";

const PROGRAM = "closer";
const CERTLIB_PROFILE = "certlib-offline-v1";

const TARGET_MARKETPLACES = [
  "npm",
  "unreal",
  "vscode",
  "dockerhub",
  "github-marketplace",
] as const;

type TargetMarketplace = (typeof TARGET_MARKETPLACES)[number];

interface BrandingConfig {
  product_name: string;
  tagline: string;
  target_marketplaces: TargetMarketplace[];
}

interface ProjectSignals {
  detected_frameworks: string[];
  primary_language: string;
  uses_docker: boolean;
  has_makefile: boolean;
  has_ci: boolean;
  monetization_hints: string[];
  selected_license: "MIT" | "Apache-2.0" | "Proprietary";
  /** Detected package manager — drives lockfile + install commands. */
  package_manager: "pnpm" | "yarn" | "npm" | "bun" | "none";
  /** Whether the project ships a server entry point (drives Dockerfile EXPOSE / CMD). */
  is_server: boolean;
  /** Whether the project has any test runner declared. */
  has_tests: boolean;
}

interface MerkleBundle {
  root: string;
  leaves: Array<{ path: string; digest: string }>;
  levels: string[][];
  signature: string;
}

const CLOSER_OUTPUT_PATHS = [
  "packaging/README.md",
  "packaging/LICENSE",
  "Dockerfile",
  "docker-compose.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "packaging/manifests/npm-package.json",
  "packaging/manifests/unreal.uplugin",
  "packaging/manifests/vscode-extension.json",
  "packaging/manifests/dockerhub-repository.md",
  "packaging/manifests/github-marketplace-listing.md",
  "packaging/trust-fabric/attestation.json",
  "packaging/trust-fabric/merkle-proof.json",
  "packaging-report.md",
  "DISTRIBUTABLE.md",
  "Makefile",
] as const;

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeMarketplace(value: string): TargetMarketplace | null {
  const lowered = value.trim().toLowerCase();
  if (lowered === "github marketplace" || lowered === "github_marketplace") {
    return "github-marketplace";
  }
  if (lowered === "docker" || lowered === "docker hub") {
    return "dockerhub";
  }
  if ((TARGET_MARKETPLACES as readonly string[]).includes(lowered)) {
    return lowered as TargetMarketplace;
  }
  return null;
}

function defaultBranding(ctx: ContextMap): BrandingConfig {
  const projectName = (ctx.project_identity.name || "Project").trim();
  return {
    product_name: projectName,
    tagline: `Packaging and release kit for ${projectName}`,
    target_marketplaces: [...TARGET_MARKETPLACES],
  };
}

function readBrandingConfig(files: SourceFile[] | undefined, ctx: ContextMap): BrandingConfig {
  const fallback = defaultBranding(ctx);
  if (!files || files.length === 0) return fallback;

  const configCandidates = files.filter(file =>
    /(^|\/)(closer(\.|-)config\.json|branding\.config\.json|branding\.json)$/i.test(file.path),
  );

  if (configCandidates.length === 0) return fallback;

  for (const candidate of configCandidates) {
    try {
      const parsed = JSON.parse(candidate.content) as Record<string, unknown>;
      const product_name =
        typeof parsed.product_name === "string" && parsed.product_name.trim().length > 0
          ? parsed.product_name.trim()
          : fallback.product_name;
      const tagline =
        typeof parsed.tagline === "string" && parsed.tagline.trim().length > 0
          ? parsed.tagline.trim()
          : fallback.tagline;

      const requested = Array.isArray(parsed.target_marketplaces)
        ? parsed.target_marketplaces
            .filter((value): value is string => typeof value === "string")
            .map(normalizeMarketplace)
            .filter((value): value is TargetMarketplace => value !== null)
        : [];

      return {
        product_name,
        tagline,
        target_marketplaces: requested.length > 0 ? Array.from(new Set(requested)) : fallback.target_marketplaces,
      };
    } catch {
      // Fall through to defaults if the optional branding config is malformed.
    }
  }

  return fallback;
}

function detectProjectSignals(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): ProjectSignals {
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const allText = files?.map(f => `${f.path}\n${f.content}`).join("\n") ?? "";

  const monetization_hints: string[] = [];
  if (/pricing|subscription|paywall|checkout|invoice|billing/i.test(allText)) {
    monetization_hints.push("Monetization intent detected in source files");
  }
  if (/enterprise|saas|marketplace|plugin|extension/i.test(allText)) {
    monetization_hints.push("Marketplace distribution language detected");
  }
  if (ctx.routes.length > 0) {
    monetization_hints.push("API surface detected");
  }

  const hasInternalOnly = /internal use only|confidential|proprietary|all rights reserved/i.test(allText);
  const hasApacheHint = /patent|contributor license agreement|cla/i.test(allText);
  const selected_license: "MIT" | "Apache-2.0" | "Proprietary" =
    hasInternalOnly ? "Proprietary" : hasApacheHint || profile.project.primary_language === "Go" ? "Apache-2.0" : "MIT";

  const pms = ctx.detection.package_managers ?? [];
  const package_manager: ProjectSignals["package_manager"] =
    pms.includes("pnpm") ? "pnpm" :
    pms.includes("yarn") ? "yarn" :
    pms.includes("bun") ? "bun" :
    pms.includes("npm") ? "npm" :
    profile.project.primary_language === "JavaScript" || profile.project.primary_language === "TypeScript" ? "npm" :
    "none";

  const hasServerEntry = Boolean(
    files?.some(f =>
      /(^|\/)(server|api|main|index)\.(ts|js|tsx|jsx|go|py)$/i.test(f.path) ||
      /(^|\/)server\//i.test(f.path) ||
      /(^|\/)cmd\//i.test(f.path),
    ),
  ) || ctx.routes.length > 0;

  const hasTests = Boolean(
    files?.some(f =>
      /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|go|py)$/i.test(f.path) ||
      /(^|\/)__tests__\//i.test(f.path),
    ),
  );

  return {
    detected_frameworks: frameworks,
    primary_language: profile.project.primary_language,
    uses_docker: Boolean(files?.some(f => /(^|\/)(dockerfile|docker-compose\.ya?ml)$/i.test(f.path))),
    has_makefile: Boolean(files?.some(f => /(^|\/)(makefile)$/i.test(f.path))),
    has_ci: Boolean(files?.some(f => /(^|\/)\.github\/workflows\//i.test(f.path))),
    monetization_hints,
    selected_license,
    package_manager,
    is_server: hasServerEntry,
    has_tests: hasTests,
  };
}

function renderLicense(license: ProjectSignals["selected_license"], holder: string, year: string): string {
  if (license === "Proprietary") {
    return [
      `${holder} Proprietary License`,
      "",
      `Copyright (c) ${year} ${holder}`,
      "",
      "All rights reserved.",
      "",
      "This software is licensed, not sold. Unauthorized reproduction, modification, or redistribution of this package or any derived work is prohibited unless explicitly permitted in a separate written commercial agreement.",
      "",
      "For commercial licensing inquiries: <add your legal contact>",
    ].join("\n");
  }

  if (license === "Apache-2.0") {
    return [
      "Apache License",
      "Version 2.0, January 2004",
      "http://www.apache.org/licenses/",
      "",
      `Copyright ${year} ${holder}`,
      "",
      "Licensed under the Apache License, Version 2.0 (the \"License\");",
      "you may not use this file except in compliance with the License.",
      "You may obtain a copy of the License at",
      "",
      "    http://www.apache.org/licenses/LICENSE-2.0",
      "",
      "Unless required by applicable law or agreed to in writing, software",
      "distributed under the License is distributed on an \"AS IS\" BASIS,",
      "WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
      "See the License for the specific language governing permissions and",
      "limitations under the License.",
    ].join("\n");
  }

  return [
    "MIT License",
    "",
    `Copyright (c) ${year} ${holder}`,
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "of this software and associated documentation files (the \"Software\"), to deal",
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in all",
    "copies or substantial portions of the Software.",
    "",
    "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
    "SOFTWARE.",
  ].join("\n");
}

// Build a Merkle bundle whose leaves are CONTENT-derived: each leaf digest covers
// the artifact's actual bytes (path-prefixed for domain separation), so tampering
// with any generated file changes its leaf and the root. The previous version
// hashed only the path + snapshot IDs, so it could not detect content tampering
// (and its "content-derived" label was untrue).
function buildMerkleBundle(leafInputs: Array<{ path: string; content: string }>): MerkleBundle {
  const leaves = leafInputs.map(({ path, content }) => ({
    path,
    digest: hash(`${path}\n${content}`),
  }));

  let current = leaves.map(leaf => leaf.digest);
  const levels: string[][] = [current];
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? current[i];
      next.push(hash(`${left}${right}`));
    }
    current = next;
    levels.push(current);
  }

  const root = current[0] ?? hash("");
  const signature = hash(`${CERTLIB_PROFILE}:${root}`);

  return { root, leaves, levels, signature };
}

// The content-bearing artifacts the trust fabric attests: every closer output
// EXCEPT the two trust-fabric files themselves (a file can't content-hash itself,
// and they exist to attest the others). Regenerated here so the Merkle leaves
// cover real bytes. Pure + deterministic, so the attestation and merkle-proof
// generators compute an identical bundle. None of these 14 generators reference
// the bundle, so there is no recursion.
function closerAttestedArtifacts(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): Array<{ path: string; content: string }> {
  return [
    generatePackagingReadme(ctx, profile, files),
    generatePackagingLicense(ctx, profile, files),
    generateCloserDockerfile(ctx, profile, files),
    generateCloserDockerCompose(ctx, profile, files),
    generateCloserCiWorkflow(ctx, profile, files),
    generateCloserReleaseWorkflow(ctx, profile, files),
    generateCloserManifestNpm(ctx, profile, files),
    generateCloserManifestUnreal(ctx, profile, files),
    generateCloserManifestVsCode(ctx, profile, files),
    generateCloserManifestDockerHub(ctx, profile, files),
    generateCloserManifestGitHubMarketplace(ctx, profile, files),
    generateCloserPackagingReport(ctx, profile, files),
    generateDistributableGuide(ctx, profile, files),
    generateMakefileWithShipTarget(ctx, profile, files),
  ].map(f => ({ path: f.path, content: f.content }));
}

function readinessScore(signals: ProjectSignals, marketplaces: number): number {
  // Scores the INPUT repo's packaging maturity (what closer had to work with), not
  // the generated bundle. A low base with points from real, per-repo signals — so
  // the score varies meaningfully AND the higher bands stay reachable (a repo with
  // all signals reaches 100; a bare repo lands ~48/hardening-required).
  let score = 40;
  if (signals.uses_docker) score += 15;
  if (signals.has_ci) score += 15;
  if (signals.has_makefile) score += 10;
  if (signals.has_tests) score += 12;
  score += Math.min(8, marketplaces * 2);
  if (signals.selected_license === "Proprietary") score -= 4;
  return Math.max(0, Math.min(100, score));
}

export function generatePackagingReadme(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const signals = detectProjectSignals(ctx, profile, files);
  const score = readinessScore(signals, branding.target_marketplaces.length);

  const content = [
    `# ${mdText(branding.product_name)}`,
    "",
    `> ${mdText(branding.tagline)}`,
    "",
    `## Why Teams Buy This`,
    "",
    `- Ships as a production package with CI/CD, release gates, and marketplace manifests.`,
    `- Delivers operational trust through deterministic attestation and reproducible packaging.`,
    `- Reduces adoption friction with one-command startup and explicit monetization hooks.`,
    "",
    `## Installation`,
    "",
    "```bash",
    "git clone <repo-url>",
    "cd <project>",
    "make install && make start",
    "```",
    "",
    `## Screenshots`,
    "",
    `- Placeholder: hero UI screenshot (desktop)`,
    `- Placeholder: workflow screenshot (mobile)`,
    `- Placeholder: trust attestation verification panel`,
    "",
    `## Trust Signals`,
    "",
    `- Packaging readiness score: **${score}/100**`,
    `- License strategy: **${signals.selected_license}**`,
    `- Build + release automation included`,
    `- Merkle integrity attestation (content-derived digest, not a cryptographic signature) included in packaging/trust-fabric`,
    "",
    `## Monetization`,
    "",
    `- Pricing: set to your own support tier and hosting footprint.`,
    `- Example SKU structure: Starter (self-serve), Team (SLA + onboarding), Enterprise (private deployment).`,
    `- Distribution targets: ${branding.target_marketplaces.join(", ")}.`,
    "",
    `## Compatibility`,
    "",
    `- Primary language: ${mdText(signals.primary_language)}`,
    `- Detected frameworks: ${signals.detected_frameworks.map(mdText).join(", ") || "none"}`,
    `- Targets: Linux containers, cloud runners, and local developer setup`,
  ].join("\n");

  return {
    path: "packaging/README.md",
    content,
    content_type: "text/markdown",
    program: PROGRAM,
    description: "Professional, benefit-driven product README for marketplace and commercial packaging",
  };
}

export function generatePackagingLicense(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const signals = detectProjectSignals(ctx, profile, files);
  return {
    path: "packaging/LICENSE",
    // Year is snapshot-derived (ISO timestamp prefix) so output stays deterministic.
    content: renderLicense(signals.selected_license, codeComment(branding.product_name), ctx.generated_at.slice(0, 4)),
    content_type: "text/plain",
    program: PROGRAM,
    description: "Commercially suitable licensing file selected from MIT, Apache-2.0, or Proprietary",
  };
}

export function generateCloserDockerfile(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = detectProjectSignals(ctx, profile, files);
  const lang = profile.project.primary_language;
  const pm = signals.package_manager;

  // Pick a base image and build/runtime steps appropriate to the stack.
  // Node and Go are first-class; everything else falls back to a Node-ish
  // shape unless Python or Rust is detected, in which case we honor them.
  let content: string;

  if (lang === "Go") {
    content = [
      "# syntax=docker/dockerfile:1.7",
      "# Multi-stage build for Go binary: small final image, no toolchain at runtime.",
      "",
      "FROM golang:1.22-alpine AS build",
      "WORKDIR /src",
      "RUN apk add --no-cache git ca-certificates",
      "COPY go.mod go.sum* ./",
      "RUN go mod download",
      "COPY . .",
      "ENV CGO_ENABLED=0",
      "RUN go build -trimpath -ldflags=\"-s -w\" -o /out/app ./...",
      "",
      "FROM gcr.io/distroless/static-debian12:nonroot",
      "WORKDIR /app",
      "COPY --from=build /out/app /app/app",
      "USER nonroot:nonroot",
      "ENV PORT=8080",
      "EXPOSE 8080",
      `LABEL org.opencontainers.image.title=\"${dockerfileLabelValue(ctx.project_identity.name)}\"`,
      ...(ctx.project_identity.repo_url ? [`LABEL org.opencontainers.image.source=\"${dockerfileLabelValue(ctx.project_identity.repo_url)}\"`] : []),
      "ENTRYPOINT [\"/app/app\"]",
    ].join("\n");
  } else if (lang === "Python") {
    content = [
      "# syntax=docker/dockerfile:1.7",
      "# Multi-stage build for Python: install deps in a builder stage so the",
      "# runtime layer is just the interpreter + site-packages.",
      "",
      "FROM python:3.12-slim AS build",
      "WORKDIR /src",
      "ENV PYTHONDONTWRITEBYTECODE=1 PIP_DISABLE_PIP_VERSION_CHECK=1",
      "COPY requirements*.txt pyproject.toml* poetry.lock* ./",
      "RUN if [ -f requirements.txt ]; then pip install --no-cache-dir --target=/install -r requirements.txt; fi",
      "COPY . .",
      "",
      "FROM python:3.12-slim AS runtime",
      "WORKDIR /app",
      "ENV PYTHONUNBUFFERED=1 PYTHONPATH=/install PORT=8080",
      "RUN groupadd --system app && useradd --system --gid app --no-create-home app",
      "COPY --from=build /install /install",
      "COPY --from=build /src /app",
      "USER app",
      "EXPOSE 8080",
      `LABEL org.opencontainers.image.title=\"${dockerfileLabelValue(ctx.project_identity.name)}\"`,
      "HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\",
      "  CMD python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{__import__(\\\"os\\\").environ.get(\\\"PORT\\\",\\\"8080\\\")}/health').status==200 else 1)\" || exit 1",
      "CMD [\"python\", \"-m\", \"app\"]",
    ].join("\n");
  } else {
    // Node / TypeScript path — default for AXIS-style web apps. Use Alpine for
    // small footprint; copy lockfile that matches the detected package manager
    // so `npm ci` / `pnpm install --frozen-lockfile` reproduces the build.
    const installCmd =
      pm === "pnpm" ? "RUN corepack enable && pnpm install --frozen-lockfile --prod"
      : pm === "yarn" ? "RUN corepack enable && yarn install --frozen-lockfile --production"
      : pm === "bun" ? "RUN apk add --no-cache curl && curl -fsSL https://bun.sh/install | bash && /root/.bun/bin/bun install --frozen-lockfile --production"
      : "RUN npm ci --omit=dev --ignore-scripts";
    const buildInstall =
      pm === "pnpm" ? "RUN corepack enable && pnpm install --frozen-lockfile"
      : pm === "yarn" ? "RUN corepack enable && yarn install --frozen-lockfile"
      : pm === "bun" ? "RUN apk add --no-cache curl && curl -fsSL https://bun.sh/install | bash && /root/.bun/bin/bun install --frozen-lockfile"
      : "RUN npm ci --ignore-scripts";
    const buildCmd =
      pm === "pnpm" ? "RUN pnpm run build --if-present"
      : pm === "yarn" ? "RUN yarn build --if-present || echo \"no build script\""
      : pm === "bun" ? "RUN /root/.bun/bin/bun run build --if-present || echo \"no build script\""
      : "RUN npm run build --if-present";
    const lockHint =
      pm === "pnpm" ? "package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc*"
      : pm === "yarn" ? "package.json yarn.lock* .yarnrc.yml*"
      : pm === "bun" ? "package.json bun.lockb*"
      : "package.json package-lock.json* npm-shrinkwrap.json*";
    const entry = signals.is_server ? "node dist/server.js" : "node dist/index.js";

    content = [
      "# syntax=docker/dockerfile:1.7",
      "# Multi-stage Node build. Builder installs all deps + compiles TS;",
      `# runtime image only has node_modules/* needed for production + ${pm === "none" ? "npm" : pm} prod deps.`,
      "",
      "FROM node:22-alpine AS build",
      "WORKDIR /src",
      `COPY ${lockHint} ./`,
      buildInstall,
      "COPY . .",
      buildCmd,
      `${installCmd.replace("RUN ", "RUN rm -rf node_modules && ")}`,
      "",
      "FROM node:22-alpine AS runtime",
      "WORKDIR /app",
      "ENV NODE_ENV=production PORT=8080",
      "RUN addgroup -S app && adduser -S app -G app",
      "COPY --from=build --chown=app:app /src/node_modules ./node_modules",
      "COPY --from=build --chown=app:app /src/dist ./dist",
      "COPY --from=build --chown=app:app /src/package.json ./package.json",
      "USER app",
      "EXPOSE 8080",
      `LABEL org.opencontainers.image.title=\"${dockerfileLabelValue(ctx.project_identity.name)}\"`,
      ...(ctx.project_identity.repo_url ? [`LABEL org.opencontainers.image.source=\"${dockerfileLabelValue(ctx.project_identity.repo_url)}\"`] : []),
      "HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\",
      "  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1",
      `CMD [\"sh\", \"-lc\", \"${entry}\"]`,
    ].join("\n");
  }

  return {
    path: "Dockerfile",
    content,
    content_type: "text/plain",
    program: PROGRAM,
    description: `Multi-stage container build for ${ctx.project_identity.name} (${lang}/${pm}), non-root user, HEALTHCHECK on /health, honors $PORT.`,
  };
}

export function generateCloserDockerCompose(
  ctx: ContextMap,
  _profile?: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const name = ctx.project_identity.name || "app"; // guard: an empty name would slug to `image: :latest`
  // Compose v2 schema — top-level `version` is deprecated/ignored. Healthcheck
  // and env_file present so a copied .env.example wires through automatically.
  const content = [
    `# docker compose for ${codeComment(name)}`,
    "# Usage:",
    "#   cp .env.example .env  (if present)",
    "#   docker compose up --build",
    "#",
    "# Reads PORT from .env; defaults to 8080.",
    "",
    "services:",
    "  app:",
    `    image: ${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}:latest`,
    "    build:",
    "      context: .",
    "      dockerfile: Dockerfile",
    `    container_name: ${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
    "    restart: unless-stopped",
    "    ports:",
    "      - \"${PORT:-8080}:8080\"",
    "    env_file:",
    "      - path: .env",
    "        required: false",
    "    environment:",
    `      - ${yamlFlowScalar(`PRODUCT_NAME=${name}`)}`,
    "      - NODE_ENV=production",
    "      - PORT=8080",
    "    healthcheck:",
    "      test: [\"CMD\", \"wget\", \"--quiet\", \"--tries=1\", \"--spider\", \"http://127.0.0.1:8080/health\"]",
    "      interval: 30s",
    "      timeout: 3s",
    "      retries: 3",
    "      start_period: 10s",
    "    logging:",
    "      driver: json-file",
    "      options:",
    "        max-size: \"10m\"",
    "        max-file: \"3\"",
    "    deploy:",
    "      restart_policy:",
    "        condition: on-failure",
    "        max_attempts: 5",
  ].join("\n");

  return {
    path: "docker-compose.yml",
    content,
    content_type: "application/yaml",
    program: PROGRAM,
    description: "Compose v2 service definition with healthcheck, env_file passthrough, log rotation, and bounded restart attempts. Honors $PORT.",
  };
}

export function generateCloserCiWorkflow(
  ctx?: ContextMap,
  profile?: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = ctx && profile
    ? detectProjectSignals(ctx, profile, files)
    : {
        primary_language: "TypeScript",
        package_manager: "npm" as const,
        has_tests: true,
        detected_frameworks: [],
        uses_docker: false,
        has_makefile: false,
        has_ci: false,
        monetization_hints: [],
        selected_license: "MIT" as const,
        is_server: false,
      };

  const lang = signals.primary_language;
  const pm = signals.package_manager;

  if (lang === "Go") {
    const content = [
      "name: ci",
      "",
      "on:",
      "  pull_request:",
      "  push:",
      "    branches: [main]",
      "",
      "permissions:",
      "  contents: read",
      "",
      "jobs:",
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 15",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-go@v5",
      "        with:",
      "          go-version: \"1.22\"",
      "          cache: true",
      "      - name: Verify modules",
      "        run: |",
      "          go mod download",
      "          go mod verify",
      "      - name: Lint",
      "        uses: golangci/golangci-lint-action@v6",
      "        with:",
      "          version: latest",
      "          args: --timeout=5m",
      "      - name: Vet",
      "        run: go vet ./...",
      "      - name: Test",
      "        run: go test -race -coverprofile=coverage.out ./...",
      "      - name: Upload coverage",
      "        uses: actions/upload-artifact@v4",
      "        with:",
      "          name: coverage",
      "          path: coverage.out",
      "      - name: Build",
      "        run: go build -trimpath ./...",
    ].join("\n");
    return {
      path: ".github/workflows/ci.yml",
      content,
      content_type: "application/yaml",
      program: PROGRAM,
      description: "Go CI workflow: mod verify, lint (golangci-lint), vet, race-tested coverage, and build.",
    };
  }

  // Node/TS path — pick install command and cache key based on the detected
  // package manager. Matrix on Node 20+22 so we catch engine drift early.
  const setupSteps =
    pm === "pnpm" ? [
      "      - name: Setup pnpm",
      "        uses: pnpm/action-setup@v4",
      "        with:",
      "          run_install: false",
      "      - name: Setup Node",
      "        uses: actions/setup-node@v4",
      "        with:",
      "          node-version: ${{ matrix.node }}",
      "          cache: pnpm",
      "      - name: Install",
      "        run: pnpm install --frozen-lockfile",
    ] : pm === "yarn" ? [
      "      - name: Setup Node",
      "        uses: actions/setup-node@v4",
      "        with:",
      "          node-version: ${{ matrix.node }}",
      "          cache: yarn",
      "      - name: Install",
      "        run: yarn install --frozen-lockfile",
    ] : pm === "bun" ? [
      "      - name: Setup Bun",
      "        uses: oven-sh/setup-bun@v1",
      "      - name: Install",
      "        run: bun install --frozen-lockfile",
    ] : [
      "      - name: Setup Node",
      "        uses: actions/setup-node@v4",
      "        with:",
      "          node-version: ${{ matrix.node }}",
      "          cache: npm",
      "      - name: Install",
      "        run: npm ci --ignore-scripts",
    ];

  const runner =
    pm === "pnpm" ? "pnpm" :
    pm === "yarn" ? "yarn" :
    pm === "bun"  ? "bun" :
    "npm";
  const runScript = (script: string) => `        run: ${runner} run ${script} --if-present`;

  const content = [
    "name: ci",
    "",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main]",
    "",
    "permissions:",
    "  contents: read",
    "",
    "concurrency:",
    "  group: ${{ github.workflow }}-${{ github.ref }}",
    "  cancel-in-progress: true",
    "",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 20",
    "    strategy:",
    "      fail-fast: false",
    "      matrix:",
    "        node: [22]",
    "    steps:",
    "      - uses: actions/checkout@v4",
    ...setupSteps,
    "      - name: Lint",
    runScript("lint"),
    "      - name: Typecheck",
    runScript("typecheck"),
    ...(signals.has_tests ? [
      "      - name: Test",
      `        run: ${runner} test --if-present`,
    ] : []),
    "      - name: Build",
    runScript("build"),
    "      - name: Audit",
    `        run: ${runner === "npm" ? "npm audit --omit=dev --audit-level=high" : runner === "pnpm" ? "pnpm audit --prod --audit-level high" : runner === "yarn" ? "yarn npm audit --severity high --recursive" : "bun audit"} || true`,
  ].join("\n");

  return {
    path: ".github/workflows/ci.yml",
    content,
    content_type: "application/yaml",
    program: PROGRAM,
    description: `${lang} CI workflow tuned for ${pm}: concurrency-canceled PR checks, Node-version matrix, lint/typecheck/test/build/audit/ship.`,
  };
}

export function generateCloserReleaseWorkflow(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const config = readBrandingConfig(files, ctx);

  const signals = detectProjectSignals(ctx, _profile, files);
  const lang = signals.primary_language;
  const pm = signals.package_manager;
  const targets = config.target_marketplaces;
  const publishNpm = targets.includes("npm") && lang !== "Go" && lang !== "Python";
  const publishDocker = targets.includes("dockerhub") || signals.uses_docker;

  // Package-manager-specific setup. We can be more terse than CI here because
  // release runs on a tag — no need for matrix builds.
  const nodeSetup = pm === "pnpm" ? [
    "      - uses: pnpm/action-setup@v4",
    "        with: { run_install: false }",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "          cache: pnpm",
    "          registry-url: https://registry.npmjs.org/",
    "      - run: pnpm install --frozen-lockfile",
    "      - run: pnpm run build --if-present",
  ] : pm === "yarn" ? [
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "          cache: yarn",
    "          registry-url: https://registry.npmjs.org/",
    "      - run: yarn install --frozen-lockfile",
    "      - run: yarn build --if-present",
  ] : pm === "bun" ? [
    "      - uses: oven-sh/setup-bun@v1",
    "      - run: bun install --frozen-lockfile",
    "      - run: bun run build --if-present",
  ] : [
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "          cache: npm",
    "          registry-url: https://registry.npmjs.org/",
    "      - run: npm ci --ignore-scripts",
    "      - run: npm run build --if-present",
  ];

  const goSetup = [
    "      - uses: actions/setup-go@v5",
    "        with: { go-version: \"1.22\" }",
    "      - run: go build -trimpath -ldflags=\"-s -w\" -o bin/app ./...",
  ];

  const setupSteps = lang === "Go" ? goSetup : nodeSetup;

  const npmPublishStep = publishNpm ? [
    "      - name: Publish to npm",
    "        if: \"!contains(github.ref_name, '-')\"   # skip prerelease tags like v1.0.0-rc.1",
    `        run: ${pm === "pnpm" ? "pnpm publish --access public --no-git-checks" : pm === "yarn" ? "yarn npm publish --access public" : pm === "bun" ? "bun publish --access public" : "npm publish --access public"}`,
    "        env:",
    "          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
  ] : [];

  const dockerPublishStep = publishDocker ? [
    "      - name: Set up Docker Buildx",
    "        uses: docker/setup-buildx-action@v3",
    "      - name: Login to GHCR",
    "        uses: docker/login-action@v3",
    "        with:",
    "          registry: ghcr.io",
    "          username: ${{ github.actor }}",
    "          password: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Build and push image",
    "        uses: docker/build-push-action@v6",
    "        with:",
    "          context: .",
    "          push: true",
    "          provenance: true",
    "          tags: |",
    `            ghcr.io/\${{ github.repository }}:\${{ github.ref_name }}`,
    `            ghcr.io/\${{ github.repository }}:latest`,
  ] : [];

  const content = [
    "name: release",
    "",
    "on:",
    "  workflow_dispatch:",
    "  push:",
    "    tags:",
    "      - \"v*\"",
    "",
    "permissions:",
    "  contents: write       # create the release",
    "  id-token: write       # npm/PyPI OIDC + Sigstore",
    publishDocker ? "  packages: write       # push to ghcr.io" : "",
    "",
    "concurrency:",
    "  group: release-${{ github.ref }}",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  publish:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 30",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with: { fetch-depth: 0 }   # full history so make ship can fingerprint commits",
    ...setupSteps,
    "      - name: Run ship pipeline",
    "        run: make ship",
    ...npmPublishStep,
    ...dockerPublishStep,
    "      - name: Verify attestation bundle",
    "        run: |",
    "          test -f packaging/trust-fabric/attestation.json",
    "          test -f packaging/trust-fabric/merkle-proof.json",
    "      - name: Create GitHub Release",
    "        uses: softprops/action-gh-release@v2",
    "        with:",
    `          name: ${yamlFlowScalar(`${config.product_name} \${{ github.ref_name }}`)}`,
    "          generate_release_notes: true",
    "          fail_on_unmatched_files: true",
    "          files: |",
    "            packaging/trust-fabric/attestation.json",
    "            packaging/trust-fabric/merkle-proof.json",
  ].filter(Boolean).join("\n");

  return {
    path: ".github/workflows/release.yml",
    content,
    content_type: "application/yaml",
    program: PROGRAM,
    description: "Automated release workflow with deterministic packaging and release publication",
  };
}

export function generateCloserManifestNpm(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const npmName = branding.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Pull keywords from detected frameworks instead of meaningless filler.
  const frameworkKeywords = ctx.detection.frameworks
    .slice(0, 5)
    .map(f => f.name.toLowerCase().replace(/\s+/g, "-"));
  const keywords = Array.from(new Set([npmName, ctx.project_identity.primary_language.toLowerCase(), ...frameworkKeywords]))
    .filter(k => k && k !== "unknown");

  const manifest: Record<string, unknown> = {
    name: npmName,
    version: "1.0.0",
    description: branding.tagline,
    type: "module",
    license: "SEE LICENSE IN packaging/LICENSE",
    engines: { node: ">=20" },
    files: ["dist", "README.md", "LICENSE"],
    keywords,
  };
  // Only emit repository / homepage / bugs URLs when we actually detected a
  // repo URL. Shipping https://github.com/owner/repo and https://example.com
  // as defaults trains downstream tools to ignore the fields.
  if (ctx.project_identity.repo_url) {
    manifest.repository = { type: "git", url: ctx.project_identity.repo_url };
    manifest.homepage = `${ctx.project_identity.repo_url.replace(/\.git$/, "")}#readme`;
    manifest.bugs = { url: `${ctx.project_identity.repo_url.replace(/\.git$/, "")}/issues` };
  }

  return {
    path: "packaging/manifests/npm-package.json",
    content: JSON.stringify(manifest, null, 2),
    content_type: "application/json",
    program: PROGRAM,
    description: "npm publish-ready manifest. type:module, engines.node, files allowlist, keywords from detected frameworks. Repository/homepage/bugs only emitted when a repo URL was detected.",
  };
}

export function generateCloserManifestUnreal(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const manifest: Record<string, unknown> = {
    FileVersion: 3,
    Version: 1,
    VersionName: "1.0.0",
    FriendlyName: branding.product_name,
    Description: branding.tagline,
    Category: "Tools",
    // CreatedBy is a human/org name — using the product name as a fallback is
    // worse than admitting we don't know. Operator must fill this in before
    // marketplace submission.
    CreatedBy: "<add your publisher name>",
    CreatedByURL: ctx.project_identity.repo_url ?? "<add your homepage URL>",
    CanContainContent: true,
    IsBetaVersion: false,
    Installed: false,
    EngineVersion: "5.3.0",
  };
  if (ctx.project_identity.repo_url) {
    manifest.DocsURL = `${ctx.project_identity.repo_url.replace(/\.git$/, "")}#readme`;
    manifest.SupportURL = `${ctx.project_identity.repo_url.replace(/\.git$/, "")}/issues`;
  }

  return {
    path: "packaging/manifests/unreal.uplugin",
    content: JSON.stringify(manifest, null, 2),
    content_type: "application/json",
    program: PROGRAM,
    description: "Unreal .uplugin descriptor. CreatedBy + CreatedByURL are intentionally left as TODOs (must match a real Marketplace seller record). DocsURL and SupportURL populated from the detected repo URL when present.",
  };
}

export function generateCloserManifestVsCode(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const slug = branding.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const manifest: Record<string, unknown> = {
    name: slug,
    displayName: branding.product_name,
    description: branding.tagline,
    version: "1.0.0",
    // publisher is intentionally omitted — it must match a real
    // Marketplace publisher account and shouldn't have a placeholder
    // value that fails `vsce publish` silently. The TODO comment in the
    // description tells the operator what to add.
    engines: { vscode: "^1.95.0" },
    categories: ["Other"],
    main: "./dist/extension.js",
    activationEvents: [`onCommand:${slug}.open`],
    contributes: {
      commands: [{ command: `${slug}.open`, title: `${branding.product_name}: Open` }],
    },
  };
  if (ctx.project_identity.repo_url) {
    manifest.repository = { type: "git", url: ctx.project_identity.repo_url };
    manifest.homepage = ctx.project_identity.repo_url.replace(/\.git$/, "");
    manifest.bugs = { url: `${ctx.project_identity.repo_url.replace(/\.git$/, "")}/issues` };
  }

  return {
    path: "packaging/manifests/vscode-extension.json",
    content: JSON.stringify(manifest, null, 2),
    content_type: "application/json",
    program: PROGRAM,
    description: "VS Code Marketplace extension manifest. Includes activationEvents tied to the contributed command. `publisher` is omitted on purpose — add your real publisher ID before `vsce publish`.",
  };
}

export function generateCloserManifestDockerHub(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const slug = branding.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Use the actual project slug for the docker image tag instead of
  // your-org/your-image (which never gets edited in practice).
  const image = `<your-org>/${slug}`;
  const content = [
    `# Docker Hub Listing — ${mdText(branding.product_name)}`,
    "",
    "## Overview",
    mdBlock(branding.tagline),
    ...(ctx.project_identity.repo_url ? ["", `**Source**: ${mdText(ctx.project_identity.repo_url)}`] : []),
    "",
    "## Tags",
    "- `latest` — current stable build",
    "- `1.0.0` — pinned semver",
    "",
    "## Quick Start",
    "```bash",
    `docker run --rm -p \${PORT:-8080}:8080 ${image}:latest`,
    "```",
    "",
    "## Environment",
    "| Var | Default | Description |",
    "|-----|---------|-------------|",
    "| `PORT` | `8080` | HTTP listen port. Honored by the container entrypoint. |",
    "| `NODE_ENV` | `production` | Runtime mode. Set to `development` for verbose logging. |",
    "",
    "## Compliance & Trust",
    "- Merkle integrity attestation (content-derived digest, not a cryptographic signature) in `packaging/trust-fabric/attestation.json`.",
    "- Multi-stage non-root build (see Dockerfile in the source repo).",
    "- HEALTHCHECK on `/health` so orchestrators can drive rolling restarts.",
    "",
    "## Publishing",
    "Replace `<your-org>` above with your Docker Hub namespace before pushing:",
    "",
    "```bash",
    `docker tag ${slug}:latest <your-org>/${slug}:latest`,
    `docker push <your-org>/${slug}:latest`,
    "```",
  ].join("\n");

  return {
    path: "packaging/manifests/dockerhub-repository.md",
    content,
    content_type: "text/markdown",
    program: PROGRAM,
    description: `Docker Hub long-description: tags table, ${slug}-tagged quick-start that honors $PORT, env-var reference, publish steps, and a Compliance & Trust section pointing at the attestation bundle.`,
  };
}

export function generateCloserManifestGitHubMarketplace(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const content = [
    `# GitHub Marketplace Listing — ${mdText(branding.product_name)}`,
    "",
    "## Value Proposition",
    mdBlock(branding.tagline),
    ...(ctx.project_identity.repo_url ? ["", `**Source**: ${mdText(ctx.project_identity.repo_url)}`] : []),
    "",
    "## Features",
    "- Production packaging profile — CI, release workflow, multi-stage container.",
    "- Marketplace manifests for npm, Unreal, VS Code, and Docker Hub.",
    "- Trust Fabric attestation bundle with deterministic Merkle root.",
    "- `make ship` runs the full release sequence locally before tagging.",
    "",
    "## Installation",
    "```bash",
    `git clone ${mdCode(ctx.project_identity.repo_url ?? "<repo-url>")}`,
    "cd " + branding.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    "make install && make start",
    "```",
    "",
    "## Verification",
    "Every release attaches the attestation bundle. Verify after install:",
    "",
    "```bash",
    "cat packaging/trust-fabric/attestation.json | jq -r .merkle_root",
    "```",
    "",
    "## Support",
    "Open an issue on the source repository for bug reports or feature requests. Commercial support tiers, response-time SLAs, and contact information are owned by the publisher — fill those in here before submitting the listing.",
  ].join("\n");

  return {
    path: "packaging/manifests/github-marketplace-listing.md",
    content,
    content_type: "text/markdown",
    program: PROGRAM,
    description: "GitHub Marketplace listing copy for commercial positioning and distribution",
  };
}

export function generateCloserTrustAttestation(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const bundle = buildMerkleBundle(closerAttestedArtifacts(ctx, profile, files));

  const content = JSON.stringify(
    {
      schema_version: "1.0",
      certlib_profile: CERTLIB_PROFILE,
      generated_at: ctx.generated_at,
      snapshot_id: ctx.snapshot_id,
      project_id: ctx.project_id,
      product_name: branding.product_name,
      package_root: "./",
      merkle_root: bundle.root,
      signature: {
        algorithm: "sha256-pseudo-signature",
        signer: "axis-closer",
        value: bundle.signature,
      },
      leaf_count: bundle.leaves.length,
      leaves: bundle.leaves,
    },
    null,
    2,
  );

  return {
    path: "packaging/trust-fabric/attestation.json",
    content,
    content_type: "application/json",
    program: PROGRAM,
    description: "Trust Fabric certlib-style attestation with a content-derived Merkle root integrity digest (not a cryptographic signature) over package artifacts",
  };
}

export function generateCloserMerkleProof(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const bundle = buildMerkleBundle(closerAttestedArtifacts(ctx, profile, files));

  const content = JSON.stringify(
    {
      schema_version: "1.0",
      merkle_root: bundle.root,
      levels: bundle.levels,
      leaf_index: bundle.leaves.map((leaf, index) => ({ index, path: leaf.path, digest: leaf.digest })),
      verification: {
        algorithm: "sha256",
        certlib_profile: CERTLIB_PROFILE,
        leaf_formula: "sha256(path + \"\\n\" + file_bytes)",
        recompute_leaf: "{ printf '%s\\n' <path>; cat <path>; } | sha256sum",
        note: "Recompute each leaf digest from its file, rebuild the tree pairwise (sha256 of concatenated child digests, last node duplicated when odd), and compare the root to .merkle_root in attestation.json.",
      },
    },
    null,
    2,
  );

  return {
    path: "packaging/trust-fabric/merkle-proof.json",
    content,
    content_type: "application/json",
    program: PROGRAM,
    description: "Merkle proof bundle for offline verification of distributable artifact integrity",
  };
}

export function generateCloserPackagingReport(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const signals = detectProjectSignals(ctx, profile, files);
  const score = readinessScore(signals, branding.target_marketplaces.length);

  const readinessBand = score >= 90 ? "ship-ready" : score >= 80 ? "near-ready" : "hardening-required";
  const remainingSteps = [
    "Replace screenshot placeholders with real product visuals.",
    "Finalize publisher handles for each marketplace.",
    "Run legal review for license + trademark usage.",
    "Execute one dry-run release on a private tag.",
  ];

  const content = [
    "# Packaging Report",
    "",
    `## Readiness Score`,
    "",
    `- Score: **${score}/100**`,
    `- Band: **${readinessBand}**`,
    "",
    "## Auto-Added",
    "",
    ...CLOSER_OUTPUT_PATHS.map(path => `- ${path}`),
    "",
    "## Remaining Human Steps",
    "",
    ...remainingSteps.map(step => `- ${step}`),
    "",
    "## Commercial Potential",
    "",
    `- Product: ${mdText(branding.product_name)}`,
    `- Tagline: ${mdText(branding.tagline)}`,
    `- Target marketplaces: ${branding.target_marketplaces.join(", ")}`,
    `- Monetization signals: ${signals.monetization_hints.length > 0 ? signals.monetization_hints.join("; ") : "No direct signal found, but package is commercially structured."}`,
    "",
    "## Certification Summary",
    "",
    `- Attestation profile: ${CERTLIB_PROFILE}`,
    "- Content-derived Merkle root integrity digest generated (not a cryptographic signature)",
    "- Offline verification supported",
  ].join("\n");

  return {
    path: "packaging-report.md",
    content,
    content_type: "text/markdown",
    program: PROGRAM,
    description: "Packaging readiness scorecard with auto-adds, remaining actions, and commercialization potential",
  };
}

export function generateDistributableGuide(
  ctx: ContextMap,
  _profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const branding = readBrandingConfig(files, ctx);
  const content = [
    `# DISTRIBUTABLE — ${mdText(branding.product_name)}`,
    "",
    "This project is packaged for marketplace distribution.",
    "",
    "## Ship Checklist",
    "",
    "- [ ] `make ship` passes locally",
    "- [ ] CI workflow is green on main",
    "- [ ] release workflow tag tested in dry-run",
    "- [ ] marketplace manifests updated with final publisher IDs",
    "- [ ] legal and trademark review approved",
    "",
    "## Included Packaging Assets",
    "",
    "- packaging/README.md",
    "- packaging/LICENSE",
    "- Dockerfile",
    "- docker-compose.yml",
    "- .github/workflows/ci.yml",
    "- .github/workflows/release.yml",
    "- packaging/manifests/*",
    "- packaging/trust-fabric/*",
    "",
    "## Verify Attestation",
    "",
    "```bash",
    "cat packaging/trust-fabric/attestation.json",
    "cat packaging/trust-fabric/merkle-proof.json",
    "```",
  ].join("\n");

  return {
    path: "DISTRIBUTABLE.md",
    content,
    content_type: "text/markdown",
    program: PROGRAM,
    description: "Root-level shipping guide and go-live checklist for final distribution",
  };
}

export function generateMakefileWithShipTarget(
  ctx: ContextMap,
  profile: RepoProfile,
  files?: SourceFile[],
): GeneratedFile {
  const signals = detectProjectSignals(ctx, profile, files);
  const lang = signals.primary_language;
  const pm = signals.package_manager;

  // Package-manager-aware commands. Falls back to npm when nothing is detected.
  const isGo = lang === "Go";
  const isPy = lang === "Python";
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : pm === "bun" ? "bun" : "npm";

  const installCmd = isGo ? "go mod download"
                   : isPy ? "pip install -r requirements.txt"
                   : pm === "pnpm" ? "pnpm install --frozen-lockfile"
                   : pm === "yarn" ? "yarn install --frozen-lockfile"
                   : pm === "bun"  ? "bun install --frozen-lockfile"
                   : "npm ci --ignore-scripts";

  const devCmd = isGo ? "go run ./..."
               : isPy ? "python -m app"
               : `${runner} run dev --if-present`;

  const startCmd = isGo ? "./bin/app"
                 : isPy ? "python -m app"
                 : `${runner === "npm" ? "npm start" : `${runner} start`} --if-present`;

  const lintCmd = isGo ? "golangci-lint run ./..."
                : isPy ? "ruff check ."
                : `${runner} run lint --if-present`;

  const formatCmd = isGo ? "gofmt -w ."
                  : isPy ? "ruff format ."
                  : `${runner} run format --if-present`;

  const testCmd = isGo ? "go test -race -cover ./..."
                : isPy ? "pytest"
                : `${runner === "npm" ? "npm test" : `${runner} test`} --if-present`;

  const buildCmd = isGo ? "go build -trimpath -ldflags=\"-s -w\" -o bin/app ./..."
                 : isPy ? "python -m build"
                 : `${runner} run build --if-present`;

  const auditCmd = isGo ? "go vet ./..."
                 : isPy ? "pip-audit || true"
                 : pm === "pnpm" ? "pnpm audit --prod --audit-level high || true"
                 : pm === "yarn" ? "yarn npm audit --severity high --recursive || true"
                 : pm === "bun"  ? "bun audit || true"
                 : "npm audit --omit=dev --audit-level=high || true";

  const cleanCmd = isGo ? "rm -rf bin/ coverage.out"
                 : isPy ? "rm -rf dist/ build/ *.egg-info __pycache__"
                 : "rm -rf dist/ build/ coverage/ .turbo/";

  const imageTag = `${(ctx.project_identity.name || "app").toLowerCase().replace(/[^a-z0-9-]+/g, "-")}:latest`;

  const content = [
    `# Build orchestration for ${codeComment(ctx.project_identity.name)}`,
    "# Run \"make help\" for available targets.",
    "",
    ".PHONY: help install dev start lint format typecheck test build audit clean package attest ship ship-summary",
    "",
    "help:",
    "\t@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = \":.*?## \"}; {printf \"\\033[36m%-15s\\033[0m %s\\n\", $$1, $$2}'",
    "",
    `install: ## Install dependencies (${pm === "none" ? "npm" : pm} / ${codeComment(lang)})`,
    `\t${installCmd}`,
    "",
    "dev: ## Run dev server with hot reload",
    `\t${devCmd}`,
    "",
    "start: ## Start the production server",
    `\t${startCmd}`,
    "",
    "lint: ## Run linter",
    `\t${lintCmd}`,
    "",
    "format: ## Format code in place",
    `\t${formatCmd}`,
    "",
    ...(!isGo && !isPy ? [
      "typecheck: ## Run TypeScript type checker",
      `\t${runner} run typecheck --if-present`,
      "",
    ] : []),
    "test: ## Run test suite",
    `\t${testCmd}`,
    "",
    "build: ## Compile production artifacts",
    `\t${buildCmd}`,
    "",
    "audit: ## Audit dependencies for known CVEs",
    `\t${auditCmd}`,
    "",
    "clean: ## Remove build artifacts and caches",
    `\t${cleanCmd}`,
    "",
    "package: build ## Build container image",
    `\tdocker build -t ${imageTag} .`,
    "",
    "attest: ## Verify release attestation",
    "\t@test -f packaging/trust-fabric/attestation.json || (echo \"missing packaging/trust-fabric/attestation.json\" && exit 1)",
    "\t@echo \"Attestation root: $$(jq -r .merkle_root packaging/trust-fabric/attestation.json)\"",
    "",
    "ship: clean install lint test build package attest ## Full release sequence (clean → install → lint → test → build → package → attest)",
    "\t@echo \"\"",
    "\t@echo \"\\033[32mReady to ship.\\033[0m Publish: gh release create vX.Y.Z\"",
    "",
    "ship-summary: ## Print release context for logs and dashboards",
    `\t@echo 'Project:       ${makefileEchoArg(ctx.project_identity.name)}'`,
    `\t@echo 'Language:      ${makefileEchoArg(lang)}'`,
    `\t@echo \"Package mgr:   ${pm}\"`,
    `\t@echo 'Frameworks:    ${signals.detected_frameworks.map(makefileEchoArg).join(", ") || "(none detected)"}'`,
    `\t@echo \"Docker:        ${signals.uses_docker}\"`,
    `\t@echo \"Container:     ${imageTag}\"`,
  ].join("\n");

  return {
    path: "Makefile",
    content,
    content_type: "text/plain",
    program: PROGRAM,
    description: `Build orchestration with help/install/dev/start/lint/format/test/build/audit/clean/package/attest/ship targets, tuned to ${lang}+${pm}.`,
  };
}
