/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 7: this page's "Can I cancel or downgrade?" answer
// falsely claimed self-serve plan changes work ("Change your plan at any
// time from the Usage page... you keep Pro access until then") — no
// self-serve cancel/downgrade path exists anywhere in this codebase (PAI'D
// never writes stripe_subscriptions, the only table GET/POST
// /v1/account/subscription reads from), and the sanctioned "switch plans"
// UI flow (PlansPage -> a fresh PAI'D checkout) creates a SECOND, separate
// subscription rather than replacing the first.

import { afterEach, describe, expect, it } from "vitest";
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
    expect(screen.getByText(/creates a second, separate subscription/)).toBeTruthy();
    expect(screen.queryByText(/Change your plan at any time/)).toBeNull();
    expect(screen.queryByText(/you keep Pro access until then/)).toBeNull();
  });
});
