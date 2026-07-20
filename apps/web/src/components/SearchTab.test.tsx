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

describe("SearchTab — no mojibake in user-visible text (H-Phase-A cycle 16)", () => {
  it("symbol mode's placeholder uses a real ellipsis character, not a double-encoded artifact", () => {
    render(<SearchTab snapshotId="snap1" />);
    fireEvent.click(screen.getByRole("button", { name: "Symbols" }));
    const input = screen.getByPlaceholderText(/Symbol name prefix/);
    expect(input.getAttribute("placeholder")).toContain("…");
    expect(input.getAttribute("placeholder")).not.toContain("â€¦");
  });

  it("the indexed-stats badge uses a real middle dot, not a double-encoded artifact", async () => {
    stubSearchFetch({ snapshot_id: "snap1", indexed_files: 5, indexed_lines: 100, indexed_symbols: 12 });
    render(<SearchTab snapshotId="snap1" />);
    fireEvent.click(screen.getByRole("button", { name: /Index Files/ }));
    const badge = await waitFor(() => screen.getByText(/files ·/));
    expect(badge.textContent).toContain("·");
    expect(badge.textContent).not.toContain("Â·");
  });
});

describe("SearchTab — stale search responses cannot overwrite a newer query (H-Phase-A bulk sweep)", () => {
  it("Enter re-fires the search on every keypress, and an older, slower response never overwrites the newer one", async () => {
    const resolvers: Array<(body: unknown) => void> = [];
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const index = callCount++;
      const body = await new Promise((resolve) => { resolvers[index] = resolve; });
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    }));

    render(<SearchTab snapshotId="snap1" />);
    const input = screen.getByPlaceholderText(/Search files by content/);

    // First query, Enter-triggered -- its response will resolve LAST.
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(resolvers[0]).toBeTruthy());

    // Second query, also Enter-triggered, before the first has resolved.
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(resolvers[1]).toBeTruthy());

    // Newer (second) response resolves FIRST.
    resolvers[1]({
      snapshot_id: "snap1", query: "second", total_indexed_lines: 10, total_indexed_files: 1,
      results: [{ file_path: "b.ts", line_number: 1, content: "second-match", rank: 1 }],
    });
    await waitFor(() => expect(screen.getByText("second-match")).toBeTruthy());

    // Older (first) response resolves AFTER -- must be ignored, not overwrite
    // the already-displayed, more-current "second-match" result.
    resolvers[0]({
      snapshot_id: "snap1", query: "first", total_indexed_lines: 10, total_indexed_files: 1,
      results: [{ file_path: "a.ts", line_number: 1, content: "first-match", rank: 1 }],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("second-match")).toBeTruthy();
    expect(screen.queryByText("first-match")).toBeNull();
  });
});
