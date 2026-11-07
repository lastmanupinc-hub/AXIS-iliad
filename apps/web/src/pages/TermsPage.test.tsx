/**
 * @vitest-environment happy-dom
 */

// The Terms had no test at all, which is how §4.3 drifted into announcing a
// change the product never made: an edition published 2026-07-28 said paid
// tiers would become recurring subscriptions from 2026-08-15, while the billing
// code kept charging once (mode:"payment", no payment method stored). The owner
// settled it on 2026-11-05: the terms say what billing does. A plan is charged
// once, and the announcement is withdrawn on the page itself, dated, so a
// customer who read the old edition can see what became of it.
//
// These pin the parts that are legally load-bearing — the one-time charge, the
// absence of a stored payment method, the withdrawal and its grandfathering
// promise, and the absence of any renewal language — not the prose around
// them. Rewording is free; silently dropping a promise, or bringing "renews
// automatically" back, is not (AXIS Launch taskgate T200 reads the live page).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TermsPage } from "./TermsPage.tsx";

afterEach(() => cleanup());

const body = () => document.body.textContent ?? "";

describe("TermsPage — billing (§4.3) says what the billing code does", () => {
  it("states that a paid tier is a single, one-time charge that is never charged again", () => {
    render(<TermsPage />);
    expect(body()).toMatch(/single,\s+one-time charge/i);
    expect(body()).toMatch(/charged once/i);
    expect(body()).toMatch(/never\s+charge you again/i);
    expect(body()).toMatch(/remain in place indefinitely/i);
  });

  it("states that no payment method is stored", () => {
    render(<TermsPage />);
    expect(body()).toMatch(/we do not store your payment method/i);
  });

  it("withdraws the recurring billing announced for August 15, 2026, dated, and keeps the grandfathering promise", () => {
    render(<TermsPage />);
    expect(screen.getByText(/recurring billing announced for\s+August 15, 2026\s+was withdrawn/i)).toBeTruthy();
    expect(body()).toMatch(/Note, November 6, 2026/);
    expect(body()).toMatch(/That change was never made/i);
    expect(body()).toMatch(/are not converted/i);
    expect(body()).toMatch(/will not be charged again/i);
    expect(body()).toMatch(/hold no payment method for those purchases/i);
  });

  it("promises 14 days' notice under Section 11 before billing could ever become recurring", () => {
    render(<TermsPage />);
    expect(body()).toMatch(/under Section 11 at least 14 days\s+before it takes effect/i);
  });

  it("says nowhere that a plan renews (the live-page check's own words)", () => {
    render(<TermsPage />);
    // The same pattern AXIS Launch's taskgate T200 reads the live /terms with.
    expect(body()).not.toMatch(/renew(s|ed)? automatically|automatic(ally)? renew|auto-renew/i);
    expect(body()).not.toMatch(/tiers become recurring subscriptions/i);
    expect(body()).not.toMatch(/cancelling a subscription/i);
  });
});
