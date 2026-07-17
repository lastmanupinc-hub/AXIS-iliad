/**
 * @vitest-environment happy-dom
 */

// H5.1b(f) — AdminPage's remaining WO-F4 primitives migration: its 6 tables
// had no TableWrap (no keyboard-scrollable region) and no empty-state guard
// (a fresh account with zero accounts/activity/etc. silently rendered a
// header-only table with no explanatory text) — the exact anti-pattern the
// audit flagged, matching what every sibling admin/account page already
// does correctly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPage.tsx";

function emptyAdminResponses(): Record<string, unknown> {
  return {
    "/v1/admin/stats": { total_accounts: 0, total_api_keys: 0, total_snapshots: 0, total_usage_records: 0, accounts_by_tier: {} },
    "/v1/admin/accounts": { accounts: [], total: 0, limit: 25, offset: 0 },
    "/v1/admin/activity": { events: [], count: 0 },
    "/v1/funnel/metrics": {
      metrics: {
        total_accounts: 0, total_seats: 0, conversion_rate: 0, activation_rate: 0,
        by_tier: {}, by_stage: {}, events_last_24h: 0, events_last_7d: 0,
      },
    },
    "/v1/admin/mcp-usage": {
      windows: { total: 0, last_24h: 0, last_7d: 0, last_30d: 0 },
      summary: { since: "2026-01-01", window_days: 30, total_calls: 0, unique_accounts: 0, anonymous_calls: 0, by_tool: {}, by_source: {}, by_probe_class: {} },
      new_vs_returning: { window_days: 30, new_accounts: 0, returning_accounts: 0 },
    },
    "/v1/admin/revenue": {
      generated_at: "2026-01-01",
      accounts: { total: 0, free: 0, paid: 0, suite: 0, new_24h: 0, new_7d: 0, new_30d: 0 },
      revenue: {
        estimated_mrr_cents: 0, mrr_basis_cents: { starter: 0, pro: 0, suite: 0 }, metered_overage_cents_this_month: 0,
        active_subscriptions: 0, settled_mrr_cents: 0, settled_revenue_cents_all_time: 0, revenue_by_tool: [],
        first_paid_call_at: null, paying_account_count: 0, payment_conversion_rate: 0,
      },
      funnel: { conversion_rate: 0, activation_rate: 0, by_stage: {} },
      mcp_engagement: { window_days: 30, total_calls: 0, unique_accounts: 0 },
    },
  };
}

function stubAdminFetch(responses: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(responses).find(([match]) => url.includes(match));
    return {
      ok: true,
      status: 200,
      json: async () => (hit ? hit[1] : {}),
      text: async () => JSON.stringify(hit ? hit[1] : {}),
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

describe("AdminPage — empty-state guards + TableWrap (H5.1b(f))", () => {
  it("shows an honest empty message in all 6 tables for a fresh install, instead of a silent header-only table", async () => {
    stubAdminFetch(emptyAdminResponses());
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("Admin Analytics")).toBeTruthy());

    // by_source AND by_tool share this text; accounts_by_tier AND Recent
    // Accounts share "No accounts yet." — both real, both expected twice.
    expect(screen.getAllByText("No MCP calls in this window.")).toHaveLength(2);
    expect(screen.getAllByText("No accounts yet.")).toHaveLength(2);
    expect(screen.getByText("No funnel events yet.")).toBeTruthy();
    expect(screen.getByText("No activity yet.")).toBeTruthy();
  });

  it("wraps every table in a keyboard-scrollable TableWrap region", async () => {
    stubAdminFetch(emptyAdminResponses());
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText("Admin Analytics")).toBeTruthy());

    const regions = screen.getAllByRole("region");
    expect(regions.length).toBeGreaterThanOrEqual(6);
    for (const region of regions) {
      expect(region.getAttribute("tabindex")).toBe("0");
    }
  });

  it("renders real rows instead of the empty message when data exists", async () => {
    // "No accounts yet." is shared copy across two independent tables (Accounts
    // by Tier from /admin/stats, Recent Accounts from /admin/accounts) — populate
    // both so the assertion isn't tripped by the other one still being empty.
    const responses = emptyAdminResponses();
    responses["/v1/admin/stats"] = { total_accounts: 1, total_api_keys: 1, total_snapshots: 0, total_usage_records: 0, accounts_by_tier: { paid: 1 } };
    responses["/v1/admin/accounts"] = {
      accounts: [{ account_id: "acct_1", name: "Ada", email: "ada@example.com", tier: "paid", created_at: "2026-01-01T00:00:00Z" }],
      total: 1, limit: 25, offset: 0,
    };
    stubAdminFetch(responses);
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("ada@example.com")).toBeTruthy());
    expect(screen.queryByText("No accounts yet.")).toBeNull();
  });
});
