/**
 * @vitest-environment happy-dom
 */

// H5.2 — mobile pass: MyAnalyticsPage's 3 tables had no TableWrap (no keyboard-
// scrollable region on a narrow viewport), unlike every sibling account/billing
// page (AdminPage, UsagePage, SettingsPage) which already wraps its tables.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MyAnalyticsPage } from "./MyAnalyticsPage.tsx";

function analyticsBody(totalCalls: number) {
  return {
    account_id: "acct_1",
    tier: "free",
    since: "2026-06-01",
    programs: [],
    api_calls: {
      account_id: "acct_1",
      since: "2026-06-01",
      total_calls: totalCalls,
      calls_last_24h: 0,
      calls_last_7d: 0,
      by_endpoint: [],
      by_status: [],
    },
    totals: { runs: 0, generators: 0, input_files: 0, input_bytes: 0, api_calls: totalCalls },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
}

function stubAnalyticsFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => {
    const body = {
      account_id: "acct_1",
      tier: "free",
      since: "2026-06-01",
      programs: [
        { program: "theme", total_runs: 4, total_generators: 6, total_input_files: 3, total_input_bytes: 1024 },
      ],
      api_calls: {
        account_id: "acct_1",
        since: "2026-06-01",
        total_calls: 10,
        calls_last_24h: 2,
        calls_last_7d: 8,
        by_endpoint: [
          { method: "POST", path: "/v1/theme/generate", calls: 5, last_called_at: "2026-07-01T00:00:00Z" },
        ],
        by_status: [{ status_bucket: "2xx", calls: 10 }],
      },
      totals: { runs: 4, generators: 6, input_files: 3, input_bytes: 1024, api_calls: 10 },
    };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("MyAnalyticsPage — TableWrap on all 3 tables (H5.2)", () => {
  it("wraps Programs Used, API Status Mix, and All API Calls By Endpoint in keyboard-reachable regions", async () => {
    stubAnalyticsFetch();
    render(<MyAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("theme")).toBeTruthy());

    const regions = screen.getAllByRole("region");
    const labels = regions.map((r) => r.getAttribute("aria-label")).sort();
    expect(labels).toEqual(["API status mix", "All API calls by endpoint", "Programs used"].sort());

    for (const region of regions) {
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.querySelector("table")).toBeTruthy();
    }
  });
});

// H-Phase-A cycle 6: load() is shared by the days-change effect and the
// Refresh button, with no guard against an OLDER in-flight request's
// response landing after a NEWER one and overwriting it — the older
// response's total_calls would then be shown under the newer selection.
describe("MyAnalyticsPage — stale-response race guard", () => {
  it("shows the LATEST window's data even when an older request resolves after it", async () => {
    let resolveFirst!: (v: Response) => void;
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // First load (mount, 30 days) never resolves until released below —
        // simulates it landing AFTER the second request.
        return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      }
      // Second load (7 days) resolves immediately, "winning" the race.
      return jsonResponse(analyticsBody(999));
    }));

    render(<MyAnalyticsPage />);
    // The select is disabled while the first (mount) request is in flight —
    // this is the real UI guard the fix's reachability analysis relies on;
    // fireEvent bypasses it here specifically to prove the requestId guard
    // is a real, independent second layer of defense, not the only one.
    fireEvent.change(screen.getByLabelText("Window"), { target: { value: "7" } });

    await waitFor(() => expect(screen.getByText("999")).toBeTruthy());

    // Now let the STALE first request resolve — it must be discarded, not
    // overwrite the already-displayed, newer 7-day result.
    resolveFirst(jsonResponse(analyticsBody(111)));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("111")).toBeNull();
    expect(screen.getByText("999")).toBeTruthy();
  });
});
