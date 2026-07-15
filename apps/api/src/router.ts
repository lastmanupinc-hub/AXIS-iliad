import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Socket } from "node:net";
import { gzipSync, gunzipSync } from "node:zlib";
import { initRequest, getRequestId, getRequestStart, log, ErrorCode, type ErrorCodeValue } from "./logger.js";
import { checkRateLimit } from "./rate-limiter.js";
import { resolveAuth } from "./billing.js";
import { recordRequest, recordLatency } from "./metrics.js";
import { recordApiCall, checkQuota, getPersistenceBalance, runPgMigrations, closePool } from "@axis/snapshots";

// Store request reference on response for sendJSON gzip negotiation
const REQUEST_REF = new WeakMap<ServerResponse, IncomingMessage>();

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  method: string;
  rawPath: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  post(path: string, handler: RouteHandler) {
    this.addRoute("POST", path, handler);
  }

  get(path: string, handler: RouteHandler) {
    this.addRoute("GET", path, handler);
  }

  delete(path: string, handler: RouteHandler) {
    this.addRoute("DELETE", path, handler);
  }

  patch(path: string, handler: RouteHandler) {
    this.addRoute("PATCH", path, handler);
  }

  /** Introspection for fitness tests (e.g. the OpenAPI↔router bijection check) — never used in the request path. */
  getRoutes(): Array<{ method: string; path: string }> {
    return this.routes.map((r) => ({ method: r.method, path: r.rawPath }));
  }

  private addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)(\*)?/g, (_, name, wildcard) => {
      paramNames.push(name);
      return wildcard ? "(.+)" : "([^/]+)";
    });
    this.routes.push({
      method,
      rawPath: path,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      /* v8 ignore next — V8 quirk on object literal property */
      handler,
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    /* v8 ignore next 2 — req.url and req.method always defined in HTTP requests */
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";
    // HEAD should match GET routes — Node.js http.Server auto-suppresses the body
    const matchMethod = method === "HEAD" ? "GET" : method;

    for (const route of this.routes) {
      if (route.method !== matchMethod) continue;
      const match = url.pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      try {
        await route.handler(req, res, params);
      } catch (err) {
        log("error", "route_handler_error", {
          request_id: getRequestId(res),
          path: req.url,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.writableEnded) {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "Request body too large") {
            sendError(res, 413, ErrorCode.BODY_TOO_LARGE, "Request body exceeds the maximum allowed size (50 MB)");
          } else {
            sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
          }
        }
      }
      return;
    }

    sendError(res, 404, ErrorCode.NOT_FOUND, "Not found");
  }
}

export function sendJSON(res: ServerResponse, status: number, data: unknown) {
  const requestId = getRequestId(res);
  // Auto-inject request_id into error responses
  const payload = status >= 400 && requestId && typeof data === "object" && data !== null
    ? { ...(data as Record<string, unknown>), request_id: requestId }
    : data;
  if (requestId && !res.headersSent) {
    res.setHeader("X-Request-Id", requestId);
  }
  const json = JSON.stringify(payload);

  // Negotiate gzip compression for responses > 1KB
  const req = REQUEST_REF.get(res);
  const acceptEncoding = req?.headers["accept-encoding"] ?? "";
  const supportsGzip = typeof acceptEncoding === "string" && acceptEncoding.includes("gzip");

  if (supportsGzip && json.length > 1024) {
    const compressed = gzipSync(Buffer.from(json));
    res.writeHead(status, { "Content-Type": "application/json", "Content-Encoding": "gzip" });
    res.end(compressed);
  } else {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(json);
  }
}

export function sendError(
  res: ServerResponse,
  status: number,
  errorCode: ErrorCodeValue | string,
  message: string,
  extra?: Record<string, unknown>,
) {
  // H2.5: `extra` spreads FIRST so it can only ADD fields — the caller's
  // explicit message/errorCode always win. Several call sites spread a
  // reusable negotiation-body builder into `extra` (build402NegotiationBody),
  // whose own hardcoded `error: "Payment Required"` key used to silently
  // clobber the caller's specific message (even on 429 quota responses,
  // where "Payment Required" is simply wrong).
  sendJSON(res, status, { ...extra, error: message, error_code: errorCode });
}

