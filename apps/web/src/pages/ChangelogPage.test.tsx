/**
 * @vitest-environment happy-dom
 */

// WO-P16 — Changelog: renders the repo's own CHANGELOG.md (GET
// /v1/changelog, raw markdown) split into per-version cards. Honesty check:
// CHANGELOG.md is hand-maintained, so it can lag the deployed APP_VERSION —
// the page compares against the real constant rather than assuming its own
// newest logged entry is "current," and discloses the gap when they differ.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangelogPage } from "./ChangelogPage.tsx";
import { APP_VERSION } from "../version.ts";

function stubFetch(text: string, status = 200) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { try { return JSON.parse(text); } catch { return {}; } },
    text: async () => text,
    headers: { get: () => null },
  }) as unknown as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const UP_TO_DATE_LOG = `# Changelog

## [${APP_VERSION}] - 2026-07-12

### Added
- **Something new** — a real feature.

## [0.5.0] - 2026-04-15

### Fixed
- An old bug.
`;

const STALE_LOG = `# Changelog

## [0.5.0] - 2026-04-15

### Added
- **Something old** — from a while back.
`;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChangelogPage — parsing and rendering", () => {
  it("splits the raw markdown into one card per version, in file order", async () => {
    stubFetch(UP_TO_DATE_LOG);
    render(<ChangelogPage />);

    expect(await screen.findByText(APP_VERSION)).toBeTruthy();
    expect(screen.getByText("0.5.0")).toBeTruthy();
    expect(screen.getByText("2026-07-12")).toBeTruthy();
    expect(screen.getByText("2026-04-15")).toBeTruthy();
    expect(screen.getByText(/Something new/)).toBeTruthy();
    expect(screen.getByText(/An old bug/)).toBeTruthy();
  });

  it("renders each section's ### subsections via MarkdownLite (real headings, not raw text)", async () => {
    stubFetch(UP_TO_DATE_LOG);
    render(<ChangelogPage />);

    await screen.findByText(APP_VERSION);
    expect(screen.getByRole("heading", { name: "Added" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fixed" })).toBeTruthy();
  });

  it("shows a retry option when the changelog fails to load", async () => {
    stubFetch("server error", 500);
    render(<ChangelogPage />);

    await screen.findByRole("button", { name: "Retry" });

    stubFetch(UP_TO_DATE_LOG);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText(APP_VERSION)).toBeTruthy());
  });

  it("handles a changelog with no version headings without crashing", async () => {
    stubFetch("# Changelog\n\nNothing logged yet.\n");
    render(<ChangelogPage />);

    expect(await screen.findByText(/no version entries yet/)).toBeTruthy();
  });
});

describe("ChangelogPage — honesty: current-version gap disclosure", () => {
  it("badges the section matching APP_VERSION as Current, with no gap notice", async () => {
    stubFetch(UP_TO_DATE_LOG);
    render(<ChangelogPage />);

    await screen.findByText(APP_VERSION);
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.queryByText(/may not be written up here yet/)).toBeNull();
  });

  it("discloses the gap when the newest logged entry is behind APP_VERSION", async () => {
    stubFetch(STALE_LOG);
    render(<ChangelogPage />);

    await screen.findByText("0.5.0");
    expect(screen.getByText(new RegExp(`Currently running v${APP_VERSION.replace(/\./g, "\\.")}`))).toBeTruthy();
    expect(screen.getByText(/logged through v0\.5\.0/)).toBeTruthy();
    // Never fabricates a "Current" badge on a version that isn't actually deployed.
    expect(screen.queryByText("Current")).toBeNull();
  });
});
