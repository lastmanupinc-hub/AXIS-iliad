/**
 * @vitest-environment happy-dom
 */

// H5.2 — mobile pass: MyAnalyticsPage's 3 tables had no TableWrap (no keyboard-
// scrollable region on a narrow viewport), unlike every sibling account/billing
// page (AdminPage, UsagePage, SettingsPage) which already wraps its tables.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MyAnalyticsPage } from "./MyAnalyticsPage.tsx";

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
