/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 6: an already-logged-in visit (a stale axis_api_key
// marker, e.g. re-clicking an old OAuth link or re-linking a provider while
// already signed in) landing on a fresh #account?code=...&login=... OAuth
// callback used to redirect straight to Settings before the exchange
// effect's own setExchanging(true) had a chance to land — a state update
// scheduled by one effect isn't visible to a SIBLING effect in the same
// commit, only a synchronous read is. The exchange promise still resolves
// later and reloads the page, so the end state self-healed, but there was a
// real incorrect navigation/flash in between.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AccountPage } from "./AccountPage.tsx";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return {
    ...actual,
    exchangeOAuthCode: vi.fn(() => new Promise(() => {})), // never resolves — proves the redirect didn't fire pre-exchange
  };
});

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("AccountPage — OAuth-exchange vs. already-logged-in redirect race", () => {
  it("does not redirect to Settings while a pending OAuth code is still being exchanged, even if already logged in", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__"); // stale marker from a prior session
    window.history.pushState({}, "", "/?code=abc123&login=github");

    const onNavigate = vi.fn();
    render(<AccountPage onNavigate={onNavigate} />);

    // Give effects a chance to run and (if the bug were present) redirect.
    await waitFor(() => expect(screen.getByText("Completing sign-in…")).toBeTruthy());
    expect(onNavigate).not.toHaveBeenCalledWith("settings");
  });

  it("redirects to Settings immediately when already logged in with no pending OAuth code", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");

    const onNavigate = vi.fn();
    render(<AccountPage onNavigate={onNavigate} />);

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("settings"));
  });
});
