/**
 * @vitest-environment happy-dom
 */

// H5.1b(f) — AdminPage's remaining WO-F4 primitives migration: its 6 tables
// had no TableWrap (no keyboard-scrollable region) and no empty-state guard
// (a fresh account with zero accounts/activity/etc. silently rendered a
// header-only table with no explanatory text) — the exact anti-pattern the
// audit flagged, matching what every sibling admin/account page already
// does correctly.

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    "/v1/admin/rest-usage": {
      since: "2026-01-01", window_days: 30, total_runs: 0, unique_accounts: 0,
      by_program: {}, top_accounts_by_program: [], by_endpoint: {},
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

describe("AdminPage — REST Usage panel", () => {
  it("shows honest empty messages for program runs, endpoint calls, and top accounts", async () => {
    stubAdminFetch(emptyAdminResponses());
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("REST Usage")).toBeTruthy());
    // "No program runs in this window." is shared copy across two independent
    // empty tables (Runs by Program from by_program, Top Accounts by Program
    // from top_accounts_by_program) — both real, both expected.
    expect(screen.getAllByText("No program runs in this window.")).toHaveLength(2);
    expect(screen.getByText("No REST calls in this window.")).toBeTruthy();
  });

  it("renders real by_program, by_endpoint, and top_accounts_by_program rows", async () => {
    const responses = emptyAdminResponses();
    responses["/v1/admin/rest-usage"] = {
      since: "2026-01-01", window_days: 30, total_runs: 12, unique_accounts: 3,
      by_program: { closer: 7, debug: 5 },
      top_accounts_by_program: [{ account_id: "acct_deadbeef1234", program: "closer", runs: 7 }],
      by_endpoint: { "/v1/account/seats": 4 },
    };
    stubAdminFetch(responses);
    render(<AdminPage />);

    // "closer" legitimately appears twice by design — once in "Runs by
    // Program" (from by_program) and once in "Top Accounts by Program"
    // (from top_accounts_by_program) — a real account's usage naturally
    // shows up in both breakdowns, so this asserts the count, not just presence.
    await waitFor(() => expect(screen.getAllByText("closer")).toHaveLength(2));
    expect(screen.getByText("debug")).toBeTruthy();
    expect(screen.getByText("/v1/account/seats")).toBeTruthy();
    expect(screen.getByText("acct_dea...")).toBeTruthy(); // account_id.slice(0, 8) === "acct_dea"
  });
});

