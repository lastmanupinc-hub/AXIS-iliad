/**
 * @vitest-environment happy-dom
 */

// WO-P7 — Program Runner: program picker (live GET /v1/programs catalog) ->
// target-project picker (GET /v1/projects when signed in; the anon guest
// project when not) -> options (lite mode, per-output selection — hidden
// for "search", which the server doesn't support narrowing) -> run ->
// honest staged status -> results panel with a jump-link into the Artifact
// Explorer. The 401/402 handling mirrors AnalyzePage's established contract
// (client-side pre-check for anonymous + pro program, live pricing on a
// real 402) — broad App-level integration (deep link, sidebar entry) lives
// in app-routing.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RunnerPage } from "./RunnerPage.tsx";
import type { SnapshotResponse } from "../api.ts";

/** Fetch stub routed by URL substring: [match, body, status?][] (first hit
 *  wins — the convention already used by AnalyzePage.test.tsx/app-routing.test.tsx). */
function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
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

const CATALOG = {
  programs: [
    { name: "search", outputs: ["context-map.json", "architecture-summary.md"], generator_count: 2 },
    { name: "skills", outputs: ["AGENTS.md", "CLAUDE.md"], generator_count: 2 },
    { name: "theme", outputs: ["theme.css", "design-tokens.json"], generator_count: 2 },
    { name: "deploy", outputs: ["deploy/Dockerfile", "deploy/render.yaml"], generator_count: 2 },
  ],
  total_generators: 8,
};

/** Type-complete SnapshotResponse fixture — RunnerPage only reads a handful
 *  of fields off it, but the prop is typed as the real thing. */
function makeAnonResult(): SnapshotResponse {
  return {
    snapshot_id: "snap_anon",
    project_id: "proj_anon",
    status: "ready",
    context_map: {
      version: "1",
      snapshot_id: "snap_anon",
      project_id: "proj_anon",
      generated_at: "2026-07-07T00:00:00Z",
      project_identity: { name: "guest-repo", type: "web_application", primary_language: "TypeScript", description: null },
      structure: { total_files: 1, total_directories: 1, total_loc: 10, file_tree_summary: [], top_level_layout: [] },
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
      entry_points: [],
      routes: [],
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
      ai_context: { project_summary: "A guest fixture.", key_abstractions: [], conventions: [], warnings: [] },
    },
    repo_profile: {
      version: "1",
      project: { name: "guest-repo", type: "web_application", primary_language: "TypeScript" },
      structure_summary: { total_files: 1, total_directories: 1, total_loc: 10, top_level_dirs: [] },
      health: {
        has_readme: true, has_tests: false, test_file_count: 0, has_ci: false, has_lockfile: true,
        has_typescript: true, has_linter: false, has_formatter: false, dependency_count: 0,
        dev_dependency_count: 0, architecture_patterns: [], separation_score: 0.5,
      },
      goals: null,
    },
    generated_files: [],
  };
}

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("RunnerPage — program catalog (1. Choose a program)", () => {
  it("renders the live GET /v1/programs catalog with Free/Pro badges", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    render(<RunnerPage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    expect(screen.getByText("Theme & Design")).toBeTruthy();
    expect(screen.getAllByText("Free").length).toBe(2); // search, skills
    expect(screen.getAllByText("Pro").length).toBe(2); // theme, deploy
  });

  it("shows a retry option when the catalog fails to load, and retry re-fetches", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: false, status: 500, json: async () => ({ error: "boom" }), text: async () => JSON.stringify({ error: "boom" }), headers: { get: () => null } };
      }
      return { ok: true, status: 200, json: async () => CATALOG, text: async () => "", headers: { get: () => null } };
    }) as unknown as typeof fetch);

    render(<RunnerPage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await screen.findByText("boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
  });

  it("preselects the program named in the URL once the catalog confirms it's real (#run/:program)", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    render(<RunnerPage initialProgram="theme" loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Run Theme & Design/ })).toBeTruthy());
  });

  it("silently ignores an unknown program name in the URL (never a crash)", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    const { container } = render(<RunnerPage initialProgram="not-a-real-program" loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Run / })).toBeNull();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

