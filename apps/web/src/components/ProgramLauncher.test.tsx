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
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// H-Phase-A cycle 18: `running` was a single shared string, not per-program
// state — starting a SECOND program while the first was still generating
// let the first's own spinner vanish early (running flipped to the second
// program's name), and the second program's eventual `finally` then
// unconditionally wiped whichever spinner was showing, even if the FIRST
// program was still mid-generation.
describe("ProgramLauncher — concurrent runs (H-Phase-A cycle 18)", () => {
  it("a second program's spinner does not clear the first program's still-in-flight spinner", async () => {
    const resolvers: Record<string, () => void> = {};
    const onRun = vi.fn((endpoint: string) => new Promise<void>((resolve) => {
      resolvers[endpoint] = resolve;
    }));
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);

    const searchCard = screen.getByText("Search Context").closest(".card") as HTMLElement;
    const debugCard = screen.getByText("Debug Playbook").closest(".card") as HTMLElement;

    fireEvent.click(searchCard); // search/export now in flight
    await waitFor(() => expect(within(searchCard).getByText("Generating...")).toBeTruthy());

    fireEvent.click(debugCard); // debug/analyze started BEFORE search resolves
    await waitFor(() => expect(within(debugCard).getByText("Generating...")).toBeTruthy());
    expect(within(searchCard).getByText("Generating...")).toBeTruthy(); // still running, unaffected by debug starting

    // Debug (the SECOND, independent run) finishes first.
    resolvers["debug/analyze"]();
    await waitFor(() => expect(within(debugCard).queryByText("Generating...")).toBeNull());
    // Search must still show its own spinner — before the fix, debug's
    // `finally { setRunning(null) }` would have wiped it too.
    expect(within(searchCard).getByText("Generating...")).toBeTruthy();

    resolvers["search/export"]();
    await waitFor(() => expect(within(searchCard).queryByText("Generating...")).toBeNull());
  });
});

// H-Phase-A cycle 23: each program card was a mouse-only clickable <div> --
// no role="button"/tabIndex/onKeyDown -- so a keyboard-only or screen-reader
// user on the app's most-visited page had no way to run a program directly
// from the launcher grid at all.
describe("ProgramLauncher — keyboard operability (H-Phase-A cycle 23)", () => {
  it("each unlocked card is a real, keyboard-focusable button that runs on Enter", async () => {
    const onRun = vi.fn(async () => {});
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);

    const searchCard = screen.getByRole("button", { name: "Search Context" });
    expect(searchCard.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(searchCard, { key: "Enter" });
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
  });

  it("Space also runs the program, and a locked card does nothing on Enter", async () => {
    const { resolveAccount } = stubDeferredAccountFetch();
    const onRun = vi.fn(async () => {});
    render(<ProgramLauncher generatedFiles={[]} onRun={onRun} />);
    resolveAccount("free");

    const seoCard = await waitFor(() => {
      const el = screen.getByRole("button", { name: /SEO Analysis/ });
      expect(el.getAttribute("aria-disabled")).toBe("true");
      return el;
    });
    fireEvent.keyDown(seoCard, { key: "Enter" });
    expect(onRun).not.toHaveBeenCalled();

    const debugCard = screen.getByRole("button", { name: "Debug Playbook" });
    fireEvent.keyDown(debugCard, { key: " " });
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
  });
});
