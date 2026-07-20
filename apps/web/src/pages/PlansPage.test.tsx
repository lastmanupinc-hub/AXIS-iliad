/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 7: PAI'D is the only live checkout path and has no
// cancel/modify API — starting a new checkout while already on a paid plan
// creates a SECOND, separate one-time charge rather than replacing the
// first. The page used to say "Cancel any time" (false — no self-serve
// cancel exists at all) and gave no warning before a plan-switch checkout
// could double-bill an existing subscriber. H-Phase-A cycle 17: reworded
// "subscription" to "one-time charge" to match TermsPage.tsx's corrected
// framing (PAI'D never auto-renews).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlansPage } from "./PlansPage.tsx";

const PLANS = {
  plans: [
    { id: "free", name: "Free", tagline: "Free tier", price_monthly_cents: 0, price_annual_cents: 0, highlights: [] },
    { id: "pro", name: "Pro", tagline: "Pro tier", price_monthly_cents: 9900, price_annual_cents: 95040, highlights: [] },
  ],
  features: [],
};

const PLANS_TWO_PAID = {
  plans: [
    ...PLANS.plans,
    { id: "growth", name: "Growth", tagline: "Growth tier", price_monthly_cents: 29900, price_annual_cents: 287040, highlights: [] },
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

/** Fetch stub whose /portal/api/paid/config response stays pending until
 *  resolvers are invoked in call order — lets a test observe a
 *  cross-plan-click race against the underlying getPaidConfig() call. */
function stubDeferredPaidConfigFetch(handlers: Array<[match: string, body: unknown]>): { resolvers: Array<(body: unknown) => void> } {
  const resolvers: Array<(body: unknown) => void> = [];
  let callCount = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/portal/api/paid/config")) {
      const index = callCount++;
      const body = await new Promise((resolve) => { resolvers[index] = resolve; });
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    }
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
  }));
  return { resolvers };
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
    expect(screen.getByText(/brand-new, separate one-time charge/)).toBeTruthy();
  });

  it("shows no paid-plan warning for a free-tier account", async () => {
    stubFetch([["/v1/plans", PLANS], ["/v1/account", { account: { account_id: "a1", name: "T", email: "t@x.com", tier: "free", created_at: "2026-01-01" } }]]);
    render(<PlansPage loggedIn={true} onSelectPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText("Pro")).toBeTruthy());
    expect(screen.queryByText(/already on a paid plan/)).toBeNull();
  });
});

// H-Phase-A cycle 19: checkoutLoading is a single shared string, not per-plan
// state, and handlePlanSelect had no re-entrancy guard — clicking a SECOND
// plan button before the first's getPaidConfig() resolved overwrote
// checkoutLoading and started a second concurrent checkout. Whichever call's
// sessionStorage.setItem("axis_paid_plan", ...) landed LAST would win,
// which could check the user out for the WRONG plan relative to their
// actual final click.
describe("PlansPage — concurrent plan selection (H-Phase-A cycle 19)", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("clicking a second plan before the first's checkout resolves does not let the second click start a concurrent checkout", async () => {
    const { resolvers } = stubDeferredPaidConfigFetch([["/v1/plans", PLANS_TWO_PAID]]);
    render(<PlansPage loggedIn={true} onSelectPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText("Pro")).toBeTruthy());
    const proButton = screen.getByRole("button", { name: /Choose Pro/ });
    const growthButton = screen.getByRole("button", { name: /Choose Growth/ });

    fireEvent.click(proButton); // Pro's getPaidConfig() (call 0) now in flight
    await waitFor(() => expect(resolvers[0]).toBeTruthy());

    // Before the fix: growthButton was still enabled here (disabled only
    // checked `checkoutLoading === "growth"`), so this click would overwrite
    // checkoutLoading and start a second concurrent checkout for Growth.
    expect((growthButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(growthButton);
    // No second call was ever queued — proven by there being no second
    // resolver to invoke.
    expect(resolvers[1]).toBeUndefined();

    resolvers[0]({ configured: true });
    await waitFor(() => expect(sessionStorage.getItem("axis_paid_plan")).toBe("pro"));
  });
});
