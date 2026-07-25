import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import * as logger from "./logger.js";
import {
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthJwks,
  handleOAuthIntrospect,
  requireBearerToken,
  createOAuthClient,
  resolveJwtKeys,
} from "./oauth-server.js";

// ─── resolveJwtKeys — pure key-selection logic, no server/DB needed ───────

describe("resolveJwtKeys", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  // This machine has untracked, gitignored private-key.pem/public-key.pem
  // files left over from local dev (see .gitignore's `*-key.pem`) -- the
  // "no key material available" tests must not depend on that incidental
  // filesystem state, so they force the file-lookup branch to miss.
  function noKeyFilesOnDisk() {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
  }

  it("prefers JWT_PRIVATE_KEY/JWT_PUBLIC_KEY env vars over file lookup or generation", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;

    const resolved = resolveJwtKeys();

    expect(resolved.source).toBe("env");
    expect(resolved.privateKey).toBe(privateKey);
    expect(resolved.publicKey).toBe(publicKey);
  });

  it("falls back to a generated keypair when no env vars and no key files exist", () => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.NODE_ENV = "test";
    noKeyFilesOnDisk();

    const resolved = resolveJwtKeys();

    expect(resolved.source).toBe("generated");
    expect(resolved.privateKey).toContain("PRIVATE KEY");
    expect(resolved.publicKey).toContain("PUBLIC KEY");
  });

  it("generated keys form a working sign/verify pair", () => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.NODE_ENV = "test";
    noKeyFilesOnDisk();

    const { privateKey, publicKey } = resolveJwtKeys();
    const token = jwt.sign({ sub: "x" }, privateKey, { algorithm: "RS256" });

    expect(() => jwt.verify(token, publicKey, { algorithms: ["RS256"] })).not.toThrow();
  });

  it("reads key files from disk when present and no env vars are set", () => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.NODE_ENV = "test";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockImplementation((p) =>
      String(p).includes("public") ? "FAKE-PUBLIC-PEM" : "FAKE-PRIVATE-PEM",
    );

    const resolved = resolveJwtKeys();

    expect(resolved.source).toBe("file");
    expect(resolved.privateKey).toBe("FAKE-PRIVATE-PEM");
    expect(resolved.publicKey).toBe("FAKE-PUBLIC-PEM");
  });

  it("logs an error-level warning when falling back to generated keys in production", () => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.NODE_ENV = "production";
    noKeyFilesOnDisk();
    const logSpy = vi.spyOn(logger, "log");

    resolveJwtKeys();

    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "oauth_ephemeral_keys_in_production",
      expect.objectContaining({ message: expect.stringContaining("JWT_PRIVATE_KEY") }),
    );
  });

  it("does NOT log the production warning outside production", () => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.NODE_ENV = "test";
    noKeyFilesOnDisk();
    const logSpy = vi.spyOn(logger, "log");

    resolveJwtKeys();

    expect(logSpy).not.toHaveBeenCalledWith("error", "oauth_ephemeral_keys_in_production", expect.anything());
  });

  it("does NOT log the production warning in production when env keys ARE set", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.NODE_ENV = "production";
    const logSpy = vi.spyOn(logger, "log");

    const resolved = resolveJwtKeys();

    expect(resolved.source).toBe("env");
    expect(logSpy).not.toHaveBeenCalledWith("error", "oauth_ephemeral_keys_in_production", expect.anything());
  });
});

// ─── OAuth2 authorization-server routes (DB-gated, mirrors oauth.test.ts) ──

describe("MCP OAuth2 server routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/oauth/authorize", handleOAuthAuthorize);
    router.post("/oauth/token", handleOAuthToken);
    router.get("/oauth/jwks", handleOAuthJwks);
    router.post("/oauth/introspect", handleOAuthIntrospect);
    const t = await startTestServer(router);
    server = t.server;
    baseUrl = t.baseUrl;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  it("issues a token for a registered client and verifies it via introspection", async () => {
    const { id, secret } = await createOAuthClient("test-client", ["https://example.com/cb"]);

    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "irrelevant-in-this-demo-flow",
        client_id: id,
        client_secret: secret,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const body = (await tokenRes.json()) as { access_token: string; token_type: string };
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.access_token).toBe("string");

    const introspectRes = await fetch(`${baseUrl}/oauth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: body.access_token }),
    });
    expect(introspectRes.status).toBe(200);
    const introspected = (await introspectRes.json()) as { active: boolean; client_id: string };
    expect(introspected.active).toBe(true);
    expect(introspected.client_id).toBe(id);
  });

  it("rejects a token request with an unknown client_secret", async () => {
    const { id } = await createOAuthClient("test-client-2", ["https://example.com/cb"]);

    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "x",
        client_id: id,
        client_secret: "wrong-secret",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("introspection reports active:false for a garbage token", async () => {
    const res = await fetch(`${baseUrl}/oauth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-jwt" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
  });

  it("serves a JWKS document describing the current signing key", async () => {
    const res = await fetch(`${baseUrl}/oauth/jwks`);
    expect(res.status).toBe(200);
    const jwks = (await res.json()) as { keys: Array<{ kty: string; alg: string; n: string; e: string }> };
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: "RSA", alg: "RS256", e: "AQAB" });
    expect(typeof jwks.keys[0].n).toBe("string");
  });

  it("/oauth/authorize rejects a redirect_uri not registered for the client", async () => {
    const { id } = await createOAuthClient("test-client-3", ["https://example.com/registered"]);

    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent("https://evil.example/phish")}&response_type=code`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(400);
  });

  it("/oauth/authorize redirects to the registered redirect_uri with a code", async () => {
    const { id } = await createOAuthClient("test-client-4", ["https://example.com/cb"]);

    const res = await fetch(
      `${baseUrl}/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent("https://example.com/cb")}&response_type=code&state=xyz`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://example.com/cb")).toBe(true);
    expect(location).toContain("code=");
    expect(location).toContain("state=xyz");
  });

  it("requireBearerToken accepts a token issued by this server and rejects garbage", async () => {
    const { id, secret } = await createOAuthClient("test-client-5", ["https://example.com/cb"]);
    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: "x", client_id: id, client_secret: secret }),
    });
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const router = new Router();
    router.get("/protected", async (req, res) => {
      const ok = await requireBearerToken(req, res);
      if (!ok) return; // requireBearerToken already sent the 401
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const t = await startTestServer(router);
    try {
      const good = await fetch(`${t.baseUrl}/protected`, { headers: { Authorization: `Bearer ${access_token}` } });
      expect(good.status).toBe(200);

      const bad = await fetch(`${t.baseUrl}/protected`, { headers: { Authorization: "Bearer garbage" } });
      expect(bad.status).toBe(401);

      const missing = await fetch(`${t.baseUrl}/protected`);
      expect(missing.status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => t.server.close(() => resolve()));
    }
  });
});
