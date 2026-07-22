/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 20 — the hero and all 5 case-study cards hardcoded
// `afterCount: 75` / "75 structured artifacts", a number that never changed
// since the file's original commit even as the real ARTIFACT_COUNT grew to
// 142 — a self-contradiction of the exact shape cycle 18 already fixed on
// DocsPage.tsx, on a page whose own header comment says "Single-source
// counts (WO-F5) — never inline these numbers." No test existed for this
// page before this fix.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExamplesPage } from "./ExamplesPage.tsx";
import { ARTIFACT_COUNT } from "../config.ts";

afterEach(() => {
  cleanup();
});

describe("ExamplesPage — artifact-count honesty", () => {
  it("the hero claims the real ARTIFACT_COUNT, not a stale hardcoded number", () => {
    render(<ExamplesPage />);
    expect(screen.getByText(`${ARTIFACT_COUNT} structured artifacts`)).toBeTruthy();
    expect(screen.queryByText("75 structured artifacts")).toBeNull();
  });

  it("every case study's after-count badge shows the real ARTIFACT_COUNT", () => {
    render(<ExamplesPage />);
    const badges = screen.getAllByText(String(ARTIFACT_COUNT));
    // 5 case-study cards, each rendering its own after-count badge.
    expect(badges.length).toBeGreaterThanOrEqual(5);
  });

  it("the 'After (per repo)' summary stat tile shows the real ARTIFACT_COUNT, not a 7th stale '75' (Cycle 27)", () => {
    // A distinct literal from the hero text and the 5 case-study badges above
    // — cycle 20 fixed those 6 occurrences but missed this 7th one, which had
    // zero test coverage until now.
    render(<ExamplesPage />);
    expect(screen.getByText("After (per repo)").parentElement?.textContent).toContain(String(ARTIFACT_COUNT));
    expect(screen.queryByText("75")).toBeNull();
  });
});
