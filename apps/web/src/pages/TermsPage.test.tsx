/**
 * @vitest-environment happy-dom
 */

// The Terms had no test at all, which is how §4.3 drifted into promising
// something the product never intended. The one-time-charge language was
// written to describe a client-side limitation (paid-client sends
// mode:"payment"), not a product decision, and it hardened into a contract
// term that then blocked the actual plan.
//
// These pin the parts that are legally load-bearing — the disclosure, the
// notice period, and the grandfathering promise — not the prose around them.
// They assert what a customer is entitled to rely on, so rewording is free but
// silently dropping a promise is not.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TermsPage } from "./TermsPage.tsx";

afterEach(() => cleanup());

const body = () => document.body.textContent ?? "";

describe("TermsPage — recurring billing disclosure (§4.3)", () => {
  it("discloses that paid tiers become recurring subscriptions, with the interval named", () => {
    render(<TermsPage />);
    expect(screen.getByText(/paid tiers become recurring subscriptions/i)).toBeTruthy();
    // A subscription term is only meaningful if the customer knows the cadence.
    expect(body()).toMatch(/renews automatically/i);
    expect(body()).toMatch(/monthly plans renew every month, annual plans\s+every year/i);
  });

  it("states the change is dated, not immediate — §11 promises 14 days' notice", () => {
    render(<TermsPage />);
    // Published 2026-07-28, in force 2026-08-15. The date must appear in the
    // billing section itself, not only in a changelog a reader would not open.
    expect(body()).toMatch(/Change effective August 15, 2026/i);
    expect(body()).toMatch(/advance notice of this\s+change under Section 11/i);
  });

  it("still describes the one-time terms that are in force until then", () => {
    // Until the effective date, billing IS one-time — the page must keep saying
    // so. Deleting this on the day the notice is published would misdescribe
    // what a customer buying today actually gets.
    render(<TermsPage />);
    expect(body()).toMatch(/Until August 15, 2026/i);
    expect(body()).toMatch(/single,\s+one-time charge/i);
  });

  it("promises that pre-existing one-time purchases are never converted or re-charged", () => {
    // The strongest promise on the page, and the one most likely to be lost in
    // a later edit: we hold no payment method for those buyers and cannot
    // charge one, so this is a statement of fact as much as of policy.
    render(<TermsPage />);
    expect(body()).toMatch(/are not converted/i);
    expect(body()).toMatch(/will not be charged again/i);
    expect(body()).toMatch(/hold no payment method for those purchases/i);
  });

  it("tells subscribers how cancellation and a failed payment behave", () => {
    render(<TermsPage />);
    expect(body()).toMatch(/cancel at any time/i);
    expect(body()).toMatch(/remains\s+active through the end of the period/i);
    // Matches the webhook handler's deliberate no-op on subscription.payment_failed.
    expect(body()).toMatch(/failed payment\s+does not immediately downgrade you/i);
  });
});
