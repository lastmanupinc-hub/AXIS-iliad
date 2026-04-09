import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ─── Helpers ────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, "../../..");

function readRoot(file: string): string {
  return readFileSync(join(ROOT, file), "utf-8");
}

// ─── render.yaml ────────────────────────────────────────────────

describe("render.yaml", () => {
  const content = readRoot("render.yaml");

  it("exists at workspace root", () => {
    expect(existsSync(join(ROOT, "render.yaml"))).toBe(true);
  });

  it("declares a web service named axis-api", () => {
    expect(content).toContain("type: web");
    expect(content).toContain("name: axis-api");
  });

  it("uses Docker runtime", () => {
    expect(content).toContain("runtime: docker");
    expect(content).toContain("dockerfilePath: ./Dockerfile");
  });

  it("configures health check at /v1/health", () => {
    expect(content).toContain("healthCheckPath: /v1/health");
  });

  it("mounts persistent disk at /data", () => {
    expect(content).toContain("mountPath: /data");
    expect(content).toContain("sizeGB:");
  });

  it("sets DATABASE_PATH to /data/axis.db", () => {
    expect(content).toContain("DATABASE_PATH");
    expect(content).toContain("/data/axis.db");
  });

  it("configures production NODE_ENV", () => {
    expect(content).toMatch(/NODE_ENV[\s\S]*?production/);
  });

  it("includes CORS_ORIGIN env var", () => {
    expect(content).toContain("CORS_ORIGIN");
  });

  it("includes GitHub OAuth env vars", () => {
    expect(content).toContain("GITHUB_CLIENT_ID");
    expect(content).toContain("GITHUB_CLIENT_SECRET");
    expect(content).toContain("GITHUB_CALLBACK_URL");
  });
});

// ─── .env.example ───────────────────────────────────────────────

describe(".env.example", () => {
  const content = readRoot(".env.example");

  it("exists at workspace root", () => {
    expect(existsSync(join(ROOT, ".env.example"))).toBe(true);
  });

  it("documents all ENV_SPEC keys", () => {
    const specKeys = [
      "PORT", "NODE_ENV", "DATABASE_PATH", "LOG_LEVEL", "CORS_ORIGIN",
      "RATE_LIMIT_WINDOW_MS", "RATE_LIMIT_MAX_REQUESTS", "RATE_LIMIT_MAX_AUTHENTICATED",
      "SHUTDOWN_TIMEOUT_MS", "REQUEST_TIMEOUT_MS", "MAX_BODY_BYTES",
    ];
    for (const key of specKeys) {
      expect(content).toContain(key);
    }
  });

  it("includes OAuth configuration section", () => {
    expect(content).toContain("GITHUB_CLIENT_ID");
    expect(content).toContain("GITHUB_CLIENT_SECRET");
  });

  it("documents Render persistent disk path", () => {
    expect(content).toContain("/data/axis.db");
  });

  it("warns about CORS_ORIGIN for production", () => {
    expect(content).toMatch(/CORS_ORIGIN/);
    expect(content).toMatch(/production/i);
  });
});

// ─── CI workflow — deploy jobs ──────────────────────────────────

describe("CI workflow deploy jobs", () => {
  const content = readRoot(".github/workflows/ci.yml");

  it("exists", () => {
    expect(existsSync(join(ROOT, ".github/workflows/ci.yml"))).toBe(true);
  });

  it("documents Render auto-deploy strategy", () => {
    expect(content).toContain("Render auto-deploys from GitHub");
    expect(content).toContain("render.yaml");
  });

  it("has deploy-web job", () => {
    expect(content).toContain("deploy-web:");
  });

  it("deploy-web depends on build-and-test", () => {
    expect(content).toMatch(/deploy-web:[\s\S]*?needs:\s*build-and-test/);
  });

  it("deploy-web uses wrangler for Cloudflare Pages", () => {
    expect(content).toContain("wrangler");
  });

  it("deploy-web targets apps/web/dist", () => {
    expect(content).toContain("apps/web/dist");
  });

  it("deploy-web uses CLOUDFLARE_API_TOKEN secret", () => {
    expect(content).toContain("CLOUDFLARE_API_TOKEN");
  });
});

// ─── Cloudflare Pages — static assets ──────────────────────────

describe("Cloudflare Pages static config", () => {
  it("_redirects file exists for SPA routing", () => {
    expect(existsSync(join(ROOT, "apps/web/public/_redirects"))).toBe(true);
  });

  it("_redirects serves index.html for all routes", () => {
    const content = readRoot("apps/web/public/_redirects");
    expect(content).toContain("/index.html");
    expect(content).toContain("200");
  });

  it("_headers file exists with security headers", () => {
    expect(existsSync(join(ROOT, "apps/web/public/_headers"))).toBe(true);
  });

  it("_headers includes X-Frame-Options", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toContain("X-Frame-Options: DENY");
  });

  it("_headers includes X-Content-Type-Options", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toContain("X-Content-Type-Options: nosniff");
  });
});

// ─── Dockerfile ─────────────────────────────────────────────────

describe("Dockerfile production readiness", () => {
  const content = readRoot("Dockerfile");

  it("uses multi-stage build", () => {
    const stages = content.match(/^FROM\s/gm);
    expect(stages!.length).toBeGreaterThanOrEqual(3);
  });

  it("runs as non-root user", () => {
    expect(content).toContain("USER axis");
  });

  it("has health check", () => {
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("/v1/health");
  });

  it("exposes port 4000", () => {
    expect(content).toContain("EXPOSE 4000");
  });

  it("sets NODE_ENV=production", () => {
    expect(content).toContain("NODE_ENV=production");
  });
});

// ─── docker-compose.yml ────────────────────────────────────────

describe("docker-compose.yml", () => {
  const content = readRoot("docker-compose.yml");

  it("mounts axis-data volume at /data", () => {
    expect(content).toContain("axis-data:/data");
  });

  it("sets DATABASE_PATH to /data/axis.db", () => {
    expect(content).toContain("DATABASE_PATH=/data/axis.db");
  });

  it("has health check configuration", () => {
    expect(content).toContain("healthcheck:");
  });

  it("has restart policy", () => {
    expect(content).toContain("restart: unless-stopped");
  });
});
