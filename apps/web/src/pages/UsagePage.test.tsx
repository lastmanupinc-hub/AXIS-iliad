/**
 * @vitest-environment happy-dom
 */

// WO-P10 — Usage & Billing: the billing/usage half split off AccountPage
// (subscription, credits, per-program usage — moved verbatim) plus what's
// new here: usage graphs (GET /v1/account/usage/timeseries, WO-A3) and a
// tier-change proration preview (GET /v1/billing/proration). App-level
// routing/auth-gate lives in app-routing.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UsagePage } from "./UsagePage.tsx";

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

const ACCOUNT = { account_id: "acct_1", name: "Ada", email: "ada@example.com", tier: "free" as const, created_at: "2026-01-01T00:00:00Z" };
const QUOTA = { rate_limit: {}, authenticated: true, resource_quota: { tier: "free", snapshots_this_month: 5, max_snapshots_per_month: 10, project_count: 2, max_projects: 3, max_files_per_snapshot: 100 } };
// monthly_snapshots (rendered by the StatTile below) comes from getUsage()'s
// totals.runs, NOT getQuota()'s snapshots_this_month — kept equal here (5) so
// the two independently-fetched fixtures don't silently disagree.
const USAGE = { tier: "free", totals: { runs: 5 }, programs: [{ program: "search", total_runs: 5, total_generators: 12, total_input_files: 20 }] };
const TIMESERIES = { buckets: [{ date: "2026-07-01", runs: 2, by_program: {}, credits_spent: 100 }, { date: "2026-07-02", runs: 3, by_program: {}, credits_spent: 150 }] };

/** Default handler set — a signed-in free-tier account with no active
 *  subscription/credits, matching most tests' baseline. */
function baseHandlers(overrides: Array<[match: string, body: unknown, status?: number]> = []) {
  return [
    ...overrides,
    ["/v1/account/quota", QUOTA],
    ["/v1/account/usage/timeseries", TIMESERIES],
    ["/v1/account/usage", USAGE],
    ["/v1/account/subscription", {}, 404],
    ["/v1/account/credits", {}, 404],
    ["/v1/account", ACCOUNT],
  ] as Array<[match: string, body: unknown, status?: number]>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UsagePage — loading & core stats", () => {
  it("renders tier, usage stats, and the runs-per-day graph", async () => {
    stubFetch(baseHandlers());
    render(<UsagePage />);

    // "Free" legitimately appears twice: the tier badge and the "You're on
    // the Free tier" sentence.
    await waitFor(() => expect(screen.getAllByText("Free").length).toBe(2));
    expect(screen.getByText("search")).toBeTruthy();
    // "5" legitimately appears twice: the snapshots-this-month StatTile and
    // the per-program table's Runs cell (both fixtures use 5 deliberately).
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Runs per day (30d)")).toBeTruthy();
  });

  it("shows an honest error Callout when the initial load fails", async () => {
    stubFetch([["/v1/account", { error: "boom" }, 500]]);
    render(<UsagePage />);

    expect(await screen.findByText("Couldn't load your usage & billing")).toBeTruthy();
  });

  it("free tier shows the upgrade-to-Starter banner; clicking it routes to paid checkout when PAI'D is configured", async () => {
    stubFetch(baseHandlers([["/portal/api/paid/config", { configured: true }]]));
    render(<UsagePage />);

    const upgradeBtn = await screen.findByRole("button", { name: "Upgrade to Starter" });
    fireEvent.click(upgradeBtn);

    await waitFor(() => expect(window.location.hash).toBe("#paid-checkout"));
  });
});

