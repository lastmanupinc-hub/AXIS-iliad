// PUBLIC_API_BASE: the one public origin every absolute URL the API hands out
// is built on (AXIS Launch taskgate T34 — a dozen literals named the suspended
// Render host until then).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PUBLIC_API_BASE } from "@axis/generator-core";
import { PUBLIC_API_BASE, publicUrl, resolvePublicApiBase } from "./public-base.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function stringConst(rel: string, name: string): string {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const m = src.match(new RegExp(`const ${name}(?::\\s*string)?\\s*=\\s*"([^"]+)"`));
  if (!m) throw new Error(`${rel}: missing string const ${name}`);
  return m[1];
}

describe("resolvePublicApiBase", () => {
  it("is the live origin when PUBLIC_API_BASE is unset or blank", () => {
    expect(resolvePublicApiBase(undefined)).toBe("https://api.iliad.trustfabric.ai");
    expect(resolvePublicApiBase("")).toBe(DEFAULT_PUBLIC_API_BASE);
    expect(resolvePublicApiBase("   ")).toBe(DEFAULT_PUBLIC_API_BASE);
  });

  it("takes a configured origin and drops trailing slashes", () => {
    expect(resolvePublicApiBase("https://staging.example.test/")).toBe("https://staging.example.test");
    expect(resolvePublicApiBase("http://localhost:4000")).toBe("http://localhost:4000");
    expect(resolvePublicApiBase("https://example.test/api//")).toBe("https://example.test/api");
  });

  it("falls back to the live origin rather than publish a broken base", () => {
    expect(resolvePublicApiBase("not a url")).toBe(DEFAULT_PUBLIC_API_BASE);
    expect(resolvePublicApiBase("ftp://example.test")).toBe(DEFAULT_PUBLIC_API_BASE);
    expect(resolvePublicApiBase("https://example.test/?x=1")).toBe(DEFAULT_PUBLIC_API_BASE);
    expect(resolvePublicApiBase("https://example.test/#frag")).toBe(DEFAULT_PUBLIC_API_BASE);
  });
});

describe("PUBLIC_API_BASE", () => {
  it("defaults to the live API origin in the test environment", () => {
    expect(PUBLIC_API_BASE).toBe(resolvePublicApiBase(process.env.PUBLIC_API_BASE));
    if (!process.env.PUBLIC_API_BASE) expect(PUBLIC_API_BASE).toBe(DEFAULT_PUBLIC_API_BASE);
  });

  it("publicUrl joins a path with exactly one slash", () => {
    expect(publicUrl("/mcp")).toBe(`${PUBLIC_API_BASE}/mcp`);
    expect(publicUrl("v1/accounts")).toBe(`${PUBLIC_API_BASE}/v1/accounts`);
  });

  // The web bundle and the published SDK ship separately and cannot import
  // generator-core, so they carry their own copy of the literal. Pin them.
  it("the web app's PROD_API_BASE is the same origin", () => {
    expect(stringConst("apps/web/src/config.ts", "PROD_API_BASE")).toBe(DEFAULT_PUBLIC_API_BASE);
  });

  it("the published SDK's DEFAULT_BASE is the same origin", () => {
    expect(stringConst("packages/sdk/src/index.ts", "DEFAULT_BASE")).toBe(DEFAULT_PUBLIC_API_BASE);
  });

  it("the web app's CSP allows that origin for API calls", () => {
    const headers = readFileSync(join(ROOT, "apps/web/public/_headers"), "utf8");
    const connect = headers.match(/connect-src ([^;]+);/);
    expect(connect).not.toBeNull();
    expect(connect![1].split(/\s+/)).toContain(DEFAULT_PUBLIC_API_BASE);
  });
});
