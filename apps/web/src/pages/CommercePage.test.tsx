/**
 * @vitest-environment happy-dom
 */

// WO-P9 — Agentic Commerce hub: generates and renders the "agentic-purchasing"
// program's 6 artifacts in-app via the same runProgram(snapshot_id) mechanism
// WO-P7's Program Runner already established (not
// POST /v1/prepare-for-agentic-purchasing — see CommercePage.tsx's own
// doc comment for why that endpoint doesn't fit this context). App-level
// routing/sidebar wiring is covered in app-routing.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommercePage } from "./CommercePage.tsx";
import type { SnapshotResponse } from "../api.ts";

function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    void init;
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

const KIT_FILES = [
  { path: "agent-purchasing-playbook.md", content: "# Playbook\n\nSome guidance.", content_type: "text/markdown", program: "agentic-purchasing", description: "playbook" },
  { path: "negotiation-rules.md", content: "# Rules\n\n| Signal | Weight |\n|---|---|\n| LOC | High |", content_type: "text/markdown", program: "agentic-purchasing", description: "rules" },
  { path: "checkout-flow.md", content: "# Flow\n\n```\nAgent Request → Validate Intent → Confirm\n```", content_type: "text/markdown", program: "agentic-purchasing", description: "flow" },
  { path: "product-schema.json", content: JSON.stringify({ name: "fixture" }), content_type: "application/json", program: "agentic-purchasing", description: "schema" },
  { path: "commerce-registry.json", content: JSON.stringify({ products: [] }), content_type: "application/json", program: "agentic-purchasing", description: "registry" },
  { path: "ap2-interop-samples.json", content: JSON.stringify({ samples: [] }), content_type: "application/json", program: "agentic-purchasing", description: "ap2" },
];

