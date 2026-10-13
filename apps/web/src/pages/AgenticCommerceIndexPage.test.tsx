/**
 * @vitest-environment happy-dom
 */

// AXIS Launch taskgate T16 — the agentic-commerce index page. The index is
// dark until its first published edition (owner's usage-numbers rule), so:
//   - with an edition, the page renders shares/ranks/changes and the method;
//   - without one (the API's 404), it says ONLY that the index publishes
//     weekly from Iliad's own call records — no "not enough calls", no
//     thresholds, no "yet", nothing that implies when;
//   - a breakdown an edition leaves null is not rendered, and not explained.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgenticCommerceIndexPage, INDEX_NO_EDITION_TEXT } from "./AgenticCommerceIndexPage.tsx";
import type { AgenticCommerceIndex } from "../api.ts";

function stubFetch(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
    headers: { get: () => null },
  }) as unknown as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const METHOD = "Built from Axis' Iliad's own record of MCP tools/call requests. (test method text)";

function edition(overrides: Partial<AgenticCommerceIndex> = {}): AgenticCommerceIndex {
  return {
    index: "iliad-agentic-commerce-index",
    schema_version: 1,
    publisher: { name: "Axis' Iliad", url: "https://iliad.trustfabric.ai/" },
    page_url: "https://iliad.trustfabric.ai/agentic-commerce-index",
    status: "published",
    message: null,
    period_start: "2026-10-05T00:00:00.000Z",
    period_end: "2026-10-12T00:00:00.000Z",
    comparison_period_start: "2026-09-28T00:00:00.000Z",
    comparison_period_end: "2026-10-05T00:00:00.000Z",
    generated_at: "2026-10-12T00:10:00.000Z",
    method: METHOD,
    tools: {
      rows: [
        { key: "analyze_repo", label: "Analyze Repo", rank: 1, share_pct: 35, change_pp: -13, category: "codebase_intelligence", pricing: "metered" },
        { key: "list_programs", label: "List Programs", rank: 2, share_pct: 23, change_pp: null, category: "codebase_intelligence", pricing: "not_metered" },
      ],
      other_share_pct: 42,
    },
    categories: {
      rows: [{ key: "codebase_intelligence", label: "Codebase intelligence", rank: 1, share_pct: 100, change_pp: 4 }],
      other_share_pct: 0,
    },
    pricing: {
      rows: [
        { key: "metered", label: "Metered tools (pay per call)", rank: 1, share_pct: 58, change_pp: 0 },
        { key: "not_metered", label: "Free or plan-included tools", rank: 2, share_pct: 42, change_pp: null },
      ],
      other_share_pct: 0,
    },
    agent_modes: null,
    budget_headers: null,
    ...overrides,
  };
}

/** Words that, on this page, could only be true by admitting low usage — or that promise a date. */
const FORBIDDEN_COPY = /not enough|too few|fewer than|threshold|floor of|\b(20|100) calls\b|\byet\b|\bsoon\b|coming|first edition/i;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AgenticCommerceIndexPage — with a published edition", () => {
  it("renders ranks, shares, signed changes, other, the week and the published method", async () => {
    const fetchFn = stubFetch(edition());
    render(<AgenticCommerceIndexPage />);
    expect(await screen.findByText("Analyze Repo")).toBeTruthy();
    expect(String(fetchFn.mock.calls[0][0])).toContain("/v1/agentic-commerce-index");
    expect(screen.getByRole("heading", { level: 1, name: /agentic commerce index/i })).toBeTruthy();
    expect(screen.getAllByText("35%").length).toBeGreaterThan(0);
    expect(screen.getByText("−13 pts")).toBeTruthy();
    expect(screen.getByText("0 pts")).toBeTruthy();
    expect(screen.getAllByText("Other (below the privacy floor)").length).toBeGreaterThan(0);
    expect(screen.getByText("Oct 5, 2026 – Oct 11, 2026 (UTC)")).toBeTruthy();
    expect(screen.getByText(METHOD)).toBeTruthy();
  });

  it("does not render, or explain, a breakdown the edition leaves null", async () => {
    stubFetch(edition());
    render(<AgenticCommerceIndexPage />);
    await screen.findByText("Analyze Repo");
    expect(screen.queryByText("Agent modes")).toBeNull();
    expect(screen.queryByText("Budget headers")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(FORBIDDEN_COPY);
  });
});

describe("AgenticCommerceIndexPage — no edition (the API's 404)", () => {
  it("says only that the index publishes weekly from Iliad's own call records", async () => {
    stubFetch({ error: "Not found", error_code: "NOT_FOUND", request_id: "r1" }, 404);
    const { container } = render(<AgenticCommerceIndexPage />);
    expect(await screen.findByText(INDEX_NO_EDITION_TEXT)).toBeTruthy();
    expect(INDEX_NO_EDITION_TEXT).toBe("The agentic commerce index publishes weekly from Iliad's own call records.");
    // Exactly the heading and that one sentence — no table, link, button or method.
    expect(container.textContent?.replace("Agentic commerce index", "").trim()).toBe(INDEX_NO_EDITION_TEXT);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN_COPY);
  });

  it("treats any non-published document exactly like no edition", async () => {
    stubFetch({ ...edition(), status: "insufficient_data", message: "Not enough calls this period to publish.", tools: null, categories: null, pricing: null });
    const { container } = render(<AgenticCommerceIndexPage />);
    expect(await screen.findByText(INDEX_NO_EDITION_TEXT)).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN_COPY);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("when the API cannot be reached, says the same sentence and offers a retry — nothing more", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { container } = render(<AgenticCommerceIndexPage />);
    await waitFor(() => expect(screen.getByText(INDEX_NO_EDITION_TEXT)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN_COPY);
  });
});
