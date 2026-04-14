import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// ─── Mock router.js to control isShuttingDown ───────────────────
vi.mock("./router.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./router.js")>();
  return { ...orig, isShuttingDown: vi.fn(() => false) };
});

// ─── Mock @axis/snapshots to prevent real DB access on import ───
vi.mock("@axis/snapshots", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@axis/snapshots")>();
  return { ...orig, openMemoryDb: vi.fn(), closeDb: vi.fn() };
});

import { handleHealthCheck } from "./handlers.js";
import { isShuttingDown } from "./router.js";

// ─── Minimal res/req stubs ──────────────────────────────────────
function stubReq(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

function stubRes(): ServerResponse & { _status: number; _body: string } {
  const res: Record<string, unknown> = {
    _status: 0,
    _body: "",
    _headers: {} as Record<string, string>,
    writeHead(status: number) { res._status = status; return res; },
    setHeader(k: string, v: string) { (res._headers as Record<string, string>)[k] = v; },
    end(body?: string) { res._body = body ?? ""; },
    getHeader() { return undefined; },
  };
  return res as unknown as ServerResponse & { _status: number; _body: string };
}

// ─── Tests ──────────────────────────────────────────────────────
describe("handleHealthCheck shutdown path", () => {
  beforeEach(() => {
    vi.mocked(isShuttingDown).mockReturnValue(false);
  });

  it("returns 200 with ok when not shutting down", async () => {
    vi.mocked(isShuttingDown).mockReturnValue(false);
    const res = stubRes();
    await handleHealthCheck(stubReq(), res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(data.status).toBe("ok");
    expect(data.service).toBe("axis-api");
    expect(data.version).toBeDefined();
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 503 with shutting_down when isShuttingDown is true", async () => {
    vi.mocked(isShuttingDown).mockReturnValue(true);
    const res = stubRes();
    await handleHealthCheck(stubReq(), res);
    expect(res._status).toBe(503);
    const data = JSON.parse(res._body);
    expect(data.status).toBe("shutting_down");
    expect(data.service).toBe("axis-api");
    expect(data.version).toBeDefined();
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
