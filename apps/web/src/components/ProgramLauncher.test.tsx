/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 5 — tier starts "free" and only resolves to the real
// value after an async getAccount() call; without a resolved flag, every
// Pro subscriber saw every Pro program card locked (opacity 0.55, cursor
// not-allowed) and clicks silently did nothing until the fetch completed —
// on ProjectPage, the app's most-visited page. No test existed for this
// component before this fix.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProgramLauncher } from "./ProgramLauncher.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A fetch stub whose /v1/account response stays pending until resolveAccount
 *  is called — lets a test observe the mid-flight state. */
function stubDeferredAccountFetch(): { resolveAccount: (tier: "free" | "paid" | "suite") => void } {
  let resolvePending!: (v: Response) => void;
  const pending = new Promise<Response>((resolve) => { resolvePending = resolve; });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/account")) return pending;
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    }),
  );
  return {
    resolveAccount: (tier) => {
      resolvePending({
        ok: true,
        status: 200,
        json: async () => ({ account: { tier } }),
        text: async () => "",
        headers: { get: () => null },
      } as unknown as Response);
    },
  };
}

describe("ProgramLauncher — Pro-lock race (H-Phase-A cycle 5)", () => {
  it("does not lock Pro programs before the account tier probe resolves", async () => {
    stubDeferredAccountFetch(); // never resolves in this test
    const onRun = vi.fn(async () => {});
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);

    // Old bug: locked={tier === "free"} with tier defaulting to "free" meant
    // every Pro card rendered locked immediately, before the probe had any
    // chance to resolve.
    const seoCard = screen.getByText("SEO Analysis").closest(".card") as HTMLElement;
    expect(seoCard.style.cursor).not.toBe("not-allowed");
    fireEvent.click(seoCard);
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
  });

  it("a real Pro subscriber's cards stay unlocked once the probe resolves", async () => {
    const { resolveAccount } = stubDeferredAccountFetch();
    const onRun = vi.fn(async () => {});
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);
    resolveAccount("paid");
    await new Promise((r) => setTimeout(r, 0));

    const seoCard = screen.getByText("SEO Analysis").closest(".card") as HTMLElement;
    expect(seoCard.style.cursor).not.toBe("not-allowed");
    fireEvent.click(seoCard);
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
  });

  it("a real free-tier user's cards lock only after the probe resolves as free", async () => {
    const { resolveAccount } = stubDeferredAccountFetch();
    const onRun = vi.fn(async () => {});
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);
    resolveAccount("free");

    const seoCard = await waitFor(() => {
      const el = screen.getByText("SEO Analysis").closest(".card") as HTMLElement;
      expect(el.style.cursor).toBe("not-allowed");
      return el;
    });
    fireEvent.click(seoCard);
    expect(onRun).not.toHaveBeenCalled();
  });
});