describe("RunnerPage — target project picker (2. Choose a project)", () => {
  it("anonymous, no guest project: shows the empty state and its Analyze CTA", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    const onNavigate = vi.fn();
    render(<RunnerPage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={noop} />);

    await screen.findByText("No projects yet");
    fireEvent.click(screen.getByRole("button", { name: "Analyze a repo" }));
    expect(onNavigate).toHaveBeenCalledWith("analyze");
  });

  it("anonymous with a guest project: offers only that project (synchronously, no network round trip) and nudges sign-in", () => {
    stubFetch([["/v1/programs", CATALOG]]);
    const onRequireLogin = vi.fn();
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={onRequireLogin} />);

    expect(screen.getByRole("option", { name: "guest-repo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onRequireLogin).toHaveBeenCalledWith("save-project");
  });

  it("logged in: lists projects from GET /v1/projects and preselects the current one", async () => {
    stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/projects", {
        projects: [
          { project_id: "proj_a", name: "acme/a", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_a", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 3 }, snapshot_count: 1 },
          { project_id: "proj_b", name: "acme/b", github_url: null, created_at: "2026-07-02T00:00:00Z", latest_snapshot: { snapshot_id: "snap_b", status: "ready", created_at: "2026-07-02T00:00:00Z", file_count: 5 }, snapshot_count: 1 },
        ],
        total: 2,
      }],
    ]);
    render(<RunnerPage loggedIn currentProjectId="proj_b" anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe("proj_b"));
    expect(screen.getByRole("option", { name: "acme/a" })).toBeTruthy();
  });

  it("a project-list load failure shows a Callout with retry — not a crash", async () => {
    stubFetch([["/v1/programs", CATALOG], ["/v1/projects", { error: "boom" }, 500]]);
    render(<RunnerPage loggedIn currentProjectId={null} anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("RunnerPage — running a program (free + honest staged status + results)", () => {
  it("free program against the anon guest project: honest staged status, then a results panel with a working jump-link into the Artifact Explorer", async () => {
    const fetchFn = stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/search/export", { program: "search", files: [{ path: "context-map.json", content: "{}", content_type: "application/json", program: "search", description: "context map" }], skipped: [] }],
    ]);
    const onNavigate = vi.fn();
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={onNavigate} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);

    fireEvent.click(screen.getByRole("button", { name: /Run Search Context/ }));
    // The honest staged status is visible synchronously, before the mocked
    // fetch's promise even resolves — proves it isn't a post-hoc label.
    expect(screen.getByText(/Request sent — waiting for the server/)).toBeTruthy();

    await waitFor(() => expect(screen.getByText(/Generated 1 file from Search Context/)).toBeTruthy());
    expect(screen.getByText("context-map.json")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View in Artifact Explorer →" }));
    expect(onNavigate).toHaveBeenCalledWith("project-artifacts", { id: "proj_anon" });

    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/search/export"))!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ snapshot_id: "snap_anon" }); // no outputs override sent (search ignores it server-side)
  });

  it("'Run another program' clears the results panel so a second run can start fresh", async () => {
    stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/search/export", { program: "search", files: [{ path: "context-map.json", content: "{}", content_type: "application/json", program: "search", description: "context map" }], skipped: [] }],
    ]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Run Search Context/ }));
    await waitFor(() => expect(screen.getByText(/Generated 1 file/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Run another program" }));
    expect(screen.queryByText(/Generated 1 file/)).toBeNull();
  });

  it("a non-billing run failure shows a Callout with retry — not a raw error dump", async () => {
    stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/search/export", { error: "boom" }, 500],
    ]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Run Search Context/ }));

    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  // H-Phase-A cycle 6: PROGRAM_DEFS (components/ProgramLauncher.tsx) is a
  // hand-maintained list the live GET /v1/programs catalog can outpace — the
  // picker already falls back to titleCaseProgram(p.name) for a program
  // catalog-only, but the Run button used to go silently disabled with
  // neither the "pick a project"/"no snapshot" hint applying, no
  // explanation at all.
  it("a catalog program not (yet) in PROGRAM_DEFS shows an honest reason instead of a silently-disabled Run button", async () => {
    const CATALOG_WITH_DRIFT = {
      programs: [...CATALOG.programs, { name: "future-program", outputs: ["x.md"], generator_count: 1 }],
      total_generators: 9,
    };
    stubFetch([["/v1/programs", CATALOG_WITH_DRIFT]]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Future Program")).toBeTruthy());
    fireEvent.click(screen.getByText("Future Program").closest("button")!);

    const runButton = screen.getByRole("button", { name: /Run future-program/ }) as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);
    expect(screen.getByText(/isn't runnable from here yet/)).toBeTruthy();
  });
});

