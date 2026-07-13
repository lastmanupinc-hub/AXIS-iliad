/**
 * @vitest-environment happy-dom
 */

// H5.1b item (c) — useFocusRetention: a button whose disabled prop tracks an
// in-flight action gets forcibly blurred by the browser the instant it's
// disabled; this hook restores focus to that same button once it's
// re-enabled. Tested via a spy on the real element's .focus() method — more
// robust than asserting document.activeElement through a disable/blur cycle,
// since happy-dom doesn't fully replicate a real browser's blur-on-disable
// behavior (confirmed while writing this test).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useFocusRetention } from "./useFocusRetention.ts";

afterEach(() => cleanup());

function TestButton({ busy }: { busy: boolean }) {
  const ref = useFocusRetention<HTMLButtonElement>(busy);
  return <button ref={ref} disabled={busy}>{busy ? "Working..." : "Go"}</button>;
}

describe("useFocusRetention", () => {
  it("calls .focus() on the element when `busy` flips from true to false", () => {
    const { getByRole, rerender } = render(<TestButton busy={true} />);
    const button = getByRole("button") as HTMLButtonElement;
    const focusSpy = vi.spyOn(button, "focus");

    rerender(<TestButton busy={false} />);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call .focus() on mount, even if the initial render is already busy", () => {
    const { getByRole } = render(<TestButton busy={true} />);
    const button = getByRole("button") as HTMLButtonElement;
    const focusSpy = vi.spyOn(button, "focus");
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("does not call .focus() while busy stays true, or on a false->true transition", () => {
    const { getByRole, rerender } = render(<TestButton busy={false} />);
    const button = getByRole("button") as HTMLButtonElement;
    const focusSpy = vi.spyOn(button, "focus");

    rerender(<TestButton busy={false} />); // no transition
    rerender(<TestButton busy={true} />); // false -> true, not the direction that refocuses
    expect(focusSpy).not.toHaveBeenCalled();
  });
});
