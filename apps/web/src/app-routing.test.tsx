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

  it("#projects/:id for an id nothing knows about shows an inline not-found state (not a crash, not a bounce)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "Project not found" }),
      text: async () => JSON.stringify({ error: "Project not found" }),
      headers: { get: () => null },
    }) as unknown as Response));
    window.location.hash = "#projects/never-analyzed";
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("project"); // stays put — no silent bounce
    const main = within(container.querySelector(".ide-main") as HTMLElement);
    await main.findByText("Project not found");
  });

  it("Ctrl+5 shortcut derives from the table (Docs)", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "5", ctrlKey: true });
    expect(shellPage(container)).toBe("docs");
  });

  it("Ctrl+2 (Dashboard, auth-only) while signed out opens the sign-in popup and stays put", () => {
    const { container } = render(<App />);
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(shellPage(container)).toBe("home");
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
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
  const PUBLIC_HASHES = ["", "#docs", "#help", "#programs", "#examples", "#qa", "#terms", "#mcp", "#for-agents", "#tools/web-research", "#run", "#__kitchen-sink", "#definitely/not/a/page"];

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

/** Type-complete SnapshotResponse fixture (ProjectPage renders all of it). */
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

  it("#projects/:id restores from the anon-results cache (matching id) without a context round-trip", async () => {
    localStorage.setItem("axis_anon_result", JSON.stringify(makeSnapshotResponse()));
    stubApiFetch([
      ["/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }],
    ]);
    window.location.hash = "#projects/proj_fx";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("project");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/context"))).toBe(false);
  });

  it("#projects/:id for a DIFFERENT id than the cached anon result ignores the cache and fetches the server instead", async () => {
    localStorage.setItem("axis_anon_result", JSON.stringify(makeSnapshotResponse())); // cached: proj_fx
    const other = makeSnapshotResponse();
    other.project_id = "proj_other";
    other.context_map.project_identity.name = "other-repo";
    stubApiFetch([
      ["/v1/projects/proj_other/context", { snapshot_id: "snap_other", context_map: other.context_map, repo_profile: other.repo_profile }],
      ["/v1/projects/proj_other/generated-files", { snapshot_id: "snap_other", project_id: "proj_other", generated_at: "", files: [], skipped: [] }],
    ]);
    window.location.hash = "#projects/proj_other";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("project");
    await waitFor(() => expect(screen.getByText("other-repo")).toBeTruthy());
    expect(screen.queryByText("fixture-repo")).toBeNull();
  });

  it("#projects/:id (signed in) rebuilds the result from the server and stores the last-project pointer", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    const fx = makeSnapshotResponse();
    stubApiFetch([
      ["/v1/projects/proj_fx/context", { snapshot_id: "snap_fx", context_map: fx.context_map, repo_profile: fx.repo_profile }],
      ["/v1/projects/proj_fx/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: fx.generated_files.map((f) => ({ ...f, content: "x", content_type: "text/markdown" })), skipped: [] }],
    ]);
    window.location.hash = "#projects/proj_fx";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("project");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    expect(localStorage.getItem("axis_last_project_id")).toBe("proj_fx");
  });

  it("#projects/:id shows an inline not-found state (not a bounce) on a 404, and drops a matching stored pointer", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    localStorage.setItem("axis_last_project_id", "proj_gone");
    stubApiFetch([
      ["/v1/projects/proj_gone/context", { error: "Project not found" }, 404],
      ["/v1/projects/proj_gone/generated-files", { error: "Project not found" }, 404],
    ]);
    window.location.hash = "#projects/proj_gone";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("project"); // stays put — no silent bounce
    await screen.findByText("Project not found");
    expect(localStorage.getItem("axis_last_project_id")).toBeNull();
  });
});

// ─── Artifact Explorer deep link (WO-P6) ──────────────────────────
// "#projects/:id/artifacts" is a THIRD id-addressable variant of the same
// restore effect "#projects/:id/versions" already used (WO-P5) — the easy
// bug here is adding the route to routes.tsx but forgetting to add its page
// id to App.tsx's restore-effect condition, which would silently leave a
// fresh deep link stuck on "Restoring…" forever. This proves the whole path:
// hash -> restore -> ProjectPage mounts with the Artifacts tab active.