describe("RunnerPage — pro-program gating (WO-P7 acceptance)", () => {
  it("anonymous selecting a pro program: client-side pre-check blocks the run with NO network call and no fabricated price", async () => {
    const fetchFn = stubFetch([["/v1/programs", CATALOG]]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Theme & Design")).toBeTruthy());
    fireEvent.click(screen.getByText("Theme & Design").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Run Theme & Design/ }));

    await waitFor(() => expect(screen.getAllByText("🔒 Pro Programs Required").length).toBeGreaterThan(0));
    expect(screen.queryByText(/\$/)).toBeNull();

    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("theme/generate"))).toBe(false);
  });

  it("logged-in free-tier user hitting a paid program sees the REAL 402 payload rendered with price + lite-mode option — not an error dump", async () => {
    stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/projects", { projects: [{ project_id: "proj_a", name: "acme/a", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_a", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 3 }, snapshot_count: 1 }], total: 1 }],
      ["/v1/theme/generate", {
        error: "theme requires a paid plan or per-call payment.",
        error_code: "TIER_REQUIRED",
        price_per_call: "$0.50",
        pricing: {
          standard: { amount_cents: 50, currency: "usd", description: "Full theme run" },
          lite: { amount_cents: 15, currency: "usd", description: "Lite theme run" },
        },
      }, 402],
    ]);
    render(<RunnerPage loggedIn currentProjectId="proj_a" anonResult={null} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Theme & Design")).toBeTruthy());
    fireEvent.click(screen.getByText("Theme & Design").closest("button")!);
    await waitFor(() => expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe("proj_a"));

    fireEvent.click(screen.getByRole("button", { name: /Run Theme & Design/ }));

    // Both the inline card and the UpsellModal render a pricing line (getAllByText).
    await waitFor(() => expect(screen.getAllByText(/\$0\.50/).length).toBeGreaterThan(0));
    expect(screen.getByText(/This run would cost/)).toBeTruthy();
    // The lite-mode option is right there on the same page (not a dead end).
    expect(screen.getByLabelText(/Lite mode/i)).toBeTruthy();
    expect(screen.queryByText(/error_code|TIER_REQUIRED/)).toBeNull(); // never a raw error dump
  });
});

describe("RunnerPage — options panel (3. Options)", () => {
  it("lite mode sends X-Agent-Mode: lite", async () => {
    const fetchFn = stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/search/export", { program: "search", files: [], skipped: [] }],
    ]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);
    fireEvent.click(screen.getByLabelText(/Lite mode/i));
    fireEvent.click(screen.getByRole("button", { name: /Run Search Context/ }));

    await waitFor(() => expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/v1/search/export"))).toBe(true));
    const call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/search/export"))!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Agent-Mode"]).toBe("lite");
  });

  it("narrowing the output selection sends the ProgramRequest `outputs` override; selecting all omits it", async () => {
    const fetchFn = stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/skills/generate", { program: "skills", files: [], skipped: [] }],
    ]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Skills & Agents")).toBeTruthy());
    fireEvent.click(screen.getByText("Skills & Agents").closest("button")!);

    // Scoped to the "3. Options" card: the "Skills & Agents" CATALOG CARD's
    // own accessible name also contains "AGENTS.md" (its description text),
    // so an unscoped getByRole("button", {name: /AGENTS\.md/}) would match
    // both it and the output badge — within() disambiguates by container.
    await waitFor(() => expect(screen.getByText("Outputs", { exact: false })).toBeTruthy());
    const optionsCard = screen.getByText(/^3\. Options$/).closest(".card") as HTMLElement;
    fireEvent.click(within(optionsCard).getByRole("button", { name: /CLAUDE\.md/ })); // deselect one of the two outputs

    fireEvent.click(screen.getByRole("button", { name: /Run Skills & Agents/ }));
    await waitFor(() => expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/v1/skills/generate"))).toBe(true));

    let call = fetchFn.mock.calls.find(([u]) => String(u).includes("/v1/skills/generate"))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ snapshot_id: "snap_anon", outputs: ["AGENTS.md"] });

    // Re-select everything and run again — outputs is omitted, letting the
    // server use its own default list rather than sending a redundant array.
    fireEvent.click(within(optionsCard).getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /Run Skills & Agents/ }));
    await waitFor(() => expect(fetchFn.mock.calls.filter(([u]) => String(u).includes("/v1/skills/generate")).length).toBe(2));
    call = fetchFn.mock.calls.filter(([u]) => String(u).includes("/v1/skills/generate"))[1];
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ snapshot_id: "snap_anon" });
  });

  it("deselecting every output disables Run rather than sending an empty (and, for paid programs, still billable) request", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Skills & Agents")).toBeTruthy());
    fireEvent.click(screen.getByText("Skills & Agents").closest("button")!);
    await waitFor(() => expect(screen.getByText("Outputs", { exact: false })).toBeTruthy());
    const optionsCard = screen.getByText(/^3\. Options$/).closest(".card") as HTMLElement;

    fireEvent.click(within(optionsCard).getByRole("button", { name: "Clear" }));

    expect(screen.getByText("Select at least one output to run.")).toBeTruthy();
    const runButton = screen.getByRole("button", { name: /Run Skills & Agents/ }) as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);
  });

  it("hides the outputs picker for \"search\" (the one handler that ignores the override) and shows the content-search-index panel instead", async () => {
    stubFetch([["/v1/programs", CATALOG]]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);

    expect(screen.queryByText(/^Outputs/)).toBeNull();
    expect(screen.getByText("Content search index")).toBeTruthy();
  });
});

