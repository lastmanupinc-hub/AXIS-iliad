/**
 * @vitest-environment happy-dom
 */

// WO-F2 route table + 404 — App-level integration: deep links, hashchange
// navigation (browser Back/Forward), unknown-hash 404 (never a silent
// fallback to the landing page), table-derived sidebar/shortcuts, and the
// preserved auth-gate semantics.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";
import type { SnapshotResponse } from "./api";

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.location.hash = "";
  stubMatchMedia();
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
  window.location.hash = "";
  document.documentElement.removeAttribute("data-theme");
});

/** The page the shell is showing (route id on the ide-shell wrapper). */
function shellPage(container: HTMLElement): string | null {
  return container.querySelector(".ide-shell")?.getAttribute("data-shell-page") ?? null;
}

/** Simulate a URL-bar/back/forward hash change. (happy-dom does not reliably
 *  fire hashchange on assignment, so dispatch explicitly; the listener
 *  deduplicates if the environment also fired one.) */
function fireHash(hash: string) {
  window.location.hash = hash;
  fireEvent(window, new Event("hashchange"));
}

describe("App routing (WO-F2)", () => {
  it("renders the landing page at the empty hash", () => {
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("upload");
  });

  it("deep link: #docs renders the Docs page on first load", () => {
    window.location.hash = "#docs";
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("docs");
  });

  it("unknown hash renders the 404 page and reports the bad hash — not upload", () => {
    window.location.hash = "#definitely/not/a/page";
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("not-found");
    const main = within(container.querySelector(".ide-main") as HTMLElement);
    expect(main.getByText("404")).toBeTruthy();
    expect(main.getByText(/definitely\/not\/a\/page/)).toBeTruthy();
  });

  it("hashchange navigates between pages (Back/Forward safe)", () => {
    const { container } = render(<App />);
    fireHash("#help");
    expect(shellPage(container)).toBe("help");
    fireHash("#qa");
    expect(shellPage(container)).toBe("qa");
    fireHash(""); // browser Back to the landing
    expect(shellPage(container)).toBe("upload");
  });

  it("hashchange to an unknown hash lands on 404, and Back recovers", () => {
    const { container } = render(<App />);
    fireHash("#no-such-page");
    expect(shellPage(container)).toBe("not-found");
    fireHash("#docs");
    expect(shellPage(container)).toBe("docs");
  });

  it("sidebar items derive from the route table and set the hash", () => {
    const { container } = render(<App />);
    const sidebar = within(container.querySelector(".ide-sidebar") as HTMLElement);
    fireEvent.click(sidebar.getByRole("button", { name: "Docs" }));
    expect(shellPage(container)).toBe("docs");
    expect(window.location.hash).toBe("#docs");
  });

  it("404 quick links navigate out", () => {
    window.location.hash = "#nope";
    const { container } = render(<App />);
    const main = within(container.querySelector(".ide-main") as HTMLElement);
    fireEvent.click(main.getByRole("button", { name: "Analyze" }));
    expect(shellPage(container)).toBe("upload");
  });

  it("404 search finds pages by label and navigates", () => {
    window.location.hash = "#missing-page";
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText("Search pages"), { target: { value: "doc" } });
    const main = within(container.querySelector(".ide-main") as HTMLElement);
    fireEvent.click(main.getByRole("button", { name: "Go to Docs" }));
    expect(shellPage(container)).toBe("docs");
    expect(window.location.hash).toBe("#docs");
  });

  it("auth-only deep link (#account) bounces to the landing page with the sign-in popup", async () => {
    window.location.hash = "#account";
    const { container } = render(<App />);
    await waitFor(() => expect(shellPage(container)).toBe("upload"));
    // SignUpModal is open — OAuth is the login.
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });

  it("#dashboard without a stored result falls back to Analyze (known route, nothing to show)", async () => {
    window.location.hash = "#dashboard";
    const { container } = render(<App />);
    await waitFor(() => expect(shellPage(container)).toBe("upload"));
  });

  it("Ctrl+5 shortcut derives from the table (Docs)", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "5", ctrlKey: true });
    expect(shellPage(container)).toBe("docs");
  });

  it("Ctrl+2 falls back to Programs when no analysis result exists", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(shellPage(container)).toBe("programs");
  });

  it("Ctrl+3 (Plans, auth-only) while signed out opens the sign-in popup and stays put", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "3", ctrlKey: true });
    expect(shellPage(container)).toBe("upload");
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });
});

// ─── Multi-project state (WO-F3) ─────────────────────────────────
// localStorage keeps only `axis_last_project_id` (server restores the rest)
// plus a client-side anon-results cache; the pre-WO-F3 `axis_last_result`
// blob migrates on first load.

/** Type-complete SnapshotResponse fixture (DashboardPage renders all of it). */
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

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit wins). */
function stubApiFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Multi-project state (WO-F3)", () => {
  it("migrates the legacy result blob to the last-project pointer when signed in", () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    localStorage.setItem("axis_last_result", JSON.stringify(makeSnapshotResponse()));

    render(<App />);

    expect(localStorage.getItem("axis_last_project_id")).toBe("proj_fx");
    expect(localStorage.getItem("axis_last_result")).toBeNull();
    expect(localStorage.getItem("axis_anon_result")).toBeNull();
  });

  it("migrates the legacy result blob to the anon cache when signed out", () => {
    localStorage.setItem("axis_last_result", JSON.stringify(makeSnapshotResponse()));

    render(<App />);

    expect(localStorage.getItem("axis_anon_result")).toBeTruthy();
    expect(localStorage.getItem("axis_last_result")).toBeNull();
    expect(localStorage.getItem("axis_last_project_id")).toBeNull();
  });

  it("#dashboard restores from the anon-results cache without a context round-trip", async () => {
    localStorage.setItem("axis_anon_result", JSON.stringify(makeSnapshotResponse()));
    stubApiFetch([
      ["/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }],
    ]);
    window.location.hash = "#dashboard";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("dashboard");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/context"))).toBe(false);
  });

  it("#dashboard with a last-project pointer (signed in) rebuilds the result from the server", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    localStorage.setItem("axis_last_project_id", "proj_fx");
    const fx = makeSnapshotResponse();
    stubApiFetch([
      ["/v1/projects/proj_fx/context", { snapshot_id: "snap_fx", context_map: fx.context_map, repo_profile: fx.repo_profile }],
      ["/v1/projects/proj_fx/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: fx.generated_files.map((f) => ({ ...f, content: "x", content_type: "text/markdown" })), skipped: [] }],
    ]);
    window.location.hash = "#dashboard";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("dashboard");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
  });

  it("#dashboard drops the pointer and bounces to Analyze when the server says 404", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    localStorage.setItem("axis_last_project_id", "proj_gone");
    stubApiFetch([
      ["/v1/projects/proj_gone/context", { error: "Project not found" }, 404],
      ["/v1/projects/proj_gone/generated-files", { error: "Project not found" }, 404],
    ]);
    window.location.hash = "#dashboard";

    const { container } = render(<App />);

    await waitFor(() => expect(shellPage(container)).toBe("upload"));
    expect(localStorage.getItem("axis_last_project_id")).toBeNull();
  });
});
