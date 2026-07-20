/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 20 — the toast rail had no aria-live region (a toast
// appearing was invisible to screen readers) and its only dismissal
// affordance was a bare div onClick (no role="button", tabIndex, or
// onKeyDown — unreachable and inoperable by keyboard). These tests cover
// both: the rail exposes an accessible live region, and each toast is a
// real keyboard-operable control.

import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast.tsx";

afterEach(() => {
  cleanup();
});

function Fire({ level, message }: { level: "info" | "success" | "error" | "warning"; message: string }) {
  const { toast } = useToast();
  useEffect(() => {
    toast(level, message, 60_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("ToastRail accessibility", () => {
  it("mounts a live region up front, even with zero toasts", () => {
    render(<ToastProvider>{null}</ToastProvider>);
    const region = screen.getByRole("log");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("announces a new toast inside the persistent live region", () => {
    render(
      <ToastProvider>
        <Fire level="success" message="Snapshot saved" />
      </ToastProvider>,
    );
    const region = screen.getByRole("log");
    expect(region.textContent).toContain("Snapshot saved");
  });

  it("each toast is a keyboard-focusable button that dismisses on Enter", () => {
    render(
      <ToastProvider>
        <Fire level="error" message="Upload failed" />
      </ToastProvider>,
    );
    const item = screen.getByRole("button", { name: /Upload failed/ });
    expect(item.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(item, { key: "Enter" });
    expect(screen.queryByText("Upload failed")).toBeNull();
  });

  it("each toast dismisses on Space as well as Enter", () => {
    render(
      <ToastProvider>
        <Fire level="warning" message="Quota low" />
      </ToastProvider>,
    );
    const item = screen.getByRole("button", { name: /Quota low/ });

    fireEvent.keyDown(item, { key: " " });
    expect(screen.queryByText("Quota low")).toBeNull();
  });

  it("still dismisses on click (unchanged behavior)", () => {
    render(
      <ToastProvider>
        <Fire level="info" message="Build started" />
      </ToastProvider>,
    );
    const item = screen.getByRole("button", { name: /Build started/ });

    fireEvent.click(item);
    expect(screen.queryByText("Build started")).toBeNull();
  });
});
