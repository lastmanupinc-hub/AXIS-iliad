/**
 * @vitest-environment happy-dom
 */

// WO-P17 — Status: live health/liveness/readiness probes (timed client-side,
// not canned numbers), subsystem checks, and a session-local ticker. Honesty
// H4: no incident history, no uptime percentage — nothing here claims data
// this app doesn't actually store. T24 (AXIS Launch taskgate, 2026-10-13): no
// usage numbers either — the page says whether Iliad is up, never how often
// it is used, so the call-volume card is gone.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusPage } from "./StatusPage.tsx";

function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const HEALTHY: Array<[string, unknown, number?]> = [
  ["/v1/health/ready", { status: "ready", checks: { shutting_down: false, database: "ok", payment_rail: "test" } }],
  ["/v1/health/live", { status: "alive" }],
  ["/v1/health", { status: "ok", version: "0.5.3" }],
  // Served with counts on purpose: the page must neither ask for nor show them.
  ["/v1/stats", { mcp_calls_today: 42, mcp_calls_total: 1234, top_tools: [{ tool: "analyze_repo", count: 7 }], process_started_at: "2026-01-01T00:00:00Z", date: "2026-07-12" }],
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StatusPage — healthy state", () => {
  it("shows all three probes up with real (non-zero-guaranteed) timed latencies", async () => {
    stubFetch(HEALTHY);
    render(<StatusPage />);

    await screen.findByText("All systems operational");
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.getByText("Liveness")).toBeTruthy();
    expect(screen.getByText("Readiness")).toBeTruthy();
    // Each tile reports an "Nms" latency once resolved, not a hardcoded string.
    expect(screen.getAllByText(/^\d+ms$/).length).toBe(3);
  });

  it("shows the live version from the health probe", async () => {
    stubFetch(HEALTHY);
    render(<StatusPage />);

    await screen.findByText("v0.5.3");
  });

  it("shows the database check with a status dot and the payment rail as plain informational text (no ok/error judgment)", async () => {
    stubFetch(HEALTHY);
    render(<StatusPage />);

    await screen.findByText("Database");
    expect(screen.getByText("ok")).toBeTruthy();
    expect(screen.getByText("test")).toBeTruthy();
    expect(screen.getByText("Payment rail")).toBeTruthy();
  });

  it("shows no usage numbers and never requests GET /v1/stats", async () => {
    const fetchFn = stubFetch(HEALTHY);
    const { container } = render(<StatusPage />);

    await screen.findByText("All systems operational");
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/v1/stats"))).toBe(false);
    const text = container.textContent ?? "";
    for (const gone of ["MCP calls", "Activity", "call stats", "1,234", "analyze_repo"]) {
      expect(text).not.toContain(gone);
    }
    expect(screen.queryByText("42")).toBeNull();
  });

  it("never claims incident history or an uptime percentage", async () => {
    stubFetch(HEALTHY);
    render(<StatusPage />);

    await screen.findByText("All systems operational");
    expect(screen.getByText(/doesn't store incident history/)).toBeTruthy();
    expect(screen.queryByText(/uptime %/)).toBeNull();
    expect(screen.queryByText(/%\s*uptime/i)).toBeNull();
  });
});

describe("StatusPage — degraded state", () => {
  it("shows Degraded when the readiness probe fails, without hiding the other two", async () => {
    stubFetch([
      ["/v1/health/ready", { status: "not_ready", checks: { shutting_down: false, database: "error", payment_rail: "absent" } }, 503],
      ["/v1/health/live", { status: "alive" }],
      ["/v1/health", { status: "ok", version: "0.5.3" }],
    ]);
    render(<StatusPage />);

    await screen.findByText("Degraded");
    expect(screen.getByText("error")).toBeTruthy();
  });
});

describe("StatusPage — session ticker", () => {
  it("counts up from when the page opened, independent of any server data", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    stubFetch(HEALTHY);
    render(<StatusPage />);

    expect(screen.getByText("0m 0s")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(65_000);
    expect(screen.getByText("1m 5s")).toBeTruthy();

    vi.useRealTimers();
  });
});
