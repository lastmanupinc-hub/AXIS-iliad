/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 22 — CodeBlock's copy button flips its visible text and
// aria-label to "Copied" on click, but nothing marked that change as a live
// region, so a screen-reader user clicking "Copy code" had no reliable
// confirmation the copy succeeded (support for announcing a changed
// aria-label on an already-focused element alone is inconsistent across
// assistive tech).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodeBlock } from "./CodeBlock.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CodeBlock copy confirmation", () => {
  it("the copy button is a live region that announces the Copied state", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    render(<CodeBlock code="npm install axis" />);
    const button = screen.getByRole("button", { name: "Copy code" });
    expect(button.getAttribute("aria-live")).toBe("polite");

    fireEvent.click(button);
    await screen.findByRole("button", { name: "Copied" });
    expect(button.textContent).toBe("Copied!");
  });
});