describe("Artifact Explorer deep link (WO-P6)", () => {
  it("#projects/:id/artifacts restores the project and opens the Artifacts tab", async () => {
    const fx = makeSnapshotResponse();
    stubApiFetch([
      ["/v1/projects/proj_fx/context", { snapshot_id: "snap_fx", context_map: fx.context_map, repo_profile: fx.repo_profile }],
      ["/v1/projects/proj_fx/generated-files", {
        snapshot_id: "snap_fx",
        project_id: "proj_fx",
        generated_at: "",
        files: [{ path: "Dockerfile", program: "deploy", description: "container image", content: "FROM node:20", content_type: "text/x-dockerfile" }],
        skipped: [],
      }],
    ]);
    window.location.hash = "#projects/proj_fx/artifacts";

    const { container } = render(<App />);

    expect(shellPage(container)).toBe("project-artifacts");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    // The Artifacts tab (not Overview, the default) is the one showing active content.
    const activeTab = container.querySelector(".tab.active");
    expect(activeTab?.textContent).toContain("Artifacts");

    // ProjectPage fetches its OWN (content-bearing) generated-files list in a
    // separate effect after mounting — a second async step behind the one
    // "fixture-repo" just proved, so these need an async find, not a sync get.
    expect(await screen.findByLabelText("Search artifacts")).toBeTruthy();
    expect(await screen.findByText("container image")).toBeTruthy(); // the Dockerfile row's description — proves ArtifactExplorer got `files`
  });
});

// ─── Account Dashboard → open a project (WO-P3, hash promoted by WO-P5) ──
// #dashboard is login-gated (like #account/#plans); its project cards hand
// off to the ID-addressable "#projects/:id" server-restore path (WO-F3's
// mechanism, keyed on the route param since WO-P5) via App.tsx's handleOpenProject.

describe("Account Dashboard (WO-P3/WO-P5)", () => {
  it("auth-only deep link (#dashboard) bounces to the landing page with the sign-in popup", async () => {
    window.location.hash = "#dashboard";
    const { container } = render(<App />);
    await waitFor(() => expect(shellPage(container)).toBe("home"));
    expect(screen.getByRole("link", { name: /GitHub/i })).toBeTruthy();
  });

  it("clicking a recent-project card opens it on #projects/:id via the server restore path", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    const fx = makeSnapshotResponse();
    stubApiFetch([
      ["/v1/projects/proj_fx/context", { snapshot_id: "snap_fx", context_map: fx.context_map, repo_profile: fx.repo_profile }],
      ["/v1/projects/proj_fx/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: fx.generated_files.map((f) => ({ ...f, content: "x", content_type: "text/markdown" })), skipped: [] }],
      ["/v1/projects", {
        projects: [{
          project_id: "proj_fx",
          name: "fixture-repo",
          github_url: null,
          created_at: "2026-07-01T00:00:00Z",
          latest_snapshot: { snapshot_id: "snap_fx", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: { grade: "B" } },
          snapshot_count: 1,
        }],
        total: 1,
      }],
      ["/v1/account/quota", { rate_limit: {}, authenticated: true, resource_quota: { tier: "paid", snapshots_this_month: 1, max_snapshots_per_month: 200, project_count: 1, max_projects: -1, max_files_per_snapshot: 500 } }],
    ]);
    window.location.hash = "#dashboard";

    const { container } = render(<App />);
    expect(shellPage(container)).toBe("dashboard");
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByText("fixture-repo").closest("button")!);

    await waitFor(() => expect(shellPage(container)).toBe("project"));
    expect(window.location.hash).toBe("#projects/proj_fx");
    await waitFor(() => expect(screen.getAllByText("fixture-repo").length).toBeGreaterThan(0));
  });
});

// ─── Program Runner (WO-P7) ───────────────────────────────────────
// "#run"/"#run/:program" is NOT auth-only (anonymous visitors can run free
// programs against their guest project) — deep link, sidebar entry, and the
// Account Dashboard's "Run a program" quick action all land here. Per-page
// behavior (catalog, project picker, options, 402 gating) is covered in
// pages/RunnerPage.test.tsx; this proves the App-level wiring: route table,
// sidebar nav, and the cross-page navigation callback.

