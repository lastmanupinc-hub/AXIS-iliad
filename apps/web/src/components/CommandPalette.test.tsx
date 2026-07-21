/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 23 — CommandPalette is functionally a modal (fixed
// backdrop + centered panel) but was the one first-class overlay in the app
// missing dialog semantics: no role="dialog"/aria-modal, no Tab focus trap
// (focus could escape into the ide-shell behind the visually-covering
// backdrop), and no focus restore on close. Matches UpsellModal.test.tsx's
// pattern (happy-dom genuinely tracks document.activeElement). Opening moves
// focus into the search input inside a setTimeout(..., 0) (the input isn't
// in the DOM yet during the same synchronous update that flips `open`), so
// tests that depend on that focus must wait a tick after opening.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette, type PaletteAction } from "./CommandPalette.tsx";

afterEach(() => {
  cleanup();
});

const ACTIONS: PaletteAction[] = [
  { id: "a", label: "Go to Dashboard", section: "Navigate", onSelect: vi.fn() },
  { id: "b", label: "Go to Settings", section: "Navigate", onSelect: vi.fn() },
];

async function openPalette() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("CommandPalette dialog semantics", () => {
  it("has real dialog ARIA: role=dialog, aria-modal, an accessible name", async () => {
    render(<CommandPalette actions={ACTIONS} />);
    await openPalette();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBeTruthy();
  });

  it("moves focus into the search input on open", async () => {
    render(<CommandPalette actions={ACTIONS} />);
    await openPalette();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("restores focus to the trigger element on close (Escape)", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(<CommandPalette actions={ACTIONS} />);
    await openPalette();
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  // The Tab focus-trap fix itself is NOT covered by a test here, disclosed
  // deliberately rather than kept as a fake-green: the palette's only
  // tabbable descendant is the search input (per the correct ARIA
  // combobox/listbox pattern, options are virtually navigated via arrow
  // keys + aria-activedescendant, never independently tabbable), so
  // first===last===input already before AND after the fix -- the trap
  // handler's own `.focus()` call on a single-element set is a no-op with
  // no observable difference. Separately, happy-dom/jsdom don't implement
  // native browser Tab-key focus movement at all, so fireEvent.keyDown
  // can't even simulate the escape this fix prevents. A real red-before-
  // green attempt confirmed both: the test passed identically with the fix
  // reverted. The fix is still correct and matches UpsellModal's
  // established pattern verbatim -- it becomes independently verifiable
  // (and load-bearing) the moment this palette ever grows a second
  // focusable element (e.g. an action button).
});