export async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let settled = false;
    const maxSize = parseInt(process.env.MAX_BODY_BYTES ?? "52428800", 10); // default 50MB

    /* v8 ignore start — body reading event callbacks: race conditions hard to simulate */
    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        // Stop reading further data but don't destroy the socket —
        // destroying prevents the server from sending an HTTP response.
        req.removeAllListeners("data");
        if (!settled) { settled = true; reject(new Error("Request body too large")); }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks);

      // Decompress gzip-encoded request bodies (browser Compression Streams API)
      const encoding = req.headers?.["content-encoding"];
      if (encoding === "gzip") {
        try {
          // Cap decompressed output so a gzip bomb (tiny payload → GBs) can't allocate
          // unbounded memory BEFORE a post-hoc size check. gunzipSync throws
          // ERR_BUFFER_TOO_LARGE once output exceeds the cap.
          const decompressed = gunzipSync(raw, { maxOutputLength: maxSize });
          resolve(decompressed.toString("utf-8"));
        } catch (err) {
          if ((err as { code?: string })?.code === "ERR_BUFFER_TOO_LARGE") {
            reject(new Error("Request body too large"));
            return;
          }
          // Proxy may have already decompressed — try raw
          resolve(raw.toString("utf-8"));
        }
        return;
      }

      resolve(raw.toString("utf-8"));
    });
    req.on("error", (err) => { if (!settled) { settled = true; reject(err); } });
    /* v8 ignore stop */
    /* v8 ignore next — premature close hard to simulate in tests */
    req.on("close", () => { if (!settled) { settled = true; reject(new Error("Request closed prematurely")); } });
  });
}

export interface AppHandle {
  server: Server;
  shutdown: (timeout?: number) => Promise<void>;
  isShuttingDown: () => boolean;
}

// ─── Cache-Control map for static/semi-static GET endpoints ────
const CACHE_CONTROL: Record<string, string> = {
  "/.well-known/axis.json": "public, max-age=86400",
  "/.well-known/capabilities.json": "public, max-age=86400",
  "/.well-known/mcp.json": "public, max-age=86400",
  "/.well-known/glama.json": "public, max-age=86400",
  "/.well-known/oauth-authorization-server": "public, max-age=86400",
  "/mcp/.well-known/mcp.json": "public, max-age=86400",
  "/mcp/.well-known/agent.json": "public, max-age=86400",
  "/performance": "public, max-age=300",
  "/performance/reputation": "public, max-age=3600",
  "/robots.txt": "public, max-age=86400",
  "/llms.txt": "public, max-age=3600",
  "/v1/programs": "public, max-age=3600",
  "/v1/plans": "public, max-age=3600",
  "/v1/docs": "public, max-age=3600",
  "/v1/docs.md": "public, max-age=3600",
  "/v1/changelog": "public, max-age=3600",
  "/.well-known/skills/index.json": "public, max-age=3600",
  "/v1/install": "public, max-age=3600",
  "/for-agents": "public, max-age=3600",
  "/pricing": "public, max-age=3600",
  "/v1/mcp/server.json": "public, max-age=86400",
  "/v1/mcp/tools": "public, max-age=1800",
};

let _shuttingDown = false;
export function isShuttingDown(): boolean { return _shuttingDown; }

/**
 * Boot the async Postgres data layer WITHOUT making port-binding hostage to it.
 *
 * The old boot ran migrations before `server.listen()` and, on failure, only set
 * `process.exitCode = 1` — so a DB outage left the process unbound and EVERY endpoint
 * (including the DB-free health/discovery/static surface) unreachable, and the process
 * crash-looped. Instead: on the happy path we still listen only after migrations apply
 * (no pre-schema traffic window), but on failure we bind anyway so liveness/static/
 * discovery stay up, `/v1/health/ready` reports not_ready until the DB recovers, and we
 * retry migrations in the background so a transient outage self-heals without a restart.
 *
 * `runMigrations` / `scheduleRetry` are injectable for tests (no DB, no real timers).
 */
