import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Socket } from "node:net";
import { initRequest, getRequestId, getRequestStart, log, type ErrorCodeValue } from "./logger.js";
import { checkRateLimit } from "./rate-limiter.js";
import { resolveAuth } from "./billing.js";

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  method: string;
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

  private addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)(\*)?/g, (_, name, wildcard) => {
      paramNames.push(name);
      return wildcard ? "(.+)" : "([^/]+)";
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";

    for (const route of this.routes) {
      if (route.method !== method) continue;
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
          sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
        }
      }
      return;
    }

    sendError(res, 404, "NOT_FOUND", "Not found");
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
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function sendError(
  res: ServerResponse,
  status: number,
  errorCode: ErrorCodeValue | string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendJSON(res, status, { error: message, error_code: errorCode, ...extra });
}

export async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let settled = false;
    const maxSize = 50 * 1024 * 1024; // 50MB limit

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy();
        if (!settled) { settled = true; reject(new Error("Request body too large")); }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString("utf-8")); } });
    req.on("error", (err) => { if (!settled) { settled = true; reject(err); } });
    req.on("close", () => { if (!settled) { settled = true; reject(new Error("Request closed prematurely")); } });
  });
}

export interface AppHandle {
  server: Server;
  shutdown: (timeout?: number) => Promise<void>;
  isShuttingDown: () => boolean;
}

let _shuttingDown = false;
export function isShuttingDown(): boolean { return _shuttingDown; }

export function createApp(router: Router, port: number): Server {
  const connections = new Set<Socket>();
  _shuttingDown = false;

  const server = createServer((req, res) => {
    // Request ID + timing
    const requestId = initRequest(res);
    res.setHeader("X-Request-Id", requestId);

    // Security headers (OWASP)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting (before route handling — auth-aware)
    const auth = resolveAuth(req);
    if (!checkRateLimit(req, res, { authenticated: !auth.anonymous && auth.account !== null })) return;

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Log after response completes
    res.on("finish", () => {
      const start = getRequestStart(res);
      const duration = start ? Date.now() - start : undefined;
      const level = (res.statusCode ?? 200) >= 500 ? "error" as const
        : (res.statusCode ?? 200) >= 400 ? "warn" as const
        : "info" as const;
      log(level, "request", {
        request_id: requestId,
        method: req.method,
        path: req.url,
        status: res.statusCode,
        duration_ms: duration,
      });
    });

    router.handle(req, res);
  });

  server.on("connection", (socket: Socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });

  server.listen(port, () => {
    log("info", "server_start", { port, service: "axis-api" });
  });

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
            if (connections.size === 0) { clearInterval(check); resolve(); }
          }, 100);
        }),
        new Promise<void>((resolve) => setTimeout(() => {
          for (const socket of connections) socket.destroy();
          connections.clear();
          resolve();
        }, timeout)),
      ]);
    }

    log("info", "shutdown_complete", {});
  };

  // Register signal handlers (skip in test environments)
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    const onSignal = () => { shutdown().then(() => process.exit(0)); };
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
  }

  // Attach shutdown handle for programmatic access
  (server as Server & { shutdown: typeof shutdown }).shutdown = shutdown;

  return server;
}