function anonResult(): SnapshotResponse {
  return {
    snapshot_id: "snap_fx",
    project_id: "proj_fx",
    status: "complete",
    context_map: {
      version: "1", snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "2026-07-01T00:00:00Z",
      project_identity: { name: "fixture-repo", type: "web_application", primary_language: "TypeScript", description: null },
      structure: { total_files: 1, total_directories: 1, total_loc: 10, file_tree_summary: [], top_level_layout: [] },
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
      entry_points: [], routes: [],
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
      ai_context: { project_summary: "A fixture.", key_abstractions: [], conventions: [], warnings: [] },
    },
    repo_profile: {
      version: "1", project: { name: "fixture-repo", type: "web_application", primary_language: "TypeScript" },
      structure_summary: { total_files: 1, total_directories: 1, total_loc: 10, top_level_dirs: [] },
      health: { has_readme: true, has_tests: false, test_file_count: 0, has_ci: false, has_lockfile: true, has_typescript: true, has_linter: false, has_formatter: false, dependency_count: 0, dev_dependency_count: 0, architecture_patterns: [], separation_score: 0.5 },
      goals: null,
    },
    generated_files: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let onNavigate: ReturnType<typeof vi.fn>;
let onRequireLogin: ReturnType<typeof vi.fn>;
beforeEach(() => { onNavigate = vi.fn(); onRequireLogin = vi.fn(); });

describe("CommercePage — no project loaded", () => {
  it("anon with no result shows the empty state", () => {
    render(<CommercePage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);
    expect(screen.getByText("No project loaded")).toBeTruthy();
  });

  it("logged-in with zero projects shows the empty state", async () => {
    stubFetch([["/v1/projects", { projects: [], total: 0 }]]);
    render(<CommercePage loggedIn={true} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);
    expect(await screen.findByText("No projects yet")).toBeTruthy();
  });
});

describe("CommercePage — generate flow (anon guest project)", () => {
  it("clicking Generate while signed out calls onRequireLogin instead of round-tripping (every paid program 401s anon callers)", async () => {
    // H-Phase-A cycle 10: the mount-time existence check (checkExisting)
    // fires even for an anon guest project — must be stubbed now that a
    // failed check renders a genuinely different UI than "no kit yet".
    stubFetch([["/generated-files", { snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }]]);
    render(<CommercePage loggedIn={false} currentProjectId={null} anonResult={anonResult()} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    const btn = await screen.findByRole("button", { name: "Generate Purchasing Kit" });
    fireEvent.click(btn);

    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });
});

describe("CommercePage — generate flow (logged in)", () => {
  it("hits the correct /v1/agentic-purchasing/generate URL (not a double-prefixed one) and renders the returned artifacts", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/projects/proj_fx/generated-files")) {
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/agentic-purchasing/generate")) {
        return { ok: true, status: 200, json: async () => ({ program: "agentic-purchasing", files: KIT_FILES, skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = { projects: [{ project_id: "proj_fx", name: "fixture-repo", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_fx", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: { grade: "B" } }, snapshot_count: 1 }], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      void init;
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<CommercePage loggedIn={true} currentProjectId="proj_fx" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    const btn = await screen.findByRole("button", { name: "Generate Purchasing Kit" });
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("Purchasing Playbook")).toBeTruthy());
    // Every artifact section rendered.
    expect(screen.getByText("Negotiation Rules")).toBeTruthy();
    expect(screen.getByText("Checkout Flow")).toBeTruthy();
    expect(screen.getByText("Product Schema")).toBeTruthy();
    expect(screen.getByText("Commerce Registry")).toBeTruthy();
    expect(screen.getByText("AP2 Interop Samples")).toBeTruthy();

    // Locks in the fix for a real bug caught while writing this test: the
    // endpoint string must NOT carry its own "/v1/" prefix (runProgram adds
    // it), or the request silently 404s at "/v1//v1/agentic-purchasing/...".
    const generateCall = fetchFn.mock.calls.find((c) => String(c[0]).includes("agentic-purchasing/generate"));
    expect(String(generateCall![0])).toContain("/v1/agentic-purchasing/generate");
    expect(String(generateCall![0])).not.toContain("/v1//v1/");
  });

  it("a negotiation-rules table renders as a real <table>, not raw pipe text (WO-P9's MarkdownLite table support)", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/generated-files")) {
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: KIT_FILES, skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = { projects: [{ project_id: "proj_fx", name: "fixture-repo", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_fx", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: { grade: "B" } }, snapshot_count: 1 }], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    const { container } = render(<CommercePage loggedIn={true} currentProjectId="proj_fx" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    await waitFor(() => expect(screen.getByText("Negotiation Rules")).toBeTruthy());
    const table = container.querySelector("table.md-lite-table");
    expect(table).toBeTruthy();
    expect(table!.textContent).toContain("LOC");
  });

  it("the checkout-flow arrow-chain renders as connected step pills, labeled as a non-executable visualization", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/generated-files")) {
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: KIT_FILES, skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = { projects: [{ project_id: "proj_fx", name: "fixture-repo", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: null, snapshot_count: 0 }], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<CommercePage loggedIn={true} currentProjectId="proj_fx" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    await waitFor(() => expect(screen.getByText("Checkout Flow — Overview")).toBeTruthy());
    expect(screen.getByText("Agent Request")).toBeTruthy();
    expect(screen.getByText("Validate Intent")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText(/not a live or executable checkout/)).toBeTruthy();
  });

  it("H-Phase-A cycle 10: switching the project <select> twice — an older in-flight check must not overwrite a newer one", async () => {
    const projects = [
      { project_id: "proj_a", name: "project-a", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_a", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: null }, snapshot_count: 1 },
      { project_id: "proj_b", name: "project-b", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_b", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: null }, snapshot_count: 1 },
    ];
    let resolveA!: (v: unknown) => void;
    const pendingA = new Promise((resolve) => { resolveA = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/projects/proj_a/generated-files")) {
        await pendingA; // held open — resolves AFTER proj_b's response below
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_a", project_id: "proj_a", generated_at: "", files: KIT_FILES, skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects/proj_b/generated-files")) {
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_b", project_id: "proj_b", generated_at: "", files: [], skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        return { ok: true, status: 200, json: async () => ({ projects, total: 2 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<CommercePage loggedIn={true} currentProjectId="proj_a" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);
    const select = await screen.findByLabelText("Project") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "proj_b" } });
    await waitFor(() => expect(screen.getByText("No purchasing kit yet")).toBeTruthy());

    resolveA(undefined); // proj_a's stale response lands AFTER proj_b's fresher one
    await new Promise((r) => setTimeout(r, 0));

    // Must still show proj_b's (empty) result, not proj_a's kit re-appearing.
    expect(screen.getByText("No purchasing kit yet")).toBeTruthy();
    expect(screen.queryByText("Purchasing Playbook")).toBeNull();
  });

  it("cycle 28: a stale in-flight /v1/projects response must not overwrite a fresher one (loggedIn flipping, e.g. cross-tab logout)", async () => {
    let resolveStale!: (v: unknown) => void;
    const pendingStale = new Promise((resolve) => { resolveStale = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/projects")) {
        // First call (mounted with loggedIn=true) is held open; the SECOND
        // call (after the loggedIn=false->true cycle below) resolves first.
        if (fetchFn.mock.calls.filter((c) => String(c[0]).includes("/v1/projects")).length === 1) {
          await pendingStale;
          return { ok: true, status: 200, json: async () => ({ projects: [{ project_id: "proj_stale", name: "stale-project", github_url: null, created_at: "", latest_snapshot: null, snapshot_count: 0 }], total: 1 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ projects: [{ project_id: "proj_fresh", name: "fresh-project", github_url: null, created_at: "", latest_snapshot: null, snapshot_count: 0 }], total: 1 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    const { rerender } = render(<CommercePage loggedIn={true} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    rerender(<CommercePage loggedIn={false} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);
    rerender(<CommercePage loggedIn={true} currentProjectId={null} anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    await waitFor(() => expect(screen.getByText("fresh-project")).toBeTruthy());

    resolveStale(undefined); // the FIRST call's stale response lands after the fresh one
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText("fresh-project")).toBeTruthy();
    expect(screen.queryByText("stale-project")).toBeNull();
  });

  it("H-Phase-A cycle 10: a failed existence check shows an honest error, not the same empty state a genuinely-kit-less project gets", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/generated-files")) {
        return { ok: false, status: 500, json: async () => ({ error: "boom" }), text: async () => "boom", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = { projects: [{ project_id: "proj_fx", name: "fixture-repo", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_fx", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: null }, snapshot_count: 1 }], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<CommercePage loggedIn={true} currentProjectId="proj_fx" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    expect(await screen.findByText("Couldn't check for an existing purchasing kit")).toBeTruthy();
    expect(screen.queryByText("No purchasing kit yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate Purchasing Kit" })).toBeNull();
  });

  it("a 402 response shows the UpsellModal instead of a generic error", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/generated-files")) {
        return { ok: true, status: 200, json: async () => ({ snapshot_id: "snap_fx", project_id: "proj_fx", generated_at: "", files: [], skipped: [] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/agentic-purchasing/generate")) {
        const body = { error: "Pro tier required", error_code: "TIER_REQUIRED", blocked_programs: ["agentic-purchasing"], allowed_programs: ["search", "skills", "debug"] };
        return { ok: false, status: 402, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = { projects: [{ project_id: "proj_fx", name: "fixture-repo", github_url: null, created_at: "2026-07-01T00:00:00Z", latest_snapshot: { snapshot_id: "snap_fx", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 1, compliance_grade: null }, snapshot_count: 1 }], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<CommercePage loggedIn={true} currentProjectId="proj_fx" anonResult={null} onNavigate={onNavigate} onRequireLogin={onRequireLogin} />);

    const btn = await screen.findByRole("button", { name: "Generate Purchasing Kit" });
    fireEvent.click(btn);

    expect(await screen.findByText(/Pro Programs Required/)).toBeTruthy();
  });
});
