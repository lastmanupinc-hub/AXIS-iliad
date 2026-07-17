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

  it("builds from the repo Dockerfile (Blueprint docker runtime, not GHCR image-pull)", () => {
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

  it("declares DATABASE_URL for the Neon data layer", () => {
    expect(content).toContain("DATABASE_URL");
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
      "PORT", "NODE_ENV", "DATABASE_URL", "LOG_LEVEL", "CORS_ORIGIN",
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

  it("documents Render deploy strategy", () => {
    expect(content).toContain("Deploy API to Render");
    expect(content).toContain("ghcr.io/lastmanupinc-hub/axis-api");
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

// ─── Synthetic monitor workflow (H8.9) ───────────────────────────

describe("Synthetic monitor workflow (dead-man's switch)", () => {
  const content = readRoot(".github/workflows/synthetic.yml");

  it("exists", () => {
    expect(existsSync(join(ROOT, ".github/workflows/synthetic.yml"))).toBe(true);
  });

  it("runs on a 30-minute schedule", () => {
    expect(content).toMatch(/cron:\s*"?\*\/30 \* \* \* \*"?/);
  });

  it("supports a manual forced-failure test run", () => {
    expect(content).toContain("workflow_dispatch");
    expect(content).toContain("force_failure");
  });

  it("uses only the native GITHUB_TOKEN — no new secret", () => {
    expect(content).toContain("secrets.GITHUB_TOKEN");
    expect(content).not.toMatch(/secrets\.(?!GITHUB_TOKEN)[A-Z_]+/);
  });

  it("is non-gating: runs the same live-probe.mjs script CI's own live-probe job uses", () => {
    expect(content).toContain("scripts/live-probe.mjs");
  });

  it("declares issues: write permission", () => {
    expect(content).toMatch(/permissions:[\s\S]*?issues:\s*write/);
  });

  it("both opens/updates and closes the tracking issue", () => {
    expect(content).toContain("gh issue create");
    expect(content).toContain("gh issue close");
  });

  it("keys issue open/close off alert_failed_count, not the raw failed_count", () => {
    // H8.9 live-rehearsal finding: Cloudflare's bot mitigation serves a JS
    // challenge to GitHub Actions runner IPs on web_bundle_marker specifically
    // (confirmed via a live diagnostic run — 403, cf-mitigated: challenge),
    // a false positive from every scheduled run if left unfiltered. The
    // monitor must read the alert_* outputs (which live-probe.mjs already
    // excludes known CI-IP false positives from), not the raw ones.
    expect(content).toContain("steps.probe.outputs.alert_failed_count");
    expect(content).toContain("steps.probe.outputs.alert_failed_names");
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

  // ─── H8.10 — CSP + HSTS ─────────────────────────────────────────

  it("_headers includes a CSP scoped to self + the two API origins", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toContain("Content-Security-Policy:");
    expect(content).toContain("default-src 'self'");
    // The two API origins the web app actually talks to (config.ts's
    // PROD_API_BASE, same underlying Render service under two hostnames).
    expect(content).toContain("https://api.iliad.trustfabric.ai");
    expect(content).toContain("https://axis-api-6c7z.onrender.com");
  });

  it("CSP allows Cloudflare's own auto-injected analytics beacon (would otherwise self-break)", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toContain("https://static.cloudflareinsights.com");
  });

  it("CSP sets frame-ancestors 'none' (anti-clickjacking, alongside the legacy X-Frame-Options)", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toMatch(/frame-ancestors 'none'/);
  });

  it("CSP restricts navigation-adjacent surfaces the app doesn't use (frame-src, object-src)", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toMatch(/frame-src 'none'/);
    expect(content).toMatch(/object-src 'none'/);
  });

  it("includes HSTS, scoped to this host only (no includeSubDomains — trustfabric.ai has other AXIS products on other subdomains not controlled by this repo)", () => {
    const content = readRoot("apps/web/public/_headers");
    expect(content).toMatch(/Strict-Transport-Security:\s*max-age=\d+/);
    expect(content).not.toContain("includeSubDomains");
    expect(content).not.toContain("preload");
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

  it("declares DATABASE_URL for the Neon data layer", () => {
    expect(content).toContain("DATABASE_URL");
  });

  it("has health check configuration", () => {
    expect(content).toContain("healthcheck:");
  });

  it("has restart policy", () => {
    expect(content).toContain("restart: unless-stopped");
  });
});
