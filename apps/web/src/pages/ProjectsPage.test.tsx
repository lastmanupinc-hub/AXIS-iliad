/**
 * @vitest-environment happy-dom
 */

// WO-P11 — Projects/History: the full searchable/sortable list of every
// repo the account has analyzed (GET /v1/projects, no server-side search —
// AccountDashboardPage's own "Recent projects" cards only tease the most
// recent 20; this is the complete list). Row actions: Open, Re-analyze
// (hands the github_url up to the caller, which pre-fills the Analyze
// form — see app-routing.test.tsx for the cross-page wiring), Export ZIP,
// Delete (click-to-arm, no native confirm() — see VersionsTab's established
// DangerButton pattern). App-level auth gate + sidebar entry live in
// app-routing.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectsPage } from "./ProjectsPage.tsx";

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

function project(overrides: Partial<{
  project_id: string; name: string; github_url: string | null; snapshot_count: number;
  status: string; grade: string; created_at: string;
}> = {}) {
  const o = {
    project_id: "proj_1", name: "fixture-repo", github_url: "https://github.com/octocat/fixture-repo",
    snapshot_count: 3, status: "ready", grade: "A", created_at: "2026-07-01T00:00:00Z", ...overrides,
  };
  return {
    project_id: o.project_id,
    name: o.name,
    github_url: o.github_url,
    created_at: o.created_at,
    latest_snapshot: { snapshot_id: `snap_${o.project_id}`, status: o.status, created_at: o.created_at, file_count: 10, compliance_grade: { grade: o.grade } },
    snapshot_count: o.snapshot_count,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let onOpenProject: ReturnType<typeof vi.fn>;
let onReanalyze: ReturnType<typeof vi.fn>;
let onAnalyze: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onOpenProject = vi.fn();
  onReanalyze = vi.fn();
  onAnalyze = vi.fn();
});

