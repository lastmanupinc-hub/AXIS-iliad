/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 7: PAI'D is the only live checkout path and has no
// cancel/modify API — starting a new checkout while already on a paid plan
// creates a SECOND, separate subscription rather than replacing the first.
// The page used to say "Cancel any time" (false — no self-serve cancel
// exists at all) and gave no warning before a plan-switch checkout could
// double-bill an existing subscriber.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PlansPage } from "./PlansPage.tsx";

const PLANS = {
  plans: [
    { id: "free", name: "Free", tagline: "Free tier", price_monthly_cents: 0, price_annual_cents: 0, highlights: [] },
    { id: "pro", name: "Pro", tagline: "Pro tier", price_monthly_cents: 9900, price_annual_cents: 95040, highlights: [] },
  ],
  features: [],
};

function stubFetch(handlers: Array<[match: string, body: unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlansPage — cancellation honesty", () => {
  it("does not claim 'cancel any time' next to a paid plan's checkout button", async () => {
    stubFetch([["/v1/plans", PLANS]]);
    render(<PlansPage loggedIn={false} onSelectPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText("Pro")).toBeTruthy());
    expect(screen.queryByText(/Cancel any time/)).toBeNull();
    expect(screen.getByText(/To cancel or change your plan, email support@jonathanarvay\.com/)).toBeTruthy();
  });

  it("warns a logged-in account already on a paid tier before it can start a second checkout", async () => {
    stubFetch([["/v1/plans", PLANS], ["/v1/account", { account: { account_id: "a1", name: "T", email: "t@x.com", tier: "paid", created_at: "2026-01-01" } }]]);
    render(<PlansPage loggedIn={true} onSelectPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText(/already on a paid plan/)).toBeTruthy());
    expect(screen.getByText(/starts a brand-new subscription/)).toBeTruthy();
  });

  it("shows no paid-plan warning for a free-tier account", async () => {
    stubFetch([["/v1/plans", PLANS], ["/v1/account", { account: { account_id: "a1", name: "T", email: "t@x.com", tier: "free", created_at: "2026-01-01" } }]]);
    render(<PlansPage loggedIn={true} onSelectPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText("Pro")).toBeTruthy());
    expect(screen.queryByText(/already on a paid plan/)).toBeNull();
  });
});