// ─── Pro vs Starter labeling (H-Phase-A cycle 2) ──────────────────
//
// Starter and Pro both show as tier==="paid" — before this fix, every Pro
// subscriber saw themselves labeled "Starter" on their own billing page,
// even though the backend (usage_credits.plan_id, fixed in cycle 1) already
// knew the real plan. Built as a standalone handler list (not baseHandlers +
// an override) since stubFetch's match-by-substring means an "/v1/account"
// override would also swallow "/v1/account/quota" etc. if it ran first.
describe("UsagePage — Pro vs Starter labeling", () => {
  it("a Pro subscriber is labeled 'Pro', not 'Starter'", async () => {
    stubFetch([
      ["/v1/account/quota", { rate_limit: {}, authenticated: true, resource_quota: { tier: "paid", snapshots_this_month: 5, max_snapshots_per_month: 200, project_count: 2, max_projects: 20, max_files_per_snapshot: 1000 } }],
      ["/v1/account/usage/timeseries", TIMESERIES],
      ["/v1/account/usage", { ...USAGE, tier: "paid" }],
      ["/v1/account/subscription", {}, 404],
      ["/v1/account/credits", {}, 404],
      ["/v1/account", {
        account: { ...ACCOUNT, tier: "paid" as const },
        usage_credits: { plan_id: "pro", month_key: "2026-07", monthly_allowance: 300_000, included_credits_used: 0, included_credits_remaining: 300_000, overage_credits_this_month: 0 },
      }],
    ]);
    render(<UsagePage />);

    await waitFor(() => expect(screen.getAllByText("Pro").length).toBeGreaterThan(0));
    expect(screen.queryByText("Starter")).toBeNull();
  });

  it("a Starter subscriber (no distinguishing plan_id) is still labeled 'Starter' (unchanged default)", async () => {
    stubFetch([
      ["/v1/account/quota", { rate_limit: {}, authenticated: true, resource_quota: { tier: "paid", snapshots_this_month: 5, max_snapshots_per_month: 200, project_count: 2, max_projects: 20, max_files_per_snapshot: 1000 } }],
      ["/v1/account/usage/timeseries", TIMESERIES],
      ["/v1/account/usage", { ...USAGE, tier: "paid" }],
      ["/v1/account/subscription", {}, 404],
      ["/v1/account/credits", {}, 404],
      ["/v1/account", {
        account: { ...ACCOUNT, tier: "paid" as const },
        usage_credits: { plan_id: "starter", month_key: "2026-07", monthly_allowance: 75_000, included_credits_used: 0, included_credits_remaining: 75_000, overage_credits_this_month: 0 },
      }],
    ]);
    render(<UsagePage />);

    await waitFor(() => expect(screen.getAllByText("Starter").length).toBeGreaterThan(0));
    expect(screen.queryByText("Pro")).toBeNull();
  });
});

describe("UsagePage — proration preview", () => {
  it("selecting a target tier fetches and displays the proration preview", async () => {
    stubFetch(baseHandlers([
      ["/v1/billing/proration", { current_tier: "free", target_tier: "paid", from_tier: "free", to_tier: "paid", days_remaining_in_period: 20, days_in_period: 30, proration_amount: 1900, direction: "upgrade" }],
    ]));
    render(<UsagePage />);

    await waitFor(() => expect(screen.getByLabelText("Preview a plan change")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Preview a plan change"), { target: { value: "paid" } });

    await waitFor(() => expect(screen.getByText(/Additional charge/)).toBeTruthy());
    expect(screen.getByText(/\$19\.00/)).toBeTruthy();
  });
});

describe("UsagePage — subscription & credits", () => {
  it("an active subscription renders status/renewal and a cancel button", async () => {
    stubFetch(baseHandlers([
      ["/v1/account/subscription", {
        account_id: "acct_1", tier: "paid", has_active_subscription: true, subscription_count: 1,
        active_subscription: { subscription_id: "sub_1", status: "active", current_period_end: "2026-08-01T00:00:00Z", card_brand: "visa", card_last_four: "4242", cancel_at: null },
      }],
    ]));
    render(<UsagePage />);

    await waitFor(() => expect(screen.getByText("Subscription")).toBeTruthy());
    expect(screen.getByText("active")).toBeTruthy();
    expect(screen.getByText("visa ····4242")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel Subscription" })).toBeTruthy();
  });

  it("credit packs render and a top-up click calls the PAI'D topup endpoint, showing a busy label while redirecting", async () => {
    let resolveTopup!: () => void;
    const topupPromise = new Promise<void>((resolve) => { resolveTopup = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/credits/topup")) {
        await topupPromise;
        const body = { checkout_url: "https://paid.example/session/abc", session_id: "s1", pack_id: "pack_1", credits: 1000, price_cents: 500 };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers([
        ["/v1/account/credits", { account_id: "acct_1", tier: "free", balance: 42, credit_costs: {}, credit_packs: [{ pack_id: "pack_1", credits: 1000, price_cents: 500 }], ledger: [] }],
      ]);
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      const status = hit?.[2] ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<UsagePage />);

    const topupBtn = await screen.findByRole("button", { name: "1,000 credits — $5" });
    fireEvent.click(topupBtn);

    await waitFor(() => expect(screen.getByRole("button", { name: "Redirecting…" })).toBeTruthy());
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes("/v1/credits/topup"))).toBe(true);
    resolveTopup();
  });
});