describe("ProjectsPage — listing", () => {
  it("renders the account's projects with status, grade, snapshot count, and last-analyzed date", async () => {
    stubFetch([["/v1/projects", { projects: [project()], total: 1 }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);

    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    expect(screen.getByText("ready")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("https://github.com/octocat/fixture-repo")).toBeTruthy();
  });

  it("shows the zero-project empty state with an Analyze CTA", async () => {
    stubFetch([["/v1/projects", { projects: [], total: 0 }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);

    await waitFor(() => expect(screen.getByText("No projects yet")).toBeTruthy());
    // Two "Analyze a repo" CTAs legitimately coexist on the empty state: the
    // section header's action button (present on every render) and the
    // EmptyState's own cta. Either firing onAnalyze proves the contract.
    const buttons = screen.getAllByRole("button", { name: "Analyze a repo" });
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it("shows an honest error Callout when the list fails to load", async () => {
    stubFetch([["/v1/projects", { error: "boom" }, 500]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);

    expect(await screen.findByText("Couldn't load your projects")).toBeTruthy();
  });

  it("search filters by name and by URL", async () => {
    stubFetch([["/v1/projects", {
      projects: [project({ project_id: "proj_1", name: "alpha-repo" }), project({ project_id: "proj_2", name: "beta-repo", github_url: "https://github.com/octocat/zzz" })],
      total: 2,
    }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("alpha-repo")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "zzz" } });
    expect(screen.queryByText("alpha-repo")).toBeNull();
    expect(screen.getByText("beta-repo")).toBeTruthy();
  });

  it("sorting by name orders the list alphabetically", async () => {
    stubFetch([["/v1/projects", {
      projects: [project({ project_id: "proj_1", name: "zeta-repo" }), project({ project_id: "proj_2", name: "alpha-repo" })],
      total: 2,
    }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("zeta-repo")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Sort projects"), { target: { value: "name" } });
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(within(rows[0]).getByText("alpha-repo")).toBeTruthy();
    expect(within(rows[1]).getByText("zeta-repo")).toBeTruthy();
  });
});

describe("ProjectsPage — row actions", () => {
  it("Open calls onOpenProject with the project id", async () => {
    stubFetch([["/v1/projects", { projects: [project()], total: 1 }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenProject).toHaveBeenCalledWith("proj_1");
  });

  it("Re-analyze hands the github_url up to the caller (pre-fills the Analyze form one level up)", async () => {
    stubFetch([["/v1/projects", { projects: [project()], total: 1 }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }));
    expect(onReanalyze).toHaveBeenCalledWith("https://github.com/octocat/fixture-repo");
  });

  it("a project with no github_url (upload-created) has no Re-analyze button", async () => {
    stubFetch([["/v1/projects", { projects: [project({ github_url: null })], total: 1 }]]);
    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    expect(screen.queryByRole("button", { name: "Re-analyze" })).toBeNull();
  });

  it("Delete is click-to-arm (no native confirm) and refetches the list on success", async () => {
    let deleteCalled = false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/projects/proj_1") && init?.method === "DELETE") {
        deleteCalled = true;
        return { ok: true, status: 200, json: async () => ({ deleted: true, project_id: "proj_1", deleted_snapshots: 3 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const body = deleteCalled ? { projects: [], total: 0 } : { projects: [project()], total: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    // First click only arms — no delete request fired yet, row still present.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteCalled).toBe(false);
    expect(screen.getByText("fixture-repo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => expect(screen.getByText("No projects yet")).toBeTruthy());
    expect(deleteCalled).toBe(true);
  });

  it("Export ZIP shows a busy label while in flight", async () => {
    let resolveExport!: () => void;
    const exportPromise = new Promise<void>((resolve) => { resolveExport = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/export")) {
        await exportPromise;
        return { ok: true, status: 200, blob: async () => new Blob(["zip"]), headers: { get: (h: string) => (h === "content-disposition" ? 'attachment; filename="x.zip"' : null) } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        return { ok: true, status: 200, json: async () => ({ projects: [project()], total: 1 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Export ZIP" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Zipping..." })).toBeTruthy());
    resolveExport();
    await waitFor(() => expect(screen.getByRole("button", { name: "Export ZIP" })).toBeTruthy());
  });

  // H-Phase-A bulk sweep: deletingId/exportingId used to be a single string,
  // so a second row's concurrent action silently stole the busy flag from the
  // first row — its button would re-enable and show its idle label while its
  // own request was still genuinely in flight, letting a user fire a
  // duplicate action on it. Now a Set, so both rows track their own busy
  // state independently.
  it("exporting one row does not clear a DIFFERENT row's own busy state", async () => {
    const resolvers: Record<string, () => void> = {};
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const idMatch = url.match(/\/v1\/projects\/(proj_\d)\/export/);
      if (idMatch) {
        const id = idMatch[1];
        await new Promise<void>((resolve) => { resolvers[id] = resolve; });
        return { ok: true, status: 200, blob: async () => new Blob(["zip"]), headers: { get: (h: string) => (h === "content-disposition" ? 'attachment; filename="x.zip"' : null) } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        return {
          ok: true, status: 200,
          json: async () => ({ projects: [project({ project_id: "proj_1", name: "alpha-repo" }), project({ project_id: "proj_2", name: "beta-repo" })], total: 2 }),
          text: async () => "", headers: { get: () => null },
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(screen.getByText("alpha-repo")).toBeTruthy());

    const rows = screen.getAllByRole("row").slice(1);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Export ZIP" }));
    await waitFor(() => expect(resolvers.proj_1).toBeTruthy());
    expect(within(rows[0]).getByRole("button", { name: "Zipping..." })).toBeTruthy();

    // Start a SECOND row's export while the first is still in flight.
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Export ZIP" }));
    await waitFor(() => expect(resolvers.proj_2).toBeTruthy());

    // The first row must still show its own busy state -- not silently
    // reverted to idle by the second row's action starting.
    expect(within(rows[0]).getByRole("button", { name: "Zipping..." })).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: "Zipping..." })).toBeTruthy();

    resolvers.proj_1();
    await waitFor(() => expect(within(rows[0]).getByRole("button", { name: "Export ZIP" })).toBeTruthy());
    // Second row's own busy state is untouched by the first row's completion.
    expect(within(rows[1]).getByRole("button", { name: "Zipping..." })).toBeTruthy();

    resolvers.proj_2();
    await waitFor(() => expect(within(rows[1]).getByRole("button", { name: "Export ZIP" })).toBeTruthy());
  });

  // H-Phase-A bulk sweep: load() had no request-id guard against its own
  // stale in-flight responses -- an OLDER reload (triggered by an earlier
  // delete) that happens to resolve AFTER a NEWER reload (triggered by a
  // later delete) used to silently overwrite the newer, more-correct state.
  it("an older, slower load() response never overwrites a newer one that already resolved", async () => {
    const listResolvers: Array<() => void> = [];
    let listCallCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.match(/\/v1\/projects\/proj_[12]$/) && init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({ deleted: true, project_id: "x", deleted_snapshots: 0 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/projects")) {
        const callIndex = listCallCount++;
        await new Promise<void>((resolve) => { listResolvers[callIndex] = resolve; });
        // call 0: initial mount -> both projects. call 1: reload after
        // deleting proj_1 -> only proj_2 left (this is the OLDER reload,
        // resolved LAST below). call 2: reload after deleting proj_2 -> both
        // gone (the NEWER reload, resolved FIRST below).
        const bodies = [
          { projects: [project({ project_id: "proj_1", name: "alpha-repo" }), project({ project_id: "proj_2", name: "beta-repo" })], total: 2 },
          { projects: [project({ project_id: "proj_2", name: "beta-repo" })], total: 1 },
          { projects: [], total: 0 },
        ];
        return { ok: true, status: 200, json: async () => bodies[callIndex], text: async () => JSON.stringify(bodies[callIndex]), headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<ProjectsPage onOpenProject={onOpenProject} onReanalyze={onReanalyze} onAnalyze={onAnalyze} />);
    await waitFor(() => expect(listResolvers[0]).toBeTruthy());
    listResolvers[0]();
    await waitFor(() => expect(screen.getByText("alpha-repo")).toBeTruthy());

    const rows = screen.getAllByRole("row").slice(1);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(listResolvers[1]).toBeTruthy()); // older reload now in flight

    fireEvent.click(within(rows[1]).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(listResolvers[2]).toBeTruthy()); // newer reload now in flight

    // Newer reload (call 2, empty list) resolves FIRST.
    listResolvers[2]();
    await waitFor(() => expect(screen.getByText("No projects yet")).toBeTruthy());

    // Older reload (call 1, still lists beta-repo) resolves AFTER -- must be
    // ignored, not silently resurrect beta-repo.
    listResolvers[1]();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.queryByText("beta-repo")).toBeNull();
  });
});