describe("RunnerPage — content search index (WO-P7: /v1/search/index + /v1/search/query)", () => {
  it("builds the index, shows live stats, then a query renders matches", async () => {
    stubFetch([
      ["/v1/programs", CATALOG],
      ["/v1/search/index", { snapshot_id: "snap_anon", indexed_files: 12, indexed_lines: 3400, indexed_symbols: 88 }],
      ["/v1/search/query", { snapshot_id: "snap_anon", query: "handleRun", total_indexed_lines: 3400, total_indexed_files: 12, results: [{ file_path: "src/RunnerPage.tsx", line_number: 42, content: "async function handleRun() {", rank: 1 }] }],
    ]);
    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);

    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);
    await waitFor(() => expect(screen.getByText("Content search index")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Build content search index" }));
    await waitFor(() => expect(screen.getByText(/12 files/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Content search query"), { target: { value: "handleRun" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.getByText(/async function handleRun/)).toBeTruthy());
  });

  // H-Phase-A bulk sweep: handleQuery had no request-id guard -- an older,
  // slower query response could resolve after a newer one and silently
  // overwrite it, with no visible indication the results didn't match the
  // query text still shown in the input.
  it("an older, slower query response never overwrites a newer one", async () => {
    const resolvers: Array<(body: unknown) => void> = [];
    let queryCallCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/programs")) return { ok: true, status: 200, json: async () => CATALOG, text: async () => "", headers: { get: () => null } } as unknown as Response;
      if (url.includes("/v1/search/index")) return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_anon", indexed_files: 12, indexed_lines: 3400, indexed_symbols: 88 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      if (url.includes("/v1/search/query")) {
        const index = queryCallCount++;
        const body = await new Promise((resolve) => { resolvers[index] = resolve; });
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<RunnerPage loggedIn={false} currentProjectId="proj_anon" anonResult={makeAnonResult()} onNavigate={noop} onRequireLogin={noop} />);
    await waitFor(() => expect(screen.getByText("Search Context")).toBeTruthy());
    fireEvent.click(screen.getByText("Search Context").closest("button")!);
    await waitFor(() => expect(screen.getByText("Content search index")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Build content search index" }));
    await waitFor(() => expect(screen.getByText(/12 files/)).toBeTruthy());

    const input = screen.getByLabelText("Content search query");
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(resolvers[0]).toBeTruthy());

    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(resolvers[1]).toBeTruthy());

    // Newer (second) query's response resolves first.
    resolvers[1]({ snapshot_id: "snap_anon", query: "second", total_indexed_lines: 3400, total_indexed_files: 12, results: [{ file_path: "b.ts", line_number: 1, content: "second-match", rank: 1 }] });
    await waitFor(() => expect(screen.getByText("second-match")).toBeTruthy());

    // Older (first) query's response resolves AFTER -- must be ignored.
    resolvers[0]({ snapshot_id: "snap_anon", query: "first", total_indexed_lines: 3400, total_indexed_files: 12, results: [{ file_path: "a.ts", line_number: 1, content: "first-match", rank: 1 }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("second-match")).toBeTruthy();
    expect(screen.queryByText("first-match")).toBeNull();
  });
});
