/**
 * @vitest-environment happy-dom
 */

// WO-F1 design-token bridge — theme behavior:
// OS dark preference is respected on first visit (no data-theme attribute, so
// theme.css's prefers-color-scheme block governs); the in-app toggle sets an
// explicit data-theme override persisted to localStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";

function stubMatchMedia(osDark: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("prefers-color-scheme: dark") ? osDark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }) as unknown as Response));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("Theme — OS preference + explicit override (WO-F1)", () => {
  it("first visit on an OS-dark machine: follows OS, sets no data-theme override", () => {
    stubMatchMedia(true);
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("axis_theme")).toBeNull();
    // Effective theme is dark, so the rail offers switching to light.
    expect(screen.getByLabelText("Switch to light mode")).toBeTruthy();
  });

  it("first visit on an OS-light machine: follows OS, offers dark", () => {
    stubMatchMedia(false);
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(screen.getByLabelText("Switch to dark mode")).toBeTruthy();
  });

  it("toggling sets an explicit persisted override", () => {
    stubMatchMedia(false);
    render(<App />);
    fireEvent.click(screen.getByLabelText("Switch to dark mode"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("axis_theme")).toBe("dark");
    // Toggling back overrides to explicit light (wins over any OS preference).
    fireEvent.click(screen.getByLabelText("Switch to light mode"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("axis_theme")).toBe("light");
  });

  it("a stored override is applied on load regardless of OS preference", () => {
    stubMatchMedia(true); // OS says dark…
    localStorage.setItem("axis_theme", "light"); // …user chose light
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByLabelText("Switch to dark mode")).toBeTruthy();
  });
});