export function scheduleBootMigrations(
  server: Server,
  startListening: () => void,
  runMigrations: () => Promise<{ current_version: number }> = runPgMigrations,
  scheduleRetry: (fn: () => void, ms: number) => void = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
  },
): void {
  const attempt = (n: number): void => {
    void runMigrations()
      .then(({ current_version }) => {
        log("info", "pg_migrations_applied", { current_version, attempt: n });
        if (!server.listening) startListening();
      })
      .catch((err: unknown) => {
        const retry_in_ms = Math.min(60_000, 5_000 * n);
        log("error", "pg_migrations_failed", {
          error: err instanceof Error ? err.message : String(err),
          attempt: n,
          retry_in_ms,
        });
        // Stay up and serve the DB-free surface; readiness (pgIntegrityCheck) gates DB traffic.
        if (!server.listening) startListening();
        scheduleRetry(() => attempt(n + 1), retry_in_ms);
      });
  };
  attempt(1);
}

export function createApp(router: Router, port: number): Server {
  const connections = new Set<Socket>();
  _shuttingDown = false;
  const requestTimeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "120000", 10);

  const server = createServer(async (req, res) => {
    // Store request ref for gzip negotiation in sendJSON
    REQUEST_REF.set(res, req);
    // Per-request timeout
    /* v8 ignore start — timeout fires only when handler exceeds 30s */
    if (requestTimeoutMs > 0) {
      const timer = setTimeout(() => {
        if (!res.writableEnded) {
          sendError(res, 408, ErrorCode.TIMEOUT, "Request timed out");
        }
      }, requestTimeoutMs);
      res.on("finish", () => clearTimeout(timer));
      res.on("close", () => clearTimeout(timer));
    }
    /* v8 ignore stop */

    // Request ID + timing
    const requestId = initRequest(res);
    res.setHeader("X-Request-Id", requestId);

    // Security headers (OWASP)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // CORS — restrict in production, allow * in development
    const corsOrigin = process.env.CORS_ORIGIN
      ?? (process.env.NODE_ENV === "production" ? "https://iliad.trustfabric.ai" : "*");
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Encoding, Authorization, X-Agent-Budget, X-Agent-Mode, X-Axis-Key");
    res.setHeader("Access-Control-Expose-Headers", "X-Axis-Tier, X-Axis-Quota-Remaining, X-Axis-Quota-Limit, X-Axis-Credits-Balance, X-Axis-Request-Cost, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-Request-Id");
    res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight for 24h
    if (corsOrigin !== "*") {
      res.setHeader("Vary", "Origin");
      // Let the browser send the HttpOnly axis_session cookie on cross-origin requests
      // (web origin → the api.iliad.* sibling). Valid only with a specific origin, never "*".
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting (before route handling — auth-aware)
    const auth = await resolveAuth(req);
    if (!checkRateLimit(req, res, { authenticated: !auth.anonymous && auth.account !== null })) return;

    // Axis agent headers — quota and tier info injected on every authenticated response
    // so agents can pre-check budget before committing to a paid call.
    if (auth.account) {
      try {
        const quota = await checkQuota(auth.account.account_id);
        const remaining = quota.limits.max_snapshots_per_month === -1
          ? "unlimited"
          : String(Math.max(0, quota.limits.max_snapshots_per_month - quota.usage.snapshots_this_month));
        const limit = quota.limits.max_snapshots_per_month === -1 ? "unlimited" : String(quota.limits.max_snapshots_per_month);
        res.setHeader("X-Axis-Tier", auth.account.tier);
        res.setHeader("X-Axis-Quota-Remaining", remaining);
        res.setHeader("X-Axis-Quota-Limit", limit);
        const credits = await getPersistenceBalance(auth.account.account_id);
        res.setHeader("X-Axis-Credits-Balance", String(credits));
        res.setHeader("X-Axis-Request-Cost", "0.00");
      } catch {
        // Never fail a request due to header injection errors
      }
    }

    // MCP endpoint only accepts GET and POST — reject other methods cleanly
    if (req.url?.startsWith("/mcp") && req.method !== "GET" && req.method !== "POST") {
      res.writeHead(405, { "Allow": "GET, POST" });
      res.end();
      return;
    }

    // Log after response completes
    /* v8 ignore start — V8 quirk: finish callback ternaries for duration/status/level */
    res.on("finish", async () => {
      const start = getRequestStart(res);
      const duration = start ? Date.now() - start : undefined;
      const status = res.statusCode ?? 200;
      recordRequest(status);
      if (duration !== undefined && req.method && req.url) {
        recordLatency(req.method, req.url, duration);
      }
      if (auth.account && req.method && req.url) {
        // Persist per-account endpoint usage for MyAnalytics recommendations.
        try {
          await recordApiCall(auth.account.account_id, req.method, req.url, status);
        } catch {
          // Never fail request handling due to analytics write errors.
        }
      }
      // Suppress health/liveness/readiness probes from info logs — only log on error
      const path = req.url ?? "";
      const isProbe = path === "/v1/health" || path === "/v1/health/live" || path === "/v1/health/ready";
      const level = status >= 500 ? "error" as const
        : status >= 400 ? "warn" as const
        : "info" as const;
      if (isProbe && level === "info") return;
      log(level, "request", {
        request_id: requestId,
        method: req.method,
        path: req.url,
        status: res.statusCode,
        duration_ms: duration,
      });
    });
    /* v8 ignore stop */

    // Cache-Control for static/semi-static GET endpoints
    if (req.method === "GET" || req.method === "HEAD") {
      const path = (req.url ?? "").split("?")[0];
      const cc = CACHE_CONTROL[path];
      if (cc) res.setHeader("Cache-Control", cc);
    }

    router.handle(req, res);
  });

  server.on("connection", (socket: Socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log("error", "server_start_failed", { port, error: `Port ${port} is already in use` });
      process.exitCode = 1;
    } else {
      log("error", "server_start_failed", { port, error: err.message });
    }
  });

  // Keep-alive tuning: Render/ALB proxies idle at 60s.
  // Node default keepAliveTimeout=5s causes premature closes behind LBs.
  // headersTimeout must exceed keepAliveTimeout (Node enforces this since v19).
  const keepAliveMs = parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS ?? "65000", 10);
  server.keepAliveTimeout = keepAliveMs;
  server.headersTimeout = keepAliveMs + 5000;

  const startListening = () =>
    server.listen(port, () => {
      log("info", "server_start", { port, service: "axis-api" });
    });

  // The data layer is async Postgres (Neon); run migrations before serving
  // traffic (they no longer run lazily on first query). Tests manage their own
  // DB lifecycle, so skip the boot migration there.
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    startListening();
  } else {
    // Bind the port even if the DB is down (see scheduleBootMigrations): the DB-free
    // health/discovery/static surface stays reachable, and a transient outage self-heals.
    scheduleBootMigrations(server, startListening);
  }

  const shutdown = async (timeout = 10_000): Promise<void> => {
    if (_shuttingDown) return;
    _shuttingDown = true;
    log("info", "shutdown_start", { active_connections: connections.size });

    // Stop accepting new connections
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Wait for existing connections to drain, or force after timeout
    if (connections.size > 0) {
      await Promise.race([
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            /* v8 ignore next — polling only fires during real graceful shutdown */
            if (connections.size === 0) { clearInterval(check); resolve(); }
          }, 100);
        }),
        /* v8 ignore start — shutdown drain timeout only fires during real graceful shutdown */
        new Promise<void>((resolve) => setTimeout(() => {
          for (const socket of connections) socket.destroy();
          connections.clear();
          resolve();
        }, timeout)),
        /* v8 ignore stop */
      ]);
    }

    // Close the Postgres pool before exit.
    try {
      await closePool();
      log("info", "shutdown_db_closed", {});
    } catch (err) {
      // v8 ignore next
      log("error", "shutdown_db_close_failed", { error: (err as Error).message });
    }

    log("info", "shutdown_complete", {});
  };

  // Register signal handlers (skip in test environments)
  /* v8 ignore start — signal/crash handlers only fire outside test */
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    const onSignal = () => { shutdown().then(() => process.exit(0)); };
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);

    // Crash resilience: log + graceful shutdown on unhandled errors
    process.on("uncaughtException", (err) => {
      log("error", "uncaught_exception", { error: err.message, stack: err.stack });
      shutdown().finally(() => process.exit(1));
    });
    process.on("unhandledRejection", (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      log("error", "unhandled_rejection", { error: msg, stack });
      shutdown().finally(() => process.exit(1));
    });
  }
  /* v8 ignore stop */

  // Attach shutdown handle for programmatic access
  (server as Server & { shutdown: typeof shutdown }).shutdown = shutdown;

  return server;
}
