/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 21 — SignUpModal, the app's global auth gate, had none of
// the dialog semantics its sibling UpsellModal already got in H5.1b: no
// role="dialog"/aria-modal, no focus moved in on open, no focus trap, no
// Escape-to-close. These tests pin the real behavior, matching
// UpsellModal.test.tsx's pattern (happy-dom genuinely tracks
// document.activeElement, so this is behavioral, not a snapshot).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SignUpModal } from "./SignUpModal.tsx";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("axis_api_key", "test-key"); // non-anonymous: skip AuthButtons' OAuth calls
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("SignUpModal dialog semantics", () => {
  it("has real dialog ARIA: role=dialog, aria-modal, labelled by its own heading", () => {
    render(<SignUpModal onSuccess={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toContain("Sign in to Iliad");
  });

  it("moves focus into the dialog on open", () => {
    render(<SignUpModal onSuccess={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBe(document.activeElement);
  });

  it("restores focus to the trigger element on close (unmount)", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<SignUpModal onSuccess={vi.fn()} />);
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Escape calls onClose when allowClose is true", () => {
    const onClose = vi.fn();
    render(<SignUpModal onSuccess={vi.fn()} onClose={onClose} allowClose />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape does nothing when allowClose is false (a hard gate, no legitimate close path)", () => {
    const onClose = vi.fn();
    render(<SignUpModal onSuccess={vi.fn()} onClose={onClose} allowClose={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Tab from the last focusable element wraps to the first (focus trap)", () => {
    render(<SignUpModal onSuccess={vi.fn()} onClose={vi.fn()} allowClose />);
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
    render(<SignUpModal onSuccess={vi.fn()} onClose={vi.fn()} allowClose />);
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
