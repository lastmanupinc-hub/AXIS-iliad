/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 21 — FilesTab's sortable column headers were the only
// sortable-column-header control in the app, and this file had never been
// touched since its original scaffold: <th onClick={...}> with no tabIndex/
// role/onKeyDown, so a keyboard-only user had no way to change the sort
// order, and no aria-sort meant a screen-reader user got no indication of
// the current sort column/direction either.
//
// aria-sort lives on the native <th> (columnheader role preserved); the
// click/keyboard affordance lives on an inner role="button" span, since an
// explicit role="button" directly on the <th> would override its
// columnheader role entirely.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ContextMap } from "../api.ts";
import { FilesTab } from "./FilesTab.tsx";

afterEach(() => {
  cleanup();
});

const CTX = {
  structure: {
    total_files: 3,
    total_directories: 1,
    total_loc: 60,
    file_tree_summary: [
      { path: "b.ts", language: "TypeScript", loc: 30, role: "source" },
      { path: "a.ts", language: "TypeScript", loc: 10, role: "source" },
      { path: "c.test.ts", language: "TypeScript", loc: 20, role: "test" },
    ],
    top_level_layout: [{ name: "src", purpose: "source", file_count: 3 }],
  },
} as unknown as ContextMap;

function rowOrder() {
  return screen.getAllByRole("row").slice(1).map((r) => r.querySelector(".mono")?.textContent);
}

describe("FilesTab sortable headers", () => {
  it("preserves the native columnheader role while adding aria-sort", () => {
    render(<FilesTab ctx={CTX} />);
    // Path defaults to the active sort; still queryable as a columnheader —
    // proof role="button" was NOT applied directly to the <th>.
    expect(screen.getByRole("columnheader", { name: /Path/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByRole("columnheader", { name: /Language/ }).getAttribute("aria-sort")).toBe("none");
  });

  it("each header's clickable label is a keyboard-focusable button", () => {
    render(<FilesTab ctx={CTX} />);
    const label = screen.getByRole("button", { name: /LOC/ });
    expect(label.getAttribute("tabindex")).toBe("0");
  });

  it("Enter on a header's label sorts by that column and updates aria-sort", () => {
    render(<FilesTab ctx={CTX} />);
    expect(rowOrder()).toEqual(["a.ts", "b.ts", "c.test.ts"]);

    fireEvent.keyDown(screen.getByRole("button", { name: /LOC/ }), { key: "Enter" });

    expect(screen.getByRole("columnheader", { name: /LOC/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(rowOrder()).toEqual(["a.ts", "c.test.ts", "b.ts"]);
  });

  it("Space on an already-sorted header reverses direction, same as a second click", () => {
    render(<FilesTab ctx={CTX} />);
    expect(screen.getByRole("columnheader", { name: /Path/ }).getAttribute("aria-sort")).toBe("ascending");

    fireEvent.keyDown(screen.getByRole("button", { name: /Path/ }), { key: " " });
    expect(screen.getByRole("columnheader", { name: /Path/ }).getAttribute("aria-sort")).toBe("descending");
    expect(rowOrder()).toEqual(["c.test.ts", "b.ts", "a.ts"]);
  });

  it("click still works (unchanged behavior)", () => {
    render(<FilesTab ctx={CTX} />);
    fireEvent.click(screen.getByRole("button", { name: /Role/ }));
    expect(screen.getByRole("columnheader", { name: /Role/ }).getAttribute("aria-sort")).toBe("ascending");
  });
});