describe("Program Runner (WO-P7)", () => {
  it("#run deep-link renders the Program Runner page (not auth-gated)", () => {
    window.location.hash = "#run";
    const { container } = render(<App />);
    expect(shellPage(container)).toBe("runner");
  });

  it("sidebar 'Program Runner' item navigates to #run", () => {
    const { container } = render(<App />);
    const sidebar = within(container.querySelector(".ide-sidebar") as HTMLElement);
    fireEvent.click(sidebar.getByRole("button", { name: "Program Runner" }));
    expect(shellPage(container)).toBe("runner");
    expect(window.location.hash).toBe("#run");
  });

  it("the Account Dashboard's 'Run a program' quick action opens the Runner", async () => {
    localStorage.setItem("axis_api_key", "__cookie_session__");
    stubApiFetch([
      ["/v1/programs", { programs: [{ name: "search", outputs: ["context-map.json"], generator_count: 1 }], total_generators: 1 }],
      ["/v1/projects", { projects: [], total: 0 }],
      ["/v1/account/quota", { rate_limit: {}, authenticated: true, resource_quota: { tier: "free", snapshots_this_month: 0, max_snapshots_per_month: 10, project_count: 0, max_projects: 3, max_files_per_snapshot: 100 } }],
      ["/v1/account/usage/timeseries", { buckets: [] }],
      ["/v1/account/upgrade-prompt", { prompt: null }],
    ]);
    window.location.hash = "#dashboard";

    const { container } = render(<App />);
    expect(shellPage(container)).toBe("dashboard");
    await waitFor(() => expect(screen.getByText("Run a program")).toBeTruthy());

    fireEvent.click(screen.getByText("Run a program").closest("button")!);

    expect(shellPage(container)).toBe("runner");
    expect(window.location.hash).toBe("#run");
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

    await waitFor(() => expect(shellPage(container)).toBe("project"));
    expect(window.location.hash).toBe("#projects/proj_fx");

    // The real result is shown — not gated behind a signup popup. findBy (retrying):
    // the shell flips to "project" before the page's inner content paints under load.
    expect(await screen.findByText("fixture-repo")).toBeTruthy();
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
    window.location.hash = "#projects/proj_fx";

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

    await waitFor(() => expect(shellPage(container)).toBe("project"));

    expect(screen.queryByText(/browsing as a guest/i)).toBeNull();
    expect(localStorage.getItem("axis_last_project_id")).toBe("proj_fx");
    expect(localStorage.getItem("axis_anon_result")).toBeNull();
  });
});

// ─── Sign-up return-to (WO-P2) ────────────────────────────────────
// A login gate — a nav click on an auth-only item, a deep link straight to
// one, or a page-agnostic "sign up" nudge — must hand the user back to what
// they were doing once sign-in succeeds, not always #account. The in-SPA
// email-signup path (no page reload) exercises the App.tsx/routes.tsx half
// of this end to end; the OAuth-round-trip half (AccountPage's
// finishAuthAndReload) is covered separately in pages.test.tsx.

describe("Sign-up return-to (WO-P2)", () => {
  function stubSignupFetch() {
    return stubApiFetch([
      ["/v1/plans", { plans: [], features: [] }],
      ["/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }],
      ["/v1/accounts", { account: { account_id: "a1", name: "Ada", email: "ada@example.com", tier: "free" }, api_key: { key_id: "k1", raw_key: "axis_newkey", label: "default" } }],
      ["/v1/auth/session", { ok: true }],
    ]);
  }

  function completeEmailSignup() {
    fireEvent.click(screen.getByText("or sign up with email"));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account with email" }));
  }

  afterEach(() => {
    sessionStorage.clear();
    localStorage.removeItem("axis_api_key");
  });

  it("a nav click on an auth-only item remembers the target and lands there after signup — not #account", async () => {
    stubSignupFetch();
    const { container } = render(<App />);

    const sidebar = within(container.querySelector(".ide-sidebar") as HTMLElement);
    fireEvent.click(sidebar.getByRole("button", { name: "Plans" }));
    // nav()'s gate keeps the user put and opens the popup with upgrade-flavored copy.
    expect(shellPage(container)).toBe("home");
    expect(screen.getByRole("heading", { name: "Sign in to upgrade" })).toBeTruthy();

    completeEmailSignup();

    await waitFor(() => expect(shellPage(container)).toBe("plans"));
    expect(window.location.hash).toBe("#plans");
  });

  it("a deep link straight to an auth-only page remembers it and lands there after signup", async () => {
    stubSignupFetch();
    window.location.hash = "#plans";

    const { container } = render(<App />);
    await waitFor(() => expect(shellPage(container)).toBe("home"));

    completeEmailSignup();

    await waitFor(() => expect(shellPage(container)).toBe("plans"));
    expect(window.location.hash).toBe("#plans");
  });

  it("a page-agnostic requireLogin nudge (guest-project banner) returns to the SAME page, not #account", async () => {
    localStorage.setItem("axis_anon_result", JSON.stringify(makeSnapshotResponse()));
    stubSignupFetch();
    window.location.hash = "#projects/proj_fx";

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Sign up free" }));
    expect(screen.getByRole("heading", { name: "Save this project" })).toBeTruthy();

    completeEmailSignup();

    await waitFor(() => expect(window.location.hash).toBe("#projects/proj_fx"));
    expect(shellPage(container)).toBe("project");
  });
});
