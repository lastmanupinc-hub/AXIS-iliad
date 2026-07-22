/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 9 (owner-directed follow-up after the cycle 7 PAI'D
// cancellation-gap investigation): PAI'D's checkout only supports
// mode: "payment" — a single one-time charge. There is no recurring
// billing, no stored payment method, and nothing to "cancel." This page's
// own point-of-purchase disclosure said "Cancel any time" (the same false
// claim PlansPage.test.tsx already guards against), missed by cycle 7's
// sweep because it lives on a different page.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PaidCheckoutPage } from "./PaidCheckoutPage.tsx";

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
  sessionStorage.clear();
  localStorage.clear();
});

describe("PaidCheckoutPage — cancellation honesty", () => {
  it("does not claim 'cancel any time' at the point of purchase", async () => {
    stubFetch([["/portal/api/paid/config", { configured: true }]]);
    render(<PaidCheckoutPage />);

    await waitFor(() => expect(screen.getByText("Continue to checkout")).toBeTruthy());
    expect(screen.queryByText(/Cancel any time/)).toBeNull();
    expect(screen.getByText(/one-time charge for your selected plan/)).toBeTruthy();
  });
});

describe("PaidCheckoutPage — loading state accessibility (Cycle 26)", () => {
  it("announces the initial 'checking subscription availability' state to screen readers", async () => {
    // Every other loading indicator in this app (StatusPage, ChangelogPage,
    // CommercePage, ToolPage since cycle 21) uses role="status"
    // aria-live="polite" — this was the one page missing it, so a
    // screen-reader user heard nothing while the availability check ran.
    stubFetch([["/portal/api/paid/config", { configured: true }]]);
    render(<PaidCheckoutPage />);

    const status = screen.getByText(/Checking subscription availability/).closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");

    // Let the stubbed fetch resolve so the test doesn't leak a pending timer/act warning.
    await waitFor(() => expect(screen.getByText("Continue to checkout")).toBeTruthy());
  });
});
