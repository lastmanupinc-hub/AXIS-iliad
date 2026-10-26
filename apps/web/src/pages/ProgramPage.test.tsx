/**
 * @vitest-environment happy-dom
 */

// A program's own page (2026-10-26, AXIS Launch taskgate T151, harden): it shows the program the address names, with
// every file the manifest says one run writes, and an id no program has gets a way back to the list, never a blank
// page or another program's content.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgramPage } from "./ProgramPage.tsx";
import { PROGRAMS } from "../programs.ts";

afterEach(() => cleanup());

describe("ProgramPage", () => {
  it("shows the program the id names: its name as the one h1, and every file one run writes", () => {
    const p = PROGRAMS.find((x) => x.id === "search")!;
    render(<ProgramPage id="search" onAnalyze={() => {}} onBack={() => {}} />);
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe(p.name);
    for (const o of p.outputs) expect(screen.getByText(o)).toBeTruthy();
  });

  it("starts an analysis from the program's call to action", () => {
    const p = PROGRAMS.find((x) => x.id === "seo")!;
    const onAnalyze = vi.fn();
    render(<ProgramPage id="seo" onAnalyze={onAnalyze} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: p.cta }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it("names an id no program has and links back to every program", () => {
    render(<ProgramPage id="no-such-program" onAnalyze={() => {}} onBack={() => {}} />);
    expect(document.querySelector("h1")?.textContent).toMatch(/no program called/i);
    const back = screen.getByRole("link", { name: /every program/i });
    expect(back.getAttribute("href")).toBe("/programs/");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
