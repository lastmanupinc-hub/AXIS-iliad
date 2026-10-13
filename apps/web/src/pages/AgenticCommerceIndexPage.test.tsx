/**
 * @vitest-environment happy-dom
 */

// AXIS Launch taskgate T16 — the agentic-commerce index page renders the
// stored weekly document from GET /v1/agentic-commerce-index: published
// shares/ranks/changes, the "not enough calls" state, the "pending" state,
// and a load failure. The API never sends counts; the page only formats what
// it is given (percent, percentage points, rank).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgenticCommerceIndexPage } from "./AgenticCommerceIndexPage.tsx";
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

function doc(overrides: Partial<AgenticCommerceIndex>): AgenticCommerceIndex {
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AgenticCommerceIndexPage", () => {
  it("renders a published week: ranks, shares, signed changes, other, and the published method", async () => {
    const fetchFn = stubFetch(doc({}));
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
    // Null mode/budget breakdowns explain themselves rather than vanishing.
    expect(screen.getByText(/carried mode information/)).toBeTruthy();
    expect(screen.getByText(/carried budget information/)).toBeTruthy();
  });

  it("shows the not-enough-calls message instead of numbers", async () => {
    stubFetch(
      doc({
        status: "insufficient_data",
        message: "Not enough calls this period to publish.",
        tools: null,
        categories: null,
        pricing: null,
      }),
    );
    render(<AgenticCommerceIndexPage />);
    expect(await screen.findByText("Not enough calls this period to publish.")).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("explains the pending state before the first publication", async () => {
    stubFetch(
      doc({
        status: "pending",
        message: "The first index has not been published yet. It is computed after each week closes.",
        period_start: null,
        period_end: null,
        comparison_period_start: null,
        comparison_period_end: null,
        generated_at: null,
        tools: null,
        categories: null,
        pricing: null,
      }),
    );
    render(<AgenticCommerceIndexPage />);
    expect(await screen.findByText("Not published yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the static explanation and offers a retry when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<AgenticCommerceIndexPage />);
    await waitFor(() => expect(screen.getByText("This week's figures are not shown here right now")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByText(/publishes no counts/)).toBeTruthy();
  });
});
