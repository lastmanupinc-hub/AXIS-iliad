import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router, sendJSON, sendError, readBody } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { resetRateLimits } from "./rate-limiter.js";
import { getMetricsSnapshot } from "./metrics.js";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

let server: Server;
let testPort = 0;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
  data: Record<string, unknown> | string;
}

async function req(
  method: string,
  path: string,
  body?: string | object,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = typeof body === "object" ? JSON.stringify(body) : body;
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: h },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const rh: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") rh[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: rh, body: raw, data: data as Record<string, unknown> | string });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const router = new Router();

  // Echo handler — returns params + query + body
  router.get("/echo", async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    sendJSON(res, 200, {
      method: "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    });
  });

  router.post("/echo", async (req, res) => {
    const body = await readBody(req);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    sendJSON(res, 200, { method: "POST", body: parsed });
  });

  // Single param
  router.get("/items/:id", async (_req, res, params) => {
    sendJSON(res, 200, { id: params.id });
  });

  // Multiple params
  router.get("/users/:userId/posts/:postId", async (_req, res, params) => {
    sendJSON(res, 200, { userId: params.userId, postId: params.postId });
  });

  // Wildcard param
  router.get("/files/:path*", async (_req, res, params) => {
    sendJSON(res, 200, { path: params.path });
  });

  // Handler that throws
  router.get("/throws", async () => {
    throw new Error("Intentional test error");
  });

  // Probes for the request-log error_code assertions at the bottom of this file.
  router.get("/log-probe-413", async (_req, res) => {
    sendError(res, 413, "FILE_TOO_LARGE", "too big");
  });
  router.get("/log-probe-ok", async (_req, res) => {
    sendJSON(res, 200, { ok: true });
  });

  // Handler that returns custom status
  router.post("/status/:code", async (_req, res, params) => {
    const code = parseInt(params.code, 10);
    sendJSON(res, code, { status: code });
  });

  // sendError test route
  router.get("/error-shape", async (_req, res) => {
    sendError(res, 422, "CUSTOM_CODE", "Custom error message", { detail: "extra" });
  });

  // H2.5: sendError test route where `extra` carries its OWN competing
  // `error`/`error_code` keys (exactly what build402NegotiationBody's spread
  // does at every 402/429 call site) — the caller's explicit message/code
  // must win, never get silently overwritten by whatever `extra` happens to
  // contain.
  router.get("/error-shape-clobber", async (_req, res) => {
    sendError(res, 402, "TIER_REQUIRED", "Specific, useful message for this call", {
      error: "Payment Required",
      error_code: "SOME_OTHER_CODE",
      price: "0.50",
    });
  });

  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Route matching ─────────────────────────────────────────────

describe("Router — route matching", () => {
  it("matches exact static path", async () => {
    const res = await req("GET", "/echo");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).method).toBe("GET");
  });

  it("returns 404 for unregistered path", async () => {
    const res = await req("GET", "/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 404 for wrong method", async () => {
    const res = await req("POST", "/items/123"); // /items/:id is GET-only
    expect(res.status).toBe(404);
  });

  it("distinguishes GET and POST on same path", async () => {
    const getRes = await req("GET", "/echo");
    expect((getRes.data as Record<string, unknown>).method).toBe("GET");
    const postRes = await req("POST", "/echo", { foo: "bar" });
    expect((postRes.data as Record<string, unknown>).method).toBe("POST");
  });
});

// ─── Parameter extraction ───────────────────────────────────────

describe("Router — parameter extraction", () => {
  it("extracts single :param", async () => {
    const res = await req("GET", "/items/abc-123");
    expect((res.data as Record<string, unknown>).id).toBe("abc-123");
  });

  it("extracts multiple :params", async () => {
    const res = await req("GET", "/users/u42/posts/p7");
    const data = res.data as Record<string, unknown>;
    expect(data.userId).toBe("u42");
    expect(data.postId).toBe("p7");
  });

  it("handles URL-encoded characters in params", async () => {
    const res = await req("GET", "/items/hello%20world");
    expect((res.data as Record<string, unknown>).id).toBe("hello%20world");
  });

  it("non-matching nested path returns 404", async () => {
    const res = await req("GET", "/items/123/extra");
    expect(res.status).toBe(404);
  });
});

// ─── Wildcard params ────────────────────────────────────────────

describe("Router — wildcard :param*", () => {
  it("captures single segment", async () => {
    const res = await req("GET", "/files/readme.md");
    expect((res.data as Record<string, unknown>).path).toBe("readme.md");
  });

  it("captures deep nested path", async () => {
    const res = await req("GET", "/files/src/components/Button.tsx");
    expect((res.data as Record<string, unknown>).path).toBe("src/components/Button.tsx");
  });

  it("captures path with dots and dashes", async () => {
    const res = await req("GET", "/files/dist/my-app.min.js");
    expect((res.data as Record<string, unknown>).path).toBe("dist/my-app.min.js");
  });
});

// ─── Error handling ─────────────────────────────────────────────

describe("Router — error handling", () => {
  it("handler error returns 500", async () => {
    const res = await req("GET", "/throws");
    expect(res.status).toBe(500);
  });

  it("500 response includes error field", async () => {
    const res = await req("GET", "/throws");
    const data = res.data as Record<string, unknown>;
    expect(data.error).toBe("Internal server error");
  });

  it("500 response includes request_id", async () => {
    const res = await req("GET", "/throws");
    const data = res.data as Record<string, unknown>;
    expect(typeof data.request_id).toBe("string");
  });
});

// ─── sendJSON / sendError ───────────────────────────────────────

describe("Router — sendJSON and sendError", () => {
  it("sendJSON sets Content-Type header", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("sendError includes error_code field", async () => {
    const res = await req("GET", "/error-shape");
    expect(res.status).toBe(422);
    const data = res.data as Record<string, unknown>;
    expect(data.error_code).toBe("CUSTOM_CODE");
    expect(data.error).toBe("Custom error message");
    expect(data.detail).toBe("extra");
  });

  it("H2.5: the caller's explicit message/errorCode win over anything of the same name inside `extra` — extra can add fields, never silently override the two the caller deliberately chose", async () => {
    const res = await req("GET", "/error-shape-clobber");
    expect(res.status).toBe(402);
    const data = res.data as Record<string, unknown>;
    expect(data.error).toBe("Specific, useful message for this call");
    expect(data.error_code).toBe("TIER_REQUIRED");
    expect(data.price).toBe("0.50"); // extra's non-colliding fields still pass through untouched
  });

  it("error responses include request_id", async () => {
    const res = await req("GET", "/error-shape");
    const data = res.data as Record<string, unknown>;
    expect(typeof data.request_id).toBe("string");
  });

  it("success response body is valid JSON", async () => {
    const res = await req("GET", "/echo");
    expect(() => JSON.parse(res.body)).not.toThrow();
  });

  it("custom status codes work", async () => {
    const res = await req("POST", "/status/201", {});
    expect(res.status).toBe(201);
    expect((res.data as Record<string, unknown>).status).toBe(201);
  });
});

// ─── Middleware pipeline ────────────────────────────────────────

describe("Router — middleware pipeline (security + CORS + request-id)", () => {
  it("every response has X-Request-Id", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("each request gets unique request ID", async () => {
    const r1 = await req("GET", "/echo");
    const r2 = await req("GET", "/echo");
    expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
  });

  it("security headers present on success", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["strict-transport-security"]).toBeTruthy();
  });

  it("CORS headers present", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toBeTruthy();
  });

  it("OPTIONS returns 204 with CORS", async () => {
    const res = await req("OPTIONS", "/echo");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("OPTIONS preflights are still counted in request metrics (H-Phase-A cycle 11)", async () => {
    // The "finish" listener that drives recordRequest used to be registered
    // AFTER the OPTIONS early-return — an OPTIONS response's res.end() had
    // already fired before that listener ever attached, so it silently never
    // incremented statusCounts. Moved the registration ahead of every early
    // return; assert the delta, not an absolute count, since these counters
    // are module-level cumulative across the whole suite.
    const before = getMetricsSnapshot();
    const res = await req("OPTIONS", "/echo");
    expect(res.status).toBe(204);
    // Yield past the microtask the "finish" listener's IIFE runs on.
    await new Promise((resolve) => setImmediate(resolve));
    const after = getMetricsSnapshot();
    expect(after.requestCount).toBe(before.requestCount + 1);
    expect(after.statusCounts["2xx"] ?? 0).toBe((before.statusCounts["2xx"] ?? 0) + 1);
  });

  it("rate limit headers present", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
    expect(res.headers["ratelimit-remaining"]).toBeTruthy();
    expect(res.headers["ratelimit-reset"]).toBeTruthy();
  });
});

// ─── readBody ───────────────────────────────────────────────────

describe("Router — readBody", () => {
  it("reads JSON body from POST", async () => {
    const res = await req("POST", "/echo", { key: "value" });
    const data = res.data as Record<string, unknown>;
    const body = data.body as Record<string, unknown>;
    expect(body.key).toBe("value");
  });

  it("handles empty body", async () => {
    const res = await req("POST", "/echo", "");
    expect(res.status).toBe(200);
  });

  it("handles nested JSON", async () => {
    const nested = { a: { b: { c: [1, 2, 3] } } };
    const res = await req("POST", "/echo", nested);
    const data = res.data as Record<string, unknown>;
    const body = data.body as Record<string, unknown>;
    const a = body.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    expect(b.c).toEqual([1, 2, 3]);
  });
});

// ─── Query strings ──────────────────────────────────────────────

describe("Router — query string handling", () => {
  it("passes query params to handler", async () => {
    const res = await req("GET", "/echo?foo=bar&baz=1");
    const data = res.data as Record<string, unknown>;
    const query = data.query as Record<string, string>;
    expect(query.foo).toBe("bar");
    expect(query.baz).toBe("1");
  });

  it("query params do not affect route matching", async () => {
    const res = await req("GET", "/items/42?include=meta");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).id).toBe("42");
  });
});

