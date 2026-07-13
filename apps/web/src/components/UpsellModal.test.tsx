/**
 * @vitest-environment happy-dom
 */

// H5.1b — UpsellModal dialog semantics: this component had no role="dialog",
// no focus trap, no Escape-to-close, and no focus-return to the trigger on
// close. These tests pin the real behavior (jsdom/happy-dom genuinely track
// document.activeElement, so this is a behavioral assertion, not a snapshot).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpsellModal } from "./UpsellModal.tsx";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("axis_api_key", "test-key"); // non-anonymous: skip AuthButtons' OAuth calls
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderModal(onClose = vi.fn()) {
  render(
    <UpsellModal
      blocked={["theme", "brand"]}
      allowed={["search", "skills", "debug"]}
      onGoFree={vi.fn()}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("UpsellModal dialog semantics (H5.1b)", () => {
  it("has real dialog ARIA: role=dialog, aria-modal, labelled by its own heading", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toContain("Pro Programs Required");
  });

  it("moves focus into the dialog on open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBe(document.activeElement);
  });

  it("restores focus to the trigger element on close (unmount)", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <UpsellModal blocked={["theme"]} allowed={["search"]} onGoFree={vi.fn()} onClose={vi.fn()} />,
    );
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Escape calls onClose", () => {
    const onClose = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab from the last focusable element wraps to the first (focus trap)", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from the first focusable element wraps to the last (focus trap)", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
