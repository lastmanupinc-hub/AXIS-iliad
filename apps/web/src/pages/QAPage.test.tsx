/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 7: this page's "Can I cancel or downgrade?" answer
// falsely claimed self-serve plan changes work ("Change your plan at any
// time from the Usage page... you keep Pro access until then") — no
// self-serve cancel/downgrade path exists anywhere in this codebase (PAI'D
// never writes stripe_subscriptions, the only table GET/POST
// /v1/account/subscription reads from), and the sanctioned "switch plans"
// UI flow (PlansPage -> a fresh PAI'D checkout) is a SECOND, separate
// one-time charge rather than replacing the first. H-Phase-A cycle 17:
// reworded "subscription" to "one-time charge" to match TermsPage.tsx's
// corrected framing (PAI'D never auto-renews); also wired the "Help
// Center" text to real navigation — it used to be styled as a clickable
// link with no onClick/href at all.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QAPage } from "./QAPage.tsx";

afterEach(() => cleanup());

describe("QAPage — cancel/downgrade answer honesty", () => {
  it("tells the reader to email support instead of claiming self-serve plan changes work", async () => {
    render(<QAPage />);

    const search = screen.getByPlaceholderText("Search questions...");
    fireEvent.change(search, { target: { value: "cancel or downgrade" } });

    const question = screen.getByText("Can I cancel or downgrade?");
    fireEvent.click(question.closest("button")!);

    expect(screen.getByText(/email support@jonathanarvay\.com to cancel/)).toBeTruthy();
    expect(screen.getByText(/second, separate one-time charge/)).toBeTruthy();
    expect(screen.queryByText(/Change your plan at any time/)).toBeNull();
    expect(screen.queryByText(/you keep Pro access until then/)).toBeNull();
  });
});

describe("QAPage — the 'Help Center' text is a real link, not a fake-clickable label", () => {
  it("navigates to the help page when clicked, given an onNavigate callback", () => {
    const onNavigate = vi.fn();
    render(<QAPage onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("Help Center"));
    expect(onNavigate).toHaveBeenCalledWith("help");
  });

  it("renders as plain (non-interactive) text when no onNavigate callback is provided", () => {
    render(<QAPage />);
    const helpCenter = screen.getByText("Help Center");
    expect(helpCenter.getAttribute("role")).not.toBe("button");
  });
});
