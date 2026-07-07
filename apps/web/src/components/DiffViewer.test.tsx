/**
 * @vitest-environment happy-dom
 */

// WO-P5 — DiffViewer: hand-rolled unified diff render + the LCS line-diff it's
// built on. No dependency; this file exercises the diff algorithm directly
// (computeLineDiff) alongside the rendered component.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { computeLineDiff, DiffViewer } from "./DiffViewer.tsx";
import type { VersionDiff } from "../api.ts";

afterEach(() => {
  cleanup();
});

describe("computeLineDiff", () => {
  it("marks identical content as entirely unchanged", () => {
    const lines = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.type === "same")).toBe(true);
    expect(lines.map((l) => l.text)).toEqual(["a", "b", "c"]);
  });

  it("detects a single-line insertion", () => {
    const lines = computeLineDiff("a\nc", "a\nb\nc");
    expect(lines.map((l) => `${l.type}:${l.text}`)).toEqual(["same:a", "add:b", "same:c"]);
  });

  it("detects a single-line removal", () => {
    const lines = computeLineDiff("a\nb\nc", "a\nc");
    expect(lines.map((l) => `${l.type}:${l.text}`)).toEqual(["same:a", "remove:b", "same:c"]);
  });

  it("detects a modification as a remove+add pair", () => {
    const lines = computeLineDiff("a\nb\nc", "a\nB\nc");
    expect(lines.map((l) => `${l.type}:${l.text}`)).toEqual(["same:a", "remove:b", "add:B", "same:c"]);
  });

  it("handles empty-to-nonempty (pure addition)", () => {
    const lines = computeLineDiff("", "x");
    expect(lines.map((l) => l.type)).toEqual(["remove", "add"]); // "" splits to one empty line
  });

  it("falls back to a full remove+add block above the DP cell budget (no hang on huge files)", () => {
    const big = Array.from({ length: 700 }, (_, i) => `line${i}`).join("\n");
    const bigChanged = Array.from({ length: 700 }, (_, i) => `changed${i}`).join("\n");
    const lines = computeLineDiff(big, bigChanged);
    expect(lines.filter((l) => l.type === "remove").length).toBe(700);
    expect(lines.filter((l) => l.type === "add").length).toBe(700);
  });
});

const BASE_DIFF: VersionDiff = {
  old_version: 1,
  new_version: 2,
  snapshot_id: "snap_1",
  files: [],
  summary: { added: 0, removed: 0, modified: 0, unchanged: 0 },
};

describe("DiffViewer", () => {
  it("renders the summary counts", () => {
    render(<DiffViewer diff={{ ...BASE_DIFF, summary: { added: 2, removed: 1, modified: 3, unchanged: 5 } }} />);
    expect(screen.getByText("2 added")).toBeTruthy();
    expect(screen.getByText("1 removed")).toBeTruthy();
    expect(screen.getByText("3 modified")).toBeTruthy();
    expect(screen.getByText("5 unchanged")).toBeTruthy();
  });

  it("shows a 'no differences' message when nothing changed", () => {
    render(<DiffViewer diff={{ ...BASE_DIFF, files: [{ path: "a.md", status: "unchanged", old_content: "x", new_content: "x" }], summary: { added: 0, removed: 0, modified: 0, unchanged: 1 } }} />);
    expect(screen.getByText(/No differences between version 1 and version 2/)).toBeTruthy();
  });

  it("renders added/removed/modified files, each expanded by default when few", () => {
    const diff: VersionDiff = {
      ...BASE_DIFF,
      files: [
        { path: "new.ts", status: "added", old_content: null, new_content: "export const x = 1;" },
        { path: "gone.ts", status: "removed", old_content: "export const y = 2;", new_content: null },
        { path: "changed.ts", status: "modified", old_content: "a\nb", new_content: "a\nB" },
      ],
      summary: { added: 1, removed: 1, modified: 1, unchanged: 0 },
    };
    render(<DiffViewer diff={diff} />);

    expect(screen.getByText("new.ts")).toBeTruthy();
    expect(screen.getByText("export const x = 1;")).toBeTruthy();
    expect(screen.getByText("gone.ts")).toBeTruthy();
    expect(screen.getByText("export const y = 2;")).toBeTruthy();
    expect(screen.getByText("changed.ts")).toBeTruthy();
    // Line-level diff: unchanged "a" plus the removed/added "b"/"B" pair.
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("collapses a file's diff on click and re-expands on click", () => {
    const diff: VersionDiff = {
      ...BASE_DIFF,
      files: [{ path: "a.ts", status: "modified", old_content: "x", new_content: "y" }],
      summary: { added: 0, removed: 0, modified: 1, unchanged: 0 },
    };
    render(<DiffViewer diff={diff} />);

    expect(screen.getByText("x")).toBeTruthy();
    fireEvent.click(screen.getByText("a.ts"));
    expect(screen.queryByText("x")).toBeNull();
    fireEvent.click(screen.getByText("a.ts"));
    expect(screen.getByText("x")).toBeTruthy();
  });

  it("unchanged files are hidden behind a toggle, not rendered by default", () => {
    const diff: VersionDiff = {
      ...BASE_DIFF,
      files: [
        { path: "changed.ts", status: "modified", old_content: "a", new_content: "b" },
        { path: "same.ts", status: "unchanged", old_content: "z", new_content: "z" },
      ],
      summary: { added: 0, removed: 0, modified: 1, unchanged: 1 },
    };
    render(<DiffViewer diff={diff} />);

    expect(screen.queryByText("same.ts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 unchanged file" }));
    expect(screen.getByText("same.ts")).toBeTruthy();
  });

  it("collapses a long unchanged run in a modified file, expandable on click", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const newLines = [...oldLines];
    newLines[10] = "CHANGED";
    const diff: VersionDiff = {
      ...BASE_DIFF,
      files: [{ path: "big.ts", status: "modified", old_content: oldLines.join("\n"), new_content: newLines.join("\n") }],
      summary: { added: 0, removed: 0, modified: 1, unchanged: 0 },
    };
    render(<DiffViewer diff={diff} />);

    // Lines far from the change (e.g. line0) are collapsed away, not rendered raw.
    expect(screen.queryByText("line0")).toBeNull();
    // Two runs collapse (before and after the change at line10) — expand the first.
    const collapsedToggles = screen.getAllByText(/unchanged lines?.*click to show/);
    expect(collapsedToggles.length).toBe(2);
    fireEvent.click(collapsedToggles[0]);
    expect(screen.getByText("line0")).toBeTruthy();
  });
});
