import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// Mock dependencies before importing the module under test
vi.mock("@axis/snapshots", () => ({
  pgIntegrityCheck: vi.fn(),
  getPgDbStats: vi.fn(),
  getDb: vi.fn(() => ({})),
  openMemoryDb: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock("./router.js", () => ({
  isShuttingDown: vi.fn(),
  Router: vi.fn(),
  createApp: vi.fn(),
}));

import { handleReadiness, handleMetrics } from "./metrics.js";
import { pgIntegrityCheck, getPgDbStats } from "@axis/snapshots";
import { isShuttingDown } from "./router.js";

function mockRes(): ServerResponse & { _status: number; _body: string } {
  const res: any = {
    _status: 0,
    _body: "",
    writeHead(status: number, _headers: Record<string, string>): void {
      res._status = status;
    },
    end(body?: string): void {
      res._body = body ?? "";
    },
  };
  return res;
}

const mockReq = {} as IncomingMessage;

describe("handleReadiness – not-ready branches", () => {
  beforeEach(() => {
    vi.mocked(isShuttingDown).mockReturnValue(false);
    vi.mocked(pgIntegrityCheck).mockResolvedValue({ action: "integrity_check", success: true, details: {} });
  });

  it("returns 503 when shutting down", async () => {
    vi.mocked(isShuttingDown).mockReturnValue(true);
    const res = mockRes();
    await handleReadiness(mockReq, res);
    expect(res._status).toBe(503);
    const data = JSON.parse(res._body);
    expect(data.status).toBe("not_ready");
    expect(data.checks.shutting_down).toBe(true);
  });

  it("returns 503 when integrity check fails", async () => {
    vi.mocked(pgIntegrityCheck).mockResolvedValue({ action: "integrity_check", success: false, details: {} });
    const res = mockRes();
    await handleReadiness(mockReq, res);
    expect(res._status).toBe(503);
    const data = JSON.parse(res._body);
    expect(data.status).toBe("not_ready");
    expect(data.checks.database).toBe("error");
  });
});

describe("handleMetrics – dbStats failure branch", () => {
  it("omits DB metrics when getDbStats fails", async () => {
    vi.mocked(isShuttingDown).mockReturnValue(false);
    vi.mocked(getPgDbStats).mockResolvedValue({ action: "stats", success: false, details: {} });
    const res = mockRes();
    await handleMetrics(mockReq, res);
    expect(res._status).toBe(200);
    expect(res._body).toContain("axis_uptime_seconds");
    expect(res._body).toContain("axis_memory_rss_bytes");
    expect(res._body).not.toContain("axis_db_size_bytes");
    expect(res._body).not.toContain("axis_db_table_rows");
  });
});