describe("AdminPage — locked state (owner admin-key unlock)", () => {
  function stub403ThenUnlock() {
    let unlocked = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/admin/session") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { admin_key?: string };
        if (body.admin_key === "correct-key") {
          unlocked = true;
          return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}", headers: { get: () => null } } as unknown as Response;
        }
        return { ok: false, status: 403, json: async () => ({ error: "Invalid admin key" }), text: async () => JSON.stringify({ error: "Invalid admin key" }), headers: { get: () => null } } as unknown as Response;
      }
      if (!unlocked) {
        return { ok: false, status: 403, json: async () => ({ error: "forbidden" }), text: async () => JSON.stringify({ error: "forbidden" }), headers: { get: () => null } } as unknown as Response;
      }
      const responses = emptyAdminResponses();
      const hit = Object.entries(responses).find(([match]) => url.includes(match));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    }));
  }

  it("shows a key-entry form instead of a dead-end error on a 403", async () => {
    stub403ThenUnlock();
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByLabelText("Admin key")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Unlock" })).toBeTruthy();
  });

  it("submitting the correct key unlocks the dashboard and calls onUnlocked", async () => {
    stub403ThenUnlock();
    const onUnlocked = vi.fn();
    render(<AdminPage onUnlocked={onUnlocked} />);

    await waitFor(() => expect(screen.getByLabelText("Admin key")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Admin key"), { target: { value: "correct-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(screen.getByText("Admin Analytics")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Total Accounts")).toBeTruthy());
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it("submitting the wrong key shows an inline error and does not call onUnlocked", async () => {
    stub403ThenUnlock();
    const onUnlocked = vi.fn();
    render(<AdminPage onUnlocked={onUnlocked} />);

    await waitFor(() => expect(screen.getByLabelText("Admin key")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Admin key"), { target: { value: "wrong-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(screen.getByText("Invalid admin key.")).toBeTruthy());
    expect(onUnlocked).not.toHaveBeenCalled();
    // Still locked — the form is still there, not the dashboard.
    expect(screen.getByLabelText("Admin key")).toBeTruthy();
  });
});

// H-Phase-A cycle 10: "Settled MRR (live)"/"Estimated MRR", both rendered as
// "$X/mo", asserted a predictable RECURRING revenue stream that doesn't
// exist — PAI'D (the only live checkout rail) is one-time-charge only, so
// no paying account is ever billed again without manually repurchasing.
// Relabeled away from "MRR" entirely and made the disclaimer say so
// explicitly, rather than only explaining the arithmetic.
describe("AdminPage — honest revenue labeling (not fabricated recurring revenue)", () => {
  it("does not call either revenue figure MRR, and discloses PAI'D has no recurring billing", async () => {
    const responses = emptyAdminResponses();
    const revenue = responses["/v1/admin/revenue"] as Record<string, unknown>;
    revenue.revenue = {
      ...(revenue.revenue as Record<string, unknown>),
      estimated_mrr_cents: 9900, settled_mrr_cents: 5000,
      mrr_basis_cents: { starter: 2900, pro: 9900, suite: 29900 },
    };
    stubAdminFetch(responses);
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("Settled revenue (30d)")).toBeTruthy());
    expect(screen.getByText("Estimated monthly revenue")).toBeTruthy();
    expect(screen.queryByText(/MRR/)).toBeNull();
    expect(screen.getByText(/PAI'D.*one-time-charge only/)).toBeTruthy();
    expect(screen.getByText(/not a forecast of next month's collections/)).toBeTruthy();
  });
});

// H-Phase-A cycle 8: loadAdminData is triggered both on mount AND by the
// Refresh button, sharing the exact dual-trigger shape MyAnalyticsPage.tsx's
// load() had (cycle 6) before its requestId guard — with no guard here, an
// OLDER in-flight request's response landing after a newer one would
// silently overwrite it. The real app (main.tsx) mounts under <StrictMode>,
// which double-invokes a mount effect with no cleanup exactly once in
// development — a genuinely reachable trigger for two overlapping
// loadAdminData() calls on the same instance, unlike attempting this via
// the Refresh button (which is unreachable mid-load here: AdminPage swaps
// its ENTIRE tree for a bare loading skeleton, hiding the button, so a
// second click can never race the first).
describe("AdminPage — stale-response race guard", () => {
  it("shows the NEWER load's data even when an older (StrictMode double-invoked) request resolves after it", async () => {
    const responses = emptyAdminResponses();
    let revenueCallCount = 0;
    let resolveFirstRevenue!: (v: Response) => void;
    const firstPending = new Promise<Response>((resolve) => { resolveFirstRevenue = resolve; });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/admin/revenue")) {
        revenueCallCount++;
        if (revenueCallCount === 1) return firstPending; // StrictMode's first (discarded) effect invocation
        const newer = { ...(responses["/v1/admin/revenue"] as Record<string, unknown>) };
        (newer.accounts as Record<string, unknown>).paid = 999;
        return { ok: true, status: 200, json: async () => newer, text: async () => JSON.stringify(newer), headers: { get: () => null } } as unknown as Response;
      }
      const hit = Object.entries(responses).find(([match]) => url.includes(match));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    }));

    render(<StrictMode><AdminPage /></StrictMode>);

    await waitFor(() => expect(screen.getByText("999")).toBeTruthy());

    // Release the STALE first (StrictMode-discarded) request — it must be
    // ignored, not overwrite the already-displayed newer 999 value.
    const stale = { ...(responses["/v1/admin/revenue"] as Record<string, unknown>) };
    (stale.accounts as Record<string, unknown>).paid = 111;
    resolveFirstRevenue({ ok: true, status: 200, json: async () => stale, text: async () => JSON.stringify(stale), headers: { get: () => null } } as unknown as Response);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("111")).toBeNull();
    expect(screen.getByText("999")).toBeTruthy();
  });
});
