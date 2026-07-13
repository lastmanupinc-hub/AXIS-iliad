import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router, sendJSON, sendError } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { ErrorCode, ERROR_CODE_CATALOG, initRequest, getRequestId, getRequestStart } from "./logger.js";
import { handleCreateSnapshot, handleHealthCheck } from "./handlers.js";
import type { ServerResponse } from "node:http";

// ─── Unit tests for logger.ts ──────────────────────────────────

describe("logger", () => {
  it("initRequest generates UUID and stores timing", async () => {
    // Create a fake ServerResponse-like object for WeakMap keying
    const fakeRes = {} as ServerResponse;
    const id = initRequest(fakeRes);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(getRequestId(fakeRes)).toBe(id);
    expect(getRequestStart(fakeRes)).toBeTypeOf("number");
    expect(Date.now() - getRequestStart(fakeRes)!).toBeLessThan(100);
  });

  it("getRequestId returns undefined for unknown response", async () => {
    const fakeRes = {} as ServerResponse;
    expect(getRequestId(fakeRes)).toBeUndefined();
  });

  it("each request gets a unique ID", async () => {
    const r1 = {} as ServerResponse;
    const r2 = {} as ServerResponse;
    const id1 = initRequest(r1);
    const id2 = initRequest(r2);
    expect(id1).not.toBe(id2);
  });

  it("ErrorCode has all expected error categories", async () => {
    // 400 family
    expect(ErrorCode.INVALID_JSON).toBe("INVALID_JSON");
    expect(ErrorCode.MISSING_FIELD).toBe("MISSING_FIELD");
    expect(ErrorCode.INVALID_FORMAT).toBe("INVALID_FORMAT");
    expect(ErrorCode.FILE_INVALID).toBe("FILE_INVALID");
    expect(ErrorCode.PATH_TRAVERSAL).toBe("PATH_TRAVERSAL");
    expect(ErrorCode.INVALID_PROGRAM).toBe("INVALID_PROGRAM");
    // 401
    expect(ErrorCode.AUTH_REQUIRED).toBe("AUTH_REQUIRED");
    expect(ErrorCode.INVALID_KEY).toBe("INVALID_KEY");
    // 403
    expect(ErrorCode.TIER_REQUIRED).toBe("TIER_REQUIRED");
    expect(ErrorCode.FORBIDDEN).toBe("FORBIDDEN");
    // 404
    expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCode.CONTEXT_PENDING).toBe("CONTEXT_PENDING");
    // 409
    expect(ErrorCode.CONFLICT).toBe("CONFLICT");
    // 413
    expect(ErrorCode.PAYLOAD_TOO_LARGE).toBe("PAYLOAD_TOO_LARGE");
    expect(ErrorCode.BODY_TOO_LARGE).toBe("BODY_TOO_LARGE");
    expect(ErrorCode.FILE_TOO_LARGE).toBe("FILE_TOO_LARGE");
    expect(ErrorCode.FILE_COUNT_EXCEEDED).toBe("FILE_COUNT_EXCEEDED");
    // 422
    expect(ErrorCode.UNPROCESSABLE).toBe("UNPROCESSABLE");
    // 429
    expect(ErrorCode.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(ErrorCode.QUOTA_EXCEEDED).toBe("QUOTA_EXCEEDED");
    expect(ErrorCode.SEAT_LIMIT).toBe("SEAT_LIMIT");
    // 500
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCode.PROCESS_FAILED).toBe("PROCESS_FAILED");
    // 502
    expect(ErrorCode.UPSTREAM_ERROR).toBe("UPSTREAM_ERROR");
  });

  it("ErrorCode values are unique", async () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("H4.2: ERROR_CODE_CATALOG documents every ErrorCode value exactly once, no more, no less", async () => {
    const allCodes = Object.values(ErrorCode).sort();
    const catalogCodes = ERROR_CODE_CATALOG.map((e) => e.code).sort();
    expect(catalogCodes).toEqual(allCodes);
  });

  it("H4.2: every ERROR_CODE_CATALOG entry has non-empty retry_guidance and description", async () => {
    for (const entry of ERROR_CODE_CATALOG) {
      expect(entry.retry_guidance.length, `${entry.code} has empty retry_guidance`).toBeGreaterThan(0);
      expect(entry.description.length, `${entry.code} has empty description`).toBeGreaterThan(0);
    }
  });
});

// ─── Integration tests for request ID + error code in responses ─

let server: Server;
let testPort = 0;

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: { "Content-Type": "application/json" } },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") headers[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/snapshots", handleCreateSnapshot);

  // Use createApp (via startTestServer) for full middleware (request ID, logging)
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

describe("request logging middleware", () => {
  it("every response includes X-Request-Id header", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(200);
    expect(r.headers["x-request-id"]).toBeTruthy();
    expect(r.headers["x-request-id"]).toMatch(/^[0-9a-f]{8}-/);
  });

  it("each request gets a different request ID", async () => {
    const r1 = await req("GET", "/v1/health");
    const r2 = await req("GET", "/v1/health");
    expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
  });

  it("404 responses include X-Request-Id header", async () => {
    const r = await req("GET", "/v1/nonexistent");
    expect(r.status).toBe(404);
    expect(r.headers["x-request-id"]).toBeTruthy();
  });

  it("error responses include request_id in body", async () => {
    const r = await req("GET", "/v1/nonexistent");
    const data = r.data as Record<string, unknown>;
    expect(data.request_id).toBeTruthy();
    expect(data.request_id).toBe(r.headers["x-request-id"]);
  });

  it("error responses include error_code field", async () => {
    const r = await req("GET", "/v1/nonexistent");
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("NOT_FOUND");
    expect(data.error).toBe("Not found");
  });

  it("400 error includes error_code and request_id", async () => {
    const r = await req("POST", "/v1/snapshots", { files: [{ path: "a.ts", content: "" }] });
    expect(r.status).toBe(400);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("MISSING_FIELD");
    expect(data.request_id).toBeTruthy();
    expect(data.error).toContain("Missing required manifest");
  });

  it("invalid JSON returns INVALID_JSON error code", async () => {
    const r = await new Promise<{ status: number; headers: Record<string, string>; data: unknown }>((resolve, reject) => {
      const httpReq = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path: "/v1/snapshots", method: "POST", headers: { "Content-Type": "application/json" } },
        (res: import("node:http").IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            let data: unknown;
            try { data = JSON.parse(raw); } catch { data = raw; }
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === "string") headers[k] = v;
            }
            resolve({ status: res.statusCode ?? 0, headers, data });
          });
        },
      );
      httpReq.on("error", reject);
      httpReq.write("{invalid json");
      httpReq.end();
    });
    expect(r.status).toBe(400);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("INVALID_JSON");
  });

  it("successful responses do NOT include error_code or request_id in body", async () => {
    const r = await req("GET", "/v1/health");
    const data = r.data as Record<string, unknown>;
    expect(data.status).toBe("ok");
    expect(data.error_code).toBeUndefined();
    // request_id is in header, not in 200 body
    expect(data.request_id).toBeUndefined();
  });

  it("CORS headers are present on all responses", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["access-control-allow-origin"]).toBe("*");
  });
});
