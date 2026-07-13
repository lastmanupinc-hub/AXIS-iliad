/**
 * @vitest-environment happy-dom
 */

// H5.2 — mobile pass: SearchTab's result rows had no shrink/truncate handling
// on their longest span (text-search: the matched-content span; symbol-search:
// the symbol-name span), so a long result would overflow the row instead of
// eliding — no test coverage existed for this component at all before this unit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchTab } from "./SearchTab.tsx";

function stubSearchFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response)));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SearchTab — result rows can shrink/truncate instead of overflowing (H5.2)", () => {
  it("text search: the matched-content span can shrink below its intrinsic width", async () => {
    stubSearchFetch({
      snapshot_id: "snap1",
      query: "handleFoo",
      total_indexed_lines: 100,
      total_indexed_files: 5,
      results: [{ file_path: "apps/web/src/very/deeply/nested/path/Component.tsx", line_number: 42, content: "export function handleFoo(x: number, y: number, z: number) {", rank: 1 }],
    });

    render(<SearchTab snapshotId="snap1" />);
    fireEvent.change(screen.getByPlaceholderText(/Search files by content/), { target: { value: "handleFoo" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const content = await waitFor(() => screen.getByText(/export function handleFoo/));
    expect(content.style.minWidth).toBe("0");
    expect(content.style.overflow).toBe("hidden");
    expect(content.style.textOverflow).toBe("ellipsis");
  });

  it("symbol search: the symbol-name span can shrink, the file:line span stays fixed", async () => {
    stubSearchFetch({
      snapshot_id: "snap1",
      symbol_count: 1,
      results: [{ file_path: "apps/web/src/very/deeply/nested/path/Component.tsx", symbol_name: "handleVeryLongSymbolNameThatCouldOverflow", symbol_type: "function", line_number: 10, parent: null }],
    });

    render(<SearchTab snapshotId="snap1" />);
    fireEvent.click(screen.getByRole("button", { name: "Symbols" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const name = await waitFor(() => screen.getByText("handleVeryLongSymbolNameThatCouldOverflow"));
    expect(name.style.minWidth).toBe("0");
    expect(name.style.textOverflow).toBe("ellipsis");

    const location = screen.getByText(/Component\.tsx:10/);
    expect(location.style.flexShrink).toBe("0");
  });
});
