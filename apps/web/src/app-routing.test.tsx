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
    expect(shellPage(container)).toBe("home");
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
    expect(shellPage(container)).toBe("home");
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
    expect(shellPage(container)).toBe("analyze");
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
    await waitFor(() => expect(shellPage(container)).toBe("home"));
    // SignUpModal is open — OAuth is the login.
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });

  it("#dashboard without a stored result falls back to Analyze (known route, nothing to show)", async () => {
    window.location.hash = "#dashboard";
    const { container } = render(<App />);
    await waitFor(() => expect(shellPage(container)).toBe("analyze"));
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
    expect(shellPage(container)).toBe("home");
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });
});

// ─── Shared primitives shell integration (WO-F4) ─────────────────

describe("PageFooter in the shell (WO-F4)", () => {
  const PUBLIC_HASHES = ["", "#docs", "#help", "#programs", "#examples", "#qa", "#terms", "#install", "#for-agents", "#tools", "#__kitchen-sink", "#definitely/not/a/page"];

  it("is rendered by the shell on every page, including 404 and the kitchen sink", () => {
    for (const hash of PUBLIC_HASHES) {
      window.location.hash = hash;
      const { container, unmount } = render(<App />);
      const footer = container.querySelector(".ide-footer");
      expect(footer, `footer missing at "${hash || "(home)"}"`).toBeTruthy();
      expect(within(footer as HTMLElement).getByRole("button", { name: "Terms" })).toBeTruthy();
      expect(within(footer as HTMLElement).getByRole("link", { name: "Status" })).toBeTruthy();
      unmount();
    }
  });

  it("footer links navigate through the route table", () => {
    const { container } = render(<App />);
    const footer = container.querySelector(".ide-footer") as HTMLElement;
    fireEvent.click(within(footer).getByRole("button", { name: "Docs" }));
    expect(shellPage(container)).toBe("docs");
    expect(window.location.hash).toBe("#docs");
  });
});

describe("kitchen-sink route in the shell (WO-F4)", () => {
  it("renders the hidden primitives gallery at #__kitchen-sink", () => {
    window.location.hash = "#__kitchen-sink";
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("kitchen-sink");
    expect(screen.getByRole("heading", { name: "Kitchen Sink" })).toBeTruthy();
  });

  it("never appears in the sidebar", () => {
    const { container } = render(<App />);
    const sidebar = within(container.querySelector(".ide-sidebar") as HTMLElement);
    expect(sidebar.queryByRole("button", { name: "Kitchen Sink" })).toBeNull();
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

    await waitFor(() => expect(shellPage(container)).toBe("analyze"));
    expect(localStorage.getItem("axis_last_project_id")).toBeNull();
  });
});

// ─── Anonymous analyze results — no signup gate (WO-P1 H9) ───────
// The build plan's single biggest funnel change: a successful anonymous
// analysis used to be intercepted by the SignUpModal (pendingResultRef) and
// never shown. It must now complete and display immediately, with a
// non-blocking "guest" nudge instead of a gate.

describe("Anonymous analyze completes without a signup gate (WO-P1 H9)", () => {
  it("shows the real result immediately — no SignUpModal — with a guest nudge banner", async () => {
    const fx = makeSnapshotResponse();
    const fetchFn = stubApiFetch([["/v1/github/analyze", fx]]);
    window.location.hash = "#analyze";

    const { container } = render(<App />);
    expect(shellPage(container)).toBe("analyze");

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/octocat/Hello-World" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(shellPage(container)).toBe("dashboard"));

    // The real result is shown — not gated behind a signup popup.
    expect(screen.getByText("fixture-repo")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /GitHub/i })).toBeNull();

    // The nudge is a point-of-value banner, not a blocking modal.
    expect(screen.getByText(/browsing as a guest/i)).toBeTruthy();
    const signUpButton = screen.getByRole("button", { name: "Sign up free" });
    expect(signUpButton).toBeTruthy();

    // The anon result is cached client-side (no account owns this snapshot).
    const cached = JSON.parse(localStorage.getItem("axis_anon_result") ?? "null");
    expect(cached?.project_id).toBe("proj_fx");
    expect(localStorage.getItem("axis_last_project_id")).toBeNull();

    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/v1/github/analyze"))).toBe(true);
  });

  it("the guest banner's CTA opens the sign-in popup (nudge, not gate)", async () => {
    localStorage.setItem("axis_anon_result", JSON.stringify(makeSnapshotResponse()));
    stubApiFetch([
      ["/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }],
    ]);
    window.location.hash = "#dashboard";

    render(<App />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Sign up free" }));

    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });

  it("a logged-in analysis is still owned (persists the project id, no guest banner)", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    const fx = makeSnapshotResponse();
    stubApiFetch([["/v1/github/analyze", fx]]);
    window.location.hash = "#analyze";

    const { container } = render(<App />);

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/octocat/Hello-World" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze GitHub Repo" }));

    await waitFor(() => expect(shellPage(container)).toBe("dashboard"));

    expect(screen.queryByText(/browsing as a guest/i)).toBeNull();
    expect(localStorage.getItem("axis_last_project_id")).toBe("proj_fx");
    expect(localStorage.getItem("axis_anon_result")).toBeNull();
  });
});
