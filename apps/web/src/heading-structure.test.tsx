/**
 * @vitest-environment happy-dom
 */

// H5.1b(e) — every page must have exactly one <h1> (WCAG 2.4.6 / basic
// document-outline hygiene). Confirmed via direct grep that 22 of 28 pages
// (23 counting tools/WebResearchPage) had zero <h1> anywhere before this
// unit, and the app shell supplies none either. This file is the regression
// guard: render each page and assert exactly one level-1 heading exists —
// not "a heading exists somewhere," the actual WCAG requirement.
//
// Pages fixed via a direct <h2>-to-<h1> promotion, or via SectionHeader's
// new level="h1" prop, or (WebResearchPage) via ToolPage's own promoted
// heading — many of those primitives/pages render their title identically
// across loading/error/success branches, so a bare initial render (no fetch
// resolution needed) already carries the h1 in every case.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SnapshotResponse } from "./api.ts";

import { AccountDashboardPage } from "./pages/AccountDashboardPage.tsx";
import { AccountPage } from "./pages/AccountPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { AnalyzePage } from "./pages/AnalyzePage.tsx";
import { ChangelogPage } from "./pages/ChangelogPage.tsx";
import { CommercePage } from "./pages/CommercePage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { McpPage } from "./pages/McpPage.tsx";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { PaidCheckoutPage } from "./pages/PaidCheckoutPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { PlaygroundPage } from "./pages/PlaygroundPage.tsx";
import { ProjectPage } from "./pages/ProjectPage.tsx";
import { ProjectsPage } from "./pages/ProjectsPage.tsx";
import { QAPage } from "./pages/QAPage.tsx";
import { RunnerPage } from "./pages/RunnerPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { StatusPage } from "./pages/StatusPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { UsagePage } from "./pages/UsagePage.tsx";
import { WebResearchPage } from "./pages/tools/WebResearchPage.tsx";

const noop = () => {};

function makeSnapshotResponse(): SnapshotResponse {
  return {
    snapshot_id: "snap_fx",
    project_id: "proj_fx",
    status: "complete",
    context_map: {
      version: "1",
      snapshot_id: "snap_fx",
      project_id: "proj_fx",
      generated_at: "2026-07-07T00:00:00Z",
      project_identity: { name: "fixture-repo", type: "web_application", primary_language: "TypeScript", description: null },
      structure: { total_files: 1, total_directories: 1, total_loc: 10, file_tree_summary: [], top_level_layout: [] },
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
      entry_points: [],
      routes: [],
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
      ai_context: { project_summary: "A fixture.", key_abstractions: [], conventions: [], warnings: [] },
    },
    repo_profile: {
      version: "1",
      project: { name: "fixture-repo", type: "web_application", primary_language: "TypeScript" },
      structure_summary: { total_files: 1, total_directories: 1, total_loc: 10, top_level_dirs: [] },
      health: {
        has_readme: true, has_tests: false, test_file_count: 0, has_ci: false, has_lockfile: true,
        has_typescript: true, has_linter: false, has_formatter: false, dependency_count: 0,
        dev_dependency_count: 0, architecture_patterns: [], separation_score: 0.5,
      },
      goals: null,
    },
    generated_files: [{ path: "AGENTS.md", program: "skills", description: "agent guide" }],
  };
}

beforeEach(() => {
  localStorage.clear();
  // A generic, quickly-resolving stub — these tests assert on whatever
  // render state is present synchronously (all fixed branches carry the
  // h1), not on a specific loaded-data shape.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
    headers: { get: () => null },
  }) as unknown as Response));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Every one of these pages had zero <h1> in the whole app before H5.1b(e). */
describe("Every page has exactly one <h1> (H5.1b(e))", () => {
  it("AccountDashboardPage", () => {
    render(<AccountDashboardPage onOpenProject={noop} onNavigate={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("AccountPage", () => {
    render(<AccountPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("AdminPage", async () => {
    // Its own loading spinner (unfixed, correctly — that branch never had a
    // title at all) shows first. The generic {} stub crashes its success
    // branch (a real, multi-endpoint response shape this test isn't trying
    // to fully model) — force its error branch instead, which does carry
    // the promoted h1 (confirmed directly in the component).
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "fixture failure" }),
      text: async () => "fixture failure",
      headers: { get: () => null },
    }) as unknown as Response));
    render(<AdminPage />);
    expect(await screen.findAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("AnalyzePage", () => {
    render(<AnalyzePage onComplete={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ChangelogPage", () => {
    render(<ChangelogPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("CommercePage", () => {
    render(<CommercePage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("DocsPage", () => {
    render(<DocsPage onNavigate={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("HelpPage", () => {
    render(<HelpPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("McpPage", () => {
    render(<McpPage onNavigate={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("MyAnalyticsPage", () => {
    render(<MyAnalyticsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("NotFoundPage", () => {
    render(<NotFoundPage badHash="nope" destinations={[{ page: "home", label: "Home", hash: "" }]} onNavigate={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PaidCheckoutPage", async () => {
    // Its "loading" step (unfixed, correctly — never had a title) shows
    // first; wait for the stubbed getPaidConfig() to settle into "form" or
    // "unavailable", both of which carry the promoted h1.
    render(<PaidCheckoutPage />);
    expect(await screen.findAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PlansPage", async () => {
    // Same shape: an untitled "Loading plans..." spinner first.
    render(<PlansPage loggedIn={false} onSelectPlan={noop} />);
    expect(await screen.findAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PlaygroundPage", () => {
    render(<PlaygroundPage loggedIn={false} onRequireLogin={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ProjectPage", () => {
    render(
      <ProjectPage
        result={makeSnapshotResponse()}
        loggedIn={false}
        onSnapshotDeleted={noop}
        onProjectDeleted={noop}
        onNeedCredits={noop}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ProjectsPage", () => {
    render(<ProjectsPage onOpenProject={noop} onReanalyze={noop} onAnalyze={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("QAPage", () => {
    render(<QAPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("RunnerPage", () => {
    render(<RunnerPage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("SettingsPage", () => {
    render(<SettingsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("StatusPage", () => {
    render(<StatusPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("TermsPage", () => {
    render(<TermsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("UsagePage", () => {
    render(<UsagePage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("tools/WebResearchPage (via ToolPage's promoted heading)", () => {
    render(<WebResearchPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

/** The pages that already had a genuine <h1> before this unit — confirm they
 *  still have exactly one (no accidental duplicate introduced by the
 *  SectionHeader `level` prop change, which several other pages also use for
 *  secondary in-page sections that must stay <h2>; AccountDashboardPage's
 *  "Recent projects"/"Quick actions" SectionHeaders are the closest example
 *  of that risk, though on a different page). KitchenSinkPage is a hidden
 *  dev-aid route, not a real user-facing page — excluded. */
describe("Pages that already had a real <h1> stay at exactly one", () => {
  it("HomePage", async () => {
    const { HomePage } = await import("./pages/HomePage.tsx");
    render(<HomePage onAnalyze={noop} onRequireLogin={noop} onNavigate={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ExamplesPage", async () => {
    const { ExamplesPage } = await import("./pages/ExamplesPage.tsx");
    render(<ExamplesPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ForAgentsPage", async () => {
    const { ForAgentsPage } = await import("./pages/ForAgentsPage.tsx");
    render(<ForAgentsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("ProgramsPage", async () => {
    const { ProgramsPage } = await import("./pages/ProgramsPage.tsx");
    render(<ProgramsPage onAnalyze={noop} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
