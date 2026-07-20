/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 21 — every other loading spinner in this app wraps its
// text in role="status" aria-live="polite" (App.tsx, routes.tsx,
// AccountDashboardPage, CommercePage, DocsPage, McpPage, ProjectsPage,
// RunnerPage, SettingsPage, StatusPage, UsagePage, etc.), but ToolPage —
// the shared shell backing WebResearchPage (and any future tool built on
// it) — was the one place that didn't: a screen-reader user who submits
// the form got no announcement that a run started.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ToolPage } from "./ToolPage.tsx";

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  id: "test-tool",
  name: "Test Tool",
  description: "A tool for testing.",
  pricing: { free: true },
};

describe("ToolPage loading indicator", () => {
  it("announces the loading state via a live region when loading is true", () => {
    render(
      <ToolPage {...BASE_PROPS} loading>
        <div>form</div>
      </ToolPage>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Running");
  });

  it("renders no status region when not loading", () => {
    render(
      <ToolPage {...BASE_PROPS} loading={false}>
        <div>form</div>
      </ToolPage>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