// ─── Direct handle() call with undefined method/url ─────────────

describe("Router — handle() with undefined method and url", () => {
  it("falls back to '/' when req.url is undefined and 'GET' when req.method is undefined", async () => {
    const router = new Router();
    let handlerCalled = false;
    router.get("/", async (_req, res) => {
      handlerCalled = true;
      sendJSON(res, 200, { ok: true });
    });

    const chunks: Buffer[] = [];
    const mockRes = {
      writeHead: (_status: number, _headers?: Record<string, string>) => {},
      end: (data?: string) => { if (data) chunks.push(Buffer.from(data)); },
      setHeader: () => {},
    } as unknown as import("node:http").ServerResponse;

    const mockReq = {
      url: undefined,     // triggers req.url ?? "/"
      method: undefined,  // triggers req.method ?? "GET"
      headers: { host: "localhost" },
    } as unknown as import("node:http").IncomingMessage;

    await router.handle(mockReq, mockRes);
    expect(handlerCalled).toBe(true);
    const body = Buffer.concat(chunks).toString();
    expect(JSON.parse(body)).toMatchObject({ ok: true });
  });
});

// ─── HEAD method support ────────────────────────────────────────

describe("Router — HEAD method support", () => {
  it("HEAD on a GET route returns 200 with empty body", async () => {
    const res = await req("HEAD", "/echo");
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
  });

  it("HEAD returns the same headers as GET", async () => {
    const head = await req("HEAD", "/echo");
    const get = await req("GET", "/echo");
    expect(head.headers["content-type"]).toBe(get.headers["content-type"]);
    expect(head.headers["x-request-id"]).toBeTruthy();
  });

  it("HEAD works on parameterised routes", async () => {
    const res = await req("HEAD", "/items/99");
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
  });

  it("HEAD on unknown route returns 404", async () => {
    const res = await req("HEAD", "/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("HEAD does not match POST-only routes", async () => {
    const res = await req("HEAD", "/status/200");
    expect(res.status).toBe(404);
  });

  it("CORS allows HEAD method", async () => {
    const res = await req("HEAD", "/echo");
    const methods = res.headers["access-control-allow-methods"] as string;
    expect(methods).toContain("HEAD");
  });
});

// Two production incidents on 2026-07-28 were undiagnosable from logs because
// the request line carried only `status`: four 503s on the paid webhook (missing
// signing key vs unprovisioned account — one of which means a customer paid and
// got nothing) and 48 413s on /v1/analyze, which could have been any of five
// distinct branches. Both answers had to come from reading source and guessing.
// These pin the fix: a failing request must name WHICH failure fired.
describe("request log names which failure fired", () => {
  /**
   * Collect the JSON log lines written while fn() runs.
   *
   * Two things this has to handle, both of which silently produced an empty
   * capture on the first attempt: logging is suppressed under vitest unless
   * AXIS_ENABLE_TEST_LOGS=1 (logger.ts shouldEmitRuntimeLogs), and the request
   * line is emitted from the res.finish handler, which runs AFTER the client
   * promise resolves — so the capture has to outlive the response.
   */
  async function withCapturedLogs(fn: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
    const lines: Array<Record<string, unknown>> = [];
    const prevFlag = process.env.AXIS_ENABLE_TEST_LOGS;
    process.env.AXIS_ENABLE_TEST_LOGS = "1";
    const realWrite = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      const s = typeof chunk === "string" ? chunk : String(chunk);
      for (const l of s.split("\n")) {
        if (!l.startsWith("{")) continue;
        try { lines.push(JSON.parse(l)); } catch { /* not a log line */ }
      }
      return realWrite(chunk, ...rest);
    };
    try {
      await fn();
      // Let the finish handler's microtask + timer turn run before restoring.
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.stdout.write = realWrite;
      if (prevFlag === undefined) delete process.env.AXIS_ENABLE_TEST_LOGS;
      else process.env.AXIS_ENABLE_TEST_LOGS = prevFlag;
    }
    return lines;
  }

  it("emits error_code on a failure response, identifying the branch", async () => {
    const logs = await withCapturedLogs(async () => { await req("GET", "/log-probe-413"); });
    const line = logs.find((l) => l.msg === "request" && l.path === "/log-probe-413");
    expect(line, "no request log line captured").toBeDefined();
    expect(line!.status).toBe(413);
    expect(line!.error_code, "413 logged without the code that says WHICH 413").toBe("FILE_TOO_LARGE");
  });

  it("omits error_code on success rather than logging an empty field", async () => {
    const logs = await withCapturedLogs(async () => { await req("GET", "/log-probe-ok"); });
    const line = logs.find((l) => l.msg === "request" && l.path === "/log-probe-ok");
    expect(line?.status).toBe(200);
    expect(Object.keys(line ?? {})).not.toContain("error_code");
  });
});
