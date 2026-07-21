/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 22 — ProgramsPage's Pro-section subhead hand-typed "17
// additional programs" while every other count on the page ("Single-source
// counts (WO-F5) -- never inline these numbers", per the file's own header
// comment) is sourced from config.ts or, for this section, the same `pro`
// array actually rendered as cards below it. "17" happened to be correct
// today, but nothing tied it to the real program list, and this page had
// zero test coverage before now.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgramsPage } from "./ProgramsPage.tsx";

afterEach(() => {
  cleanup();
});

describe("ProgramsPage counts", () => {
  it("the Pro-section subhead's count exactly matches the number of PRO program cards actually rendered", () => {
    render(<ProgramsPage onAnalyze={vi.fn()} />);
    const proBadges = screen.getAllByText("PRO");
    const subhead = screen.getByText(/additional programs unlocked with a Pro subscription/);
    const match = subhead.textContent?.match(/^(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(proBadges.length);
  });
});
