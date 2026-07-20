/**
 * @vitest-environment happy-dom
 */

// WO-P5 — VersionsTab: snapshot history, generation-version diff, project
// memory, and snapshot/project deletion, all inside the Project Detail
// page's Versions tab.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { VersionsTab } from "./VersionsTab.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PROJECT_ID = "proj_1";
const CURRENT_SNAPSHOT_ID = "snap_1";
const OLDER_SNAPSHOT_ID = "snap_0";

const SNAPSHOTS_RESPONSE = {
  project_id: PROJECT_ID,
  count: 2,
  snapshots: [
    { snapshot_id: CURRENT_SNAPSHOT_ID, status: "ready", created_at: "2026-07-06T00:00:00Z", file_count: 12, compliance_grade: { grade: "A", checks_passed: 8, checks_total: 8 } },
    { snapshot_id: OLDER_SNAPSHOT_ID, status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 10, compliance_grade: { grade: "B", checks_passed: 6, checks_total: 8 } },
  ],
};

const VERSIONS_RESPONSE = {
  snapshot_id: CURRENT_SNAPSHOT_ID,
  count: 2,
  versions: [
    { version_id: "v2", snapshot_id: CURRENT_SNAPSHOT_ID, version_number: 2, program: "theme", file_count: 3, created_at: "2026-07-06T01:00:00Z" },
    { version_id: "v1", snapshot_id: CURRENT_SNAPSHOT_ID, version_number: 1, program: "skills", file_count: 2, created_at: "2026-07-06T00:00:00Z" },
  ],
};

const DIFF_RESPONSE = {
  diff: {
    old_version: 1,
    new_version: 2,
    snapshot_id: CURRENT_SNAPSHOT_ID,
    files: [
      { path: "theme.css", status: "added", old_content: null, new_content: "body { color: red; }" },
      { path: "AGENTS.md", status: "modified", old_content: "line one\nline two", new_content: "line one\nline TWO" },
    ],
    summary: { added: 1, removed: 0, modified: 1, unchanged: 0 },
  },
};

interface Route {
  method: string;
  match: (url: string) => boolean;
  status?: number;
  body: unknown;
}

function routeFetch(routes: Route[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const hit = routes.find((r) => r.method === method && r.match(url));
    const status = hit?.status ?? (hit ? 200 : 404);
    const body = hit ? hit.body : { error: "unhandled in test" };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
}

function baseRoutes(overrides: Partial<Record<"snapshots" | "versions" | "diff" | "memory", Route>> = {}): Route[] {
  return [
    { method: "GET", match: (u) => u.includes(`/v1/projects/${PROJECT_ID}/snapshots`), body: SNAPSHOTS_RESPONSE, ...overrides.snapshots },
    { method: "GET", match: (u) => u.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/versions`) && !u.includes("diff"), body: VERSIONS_RESPONSE, ...overrides.versions },
    { method: "GET", match: (u) => u.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/diff`), body: DIFF_RESPONSE, ...overrides.diff },
    { method: "GET", match: (u) => u.includes(`/v1/projects/${PROJECT_ID}/memory`), body: { project_id: PROJECT_ID, entries: [], count: 0, total: 0 }, ...overrides.memory },
  ];
}

function renderTab(opts?: { loggedIn?: boolean; routes?: Route[] }) {
  const onSnapshotDeleted = vi.fn();
  const onProjectDeleted = vi.fn();
  const onNeedCredits = vi.fn();
  vi.stubGlobal("fetch", routeFetch(opts?.routes ?? baseRoutes()));
  const utils = render(
    <VersionsTab
      projectId={PROJECT_ID}
      currentSnapshotId={CURRENT_SNAPSHOT_ID}
      loggedIn={opts?.loggedIn ?? false}
      onSnapshotDeleted={onSnapshotDeleted}
      onProjectDeleted={onProjectDeleted}
      onNeedCredits={onNeedCredits}
    />,
  );
  return { ...utils, onSnapshotDeleted, onProjectDeleted, onNeedCredits };
}

describe("VersionsTab — snapshot history", () => {
  it("lists every snapshot with status/grade, marking the current one", async () => {
    renderTab();
    await screen.findAllByText("ready");
    expect(screen.getAllByText("ready").length).toBe(2);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("latest")).toBeTruthy();
  });

  it("a load failure shows a retryable Callout, not a crash", async () => {
    renderTab({ routes: baseRoutes({ snapshots: { method: "GET", match: (u) => u.includes(`/v1/projects/${PROJECT_ID}/snapshots`), status: 500, body: { error: "boom" } } }) });
    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("VersionsTab — compare versions + diff", () => {
  it("defaults the picker to the two most recent versions and renders a diff on Compare", async () => {
    renderTab();
    const compareBtn = await screen.findByRole("button", { name: "Compare" }); // waits for versions to load
    fireEvent.click(compareBtn);

    await screen.findByText("1 added");
    expect(screen.getByText("1 modified")).toBeTruthy();
    expect(screen.getByText("theme.css")).toBeTruthy();
    expect(screen.getByText("AGENTS.md")).toBeTruthy();
  });

  it("a stale versions response from a de-selected snapshot cannot overwrite the currently-viewed one (H-Phase-A cycle 11)", async () => {
    // Reproduces the audit's exact scenario without any navigation: click
    // "View" on the older snapshot, then quickly click back to the current
    // one before the older request resolves. If the older (now-stale)
    // response arrives AFTER the current one, it must be discarded — not
    // overwrite the fresher data the picker is actually showing.
    const olderVersions = {
      snapshot_id: OLDER_SNAPSHOT_ID,
      count: 2,
      versions: [
        { version_id: "ov2", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 2, program: "STALE-debug", file_count: 1, created_at: "" },
        { version_id: "ov1", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 1, program: "STALE-search", file_count: 1, created_at: "" },
      ],
    };
    let resolveOlder!: () => void;
    const olderGate = new Promise<void>((resolve) => { resolveOlder = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }) as unknown as Response;
      if (url.includes(`/v1/snapshots/${OLDER_SNAPSHOT_ID}/versions`)) {
        await olderGate; // held open until the test explicitly releases it, below
        return respond(olderVersions);
      }
      if (url.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/versions`)) return respond(VERSIONS_RESPONSE);
      if (url.includes(`/v1/projects/${PROJECT_ID}/snapshots`)) return respond(SNAPSHOTS_RESPONSE);
      if (url.includes("/memory")) return respond({ project_id: PROJECT_ID, entries: [], count: 0, total: 0 });
      return respond({ error: "unhandled in test" });
    });
    vi.stubGlobal("fetch", fetchFn);

    render(
      <VersionsTab projectId={PROJECT_ID} currentSnapshotId={CURRENT_SNAPSHOT_ID} loggedIn={false} onSnapshotDeleted={() => {}} onProjectDeleted={() => {}} onNeedCredits={() => {}} />,
    );
    await screen.findAllByText("ready"); // snapshot table loaded
    await screen.findByRole("button", { name: "Compare" }); // current snapshot's versions loaded first

    const rows = screen.getAllByRole("row");
    const olderRow = rows.find((r) => within(r).queryByText("10") !== null)!;
    const currentRow = rows.find((r) => within(r).queryByText("latest") !== null)!;

    fireEvent.click(within(olderRow).getByRole("button", { name: "View" })); // older's versions fetch now held open on olderGate
    await waitFor(() => expect(within(currentRow).getByRole("button", { name: "View" })).toBeTruthy());
    fireEvent.click(within(currentRow).getByRole("button", { name: "View" })); // switches back before older resolves
    await waitFor(() => expect(within(olderRow).getByRole("button", { name: "View" })).toBeTruthy());

    resolveOlder(); // now let the stale older response land, after the fresh current one already did
    await new Promise((resolve) => setImmediate(resolve));

    expect(screen.queryAllByText("STALE", { exact: false }).length).toBe(0);
    expect(screen.getAllByText("theme", { exact: false }).length).toBeGreaterThan(0);
  });

  it("a stale diff from a de-selected snapshot's Compare cannot overwrite the currently-viewed one (H-Phase-A cycle 12)", async () => {
    // Same class of bug as the test above, one function over: click Compare
    // on the current snapshot (its diff fetch held open), then switch to the
    // older snapshot before that diff resolves. The stale diff must not
    // repopulate the panel once the view has moved on to a snapshot that
    // never asked for it.
    const olderVersions = {
      snapshot_id: OLDER_SNAPSHOT_ID,
      count: 2,
      versions: [
        { version_id: "ov2", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 2, program: "older-b", file_count: 1, created_at: "2026-07-01T01:00:00Z" },
        { version_id: "ov1", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 1, program: "older-a", file_count: 1, created_at: "2026-07-01T00:00:00Z" },
      ],
    };
    let resolveCurrentDiff!: () => void;
    const currentDiffGate = new Promise<void>((resolve) => { resolveCurrentDiff = resolve; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }) as unknown as Response;
      if (url.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/diff`)) {
        await currentDiffGate; // held open until the test explicitly releases it, below
        return respond(DIFF_RESPONSE);
      }
      if (url.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/versions`)) return respond(VERSIONS_RESPONSE);
      if (url.includes(`/v1/snapshots/${OLDER_SNAPSHOT_ID}/versions`)) return respond(olderVersions);
      if (url.includes(`/v1/projects/${PROJECT_ID}/snapshots`)) return respond(SNAPSHOTS_RESPONSE);
      if (url.includes("/memory")) return respond({ project_id: PROJECT_ID, entries: [], count: 0, total: 0 });
      return respond({ error: "unhandled in test" });
    });
    vi.stubGlobal("fetch", fetchFn);

    render(
      <VersionsTab projectId={PROJECT_ID} currentSnapshotId={CURRENT_SNAPSHOT_ID} loggedIn={false} onSnapshotDeleted={() => {}} onProjectDeleted={() => {}} onNeedCredits={() => {}} />,
    );
    await screen.findAllByText("ready"); // snapshot table loaded
    const compareBtn = await screen.findByRole("button", { name: "Compare" }); // current snapshot's versions loaded first
    fireEvent.click(compareBtn); // getDiff(current) now held open on currentDiffGate

    const rows = screen.getAllByRole("row");
    const olderRow = rows.find((r) => within(r).queryByText("10") !== null)!;
    fireEvent.click(within(olderRow).getByRole("button", { name: "View" })); // switches away before the diff resolves
    await waitFor(() => expect(within(olderRow).getByRole("button", { name: "Viewing" })).toBeTruthy());

    resolveCurrentDiff(); // now let the stale diff land, after the view already moved on
    await new Promise((resolve) => setImmediate(resolve));

    expect(screen.queryByText("theme.css")).toBeNull();
    expect(screen.queryByText("1 added")).toBeNull();
  });

  it("fewer than 2 versions shows an explanatory empty state instead of the picker", async () => {
    renderTab({
      routes: baseRoutes({
        versions: { method: "GET", match: (u) => u.includes("/versions") && !u.includes("diff"), body: { snapshot_id: CURRENT_SNAPSHOT_ID, count: 1, versions: [VERSIONS_RESPONSE.versions[0]] } },
      }),
    });
    await screen.findByText("Not enough versions yet");
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
  });

  it("a 402 persistence-credits response renders the upgrade CTA and wires onNeedCredits", async () => {
    const { onNeedCredits } = renderTab({
      routes: baseRoutes({
        diff: { method: "GET", match: (u) => u.includes("/diff"), status: 402, body: { error: "persistence_credits_required", reason: "balance_exhausted" } },
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));

    const creditsBtn = await screen.findByRole("button", { name: "Get persistence credits" });
    fireEvent.click(creditsBtn);
    expect(onNeedCredits).toHaveBeenCalledTimes(1);
  });
});

describe("VersionsTab — snapshot deletion", () => {
  it("requires a second confirming click before deleting, then refreshes the list", async () => {
    let deleteCalled = false;
    const routes = baseRoutes();
    routes.push({ method: "DELETE", match: (u) => u.endsWith(`/v1/snapshots/${OLDER_SNAPSHOT_ID}`), body: { deleted: true, snapshot_id: OLDER_SNAPSHOT_ID } });
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE" && url.endsWith(`/v1/snapshots/${OLDER_SNAPSHOT_ID}`)) deleteCalled = true;
      const hit = routes.find((r) => r.method === method && r.match(url));
      const status = hit?.status ?? (hit ? 200 : 404);
      const body = hit ? hit.body : { error: "unhandled" };
      return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(
      <VersionsTab projectId={PROJECT_ID} currentSnapshotId={CURRENT_SNAPSHOT_ID} loggedIn={false} onSnapshotDeleted={() => {}} onProjectDeleted={() => {}} onNeedCredits={() => {}} />,
    );

    await screen.findAllByText("ready");
    const rows = screen.getAllByRole("row");
    const olderRow = rows.find((r) => within(r).queryByText("10") !== null)!; // file_count column distinguishes the older snapshot
    const deleteBtn = within(olderRow).getByRole("button", { name: "Delete" });

    fireEvent.click(deleteBtn); // arm
    expect(deleteCalled).toBe(false); // not deleted yet — requires confirmation
    const confirmBtn = within(olderRow).getByRole("button", { name: "Yes, delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it("deleting the CURRENT snapshot calls onSnapshotDeleted", async () => {
    const routes = baseRoutes();
    routes.push({ method: "DELETE", match: (u) => u.endsWith(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}`), body: { deleted: true, snapshot_id: CURRENT_SNAPSHOT_ID } });
    const { onSnapshotDeleted } = renderTab({ routes });

    await screen.findAllByText("ready");
    const rows = screen.getAllByRole("row");
    const currentRow = rows.find((r) => within(r).queryByText("latest") !== null)!;
    fireEvent.click(within(currentRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(currentRow).getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => expect(onSnapshotDeleted).toHaveBeenCalledTimes(1));
  });

  it("deleting the SELECTED (but not current/latest) snapshot resets the version picker back to the current snapshot", async () => {
    // Selecting snap_0 and then deleting IT (not the latest) must not leave
    // the version picker pointed at a now-gone snapshot id.
    const olderVersions = {
      snapshot_id: OLDER_SNAPSHOT_ID,
      count: 2,
      versions: [
        { version_id: "ov2", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 2, program: "debug", file_count: 1, created_at: "" },
        { version_id: "ov1", snapshot_id: OLDER_SNAPSHOT_ID, version_number: 1, program: "search", file_count: 1, created_at: "" },
      ],
    };
    const routes: Route[] = [
      { method: "GET", match: (u) => u.includes(`/v1/projects/${PROJECT_ID}/snapshots`), body: SNAPSHOTS_RESPONSE },
      { method: "GET", match: (u) => u.includes(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}/versions`) && !u.includes("diff"), body: VERSIONS_RESPONSE },
      { method: "GET", match: (u) => u.includes(`/v1/snapshots/${OLDER_SNAPSHOT_ID}/versions`) && !u.includes("diff"), body: olderVersions },
      { method: "GET", match: (u) => u.includes(`/v1/projects/${PROJECT_ID}/memory`), body: { project_id: PROJECT_ID, entries: [], count: 0, total: 0 } },
      { method: "DELETE", match: (u) => u.endsWith(`/v1/snapshots/${OLDER_SNAPSHOT_ID}`), body: { deleted: true, snapshot_id: OLDER_SNAPSHOT_ID } },
    ];
    const { onSnapshotDeleted } = renderTab({ routes });

    await screen.findAllByText("ready");
    const rows = screen.getAllByRole("row");
    const olderRow = rows.find((r) => within(r).queryByText("10") !== null)!;
    fireEvent.click(within(olderRow).getByRole("button", { name: "View" }));
    // Older snapshot's versions loaded — its program name ("debug") appears in
    // both the Old and New <option> lists.
    await waitFor(() => expect(screen.getAllByText("debug", { exact: false }).length).toBe(2));

    fireEvent.click(within(olderRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(olderRow).getByRole("button", { name: "Yes, delete" }));

    // Falls back to the current snapshot's versions (v2/theme, v1/skills) — not left on the deleted one.
    await waitFor(() => expect(screen.getAllByText("theme", { exact: false }).length).toBe(2));
    expect(screen.queryAllByText("debug", { exact: false }).length).toBe(0);
    expect(onSnapshotDeleted).not.toHaveBeenCalled(); // it wasn't the CURRENT snapshot that was deleted
  });

  // H-Phase-A cycle 20: deletingSnapshot was a single shared string, not
  // per-row state -- deleting the older snapshot then the current one
  // before the first resolved used to overwrite it, re-enabling the first
  // row's Confirm/Cancel buttons while its own delete was still in flight
  // (a genuine duplicate-DELETE risk, not just a stale-looking button).
  it("deleting a second snapshot while the first's delete is still in flight does not re-enable the first row's confirm button", async () => {
    const resolvers: Record<string, (body: unknown) => void> = {};
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE" && (url.endsWith(`/v1/snapshots/${OLDER_SNAPSHOT_ID}`) || url.endsWith(`/v1/snapshots/${CURRENT_SNAPSHOT_ID}`))) {
        const id = url.endsWith(OLDER_SNAPSHOT_ID) ? OLDER_SNAPSHOT_ID : CURRENT_SNAPSHOT_ID;
        const body = await new Promise((resolve) => { resolvers[id] = resolve; });
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const routes = baseRoutes();
      const hit = routes.find((r) => r.method === method && r.match(url));
      const status = hit?.status ?? (hit ? 200 : 404);
      const body = hit ? hit.body : { error: "unhandled" };
      return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(
      <VersionsTab projectId={PROJECT_ID} currentSnapshotId={CURRENT_SNAPSHOT_ID} loggedIn={false} onSnapshotDeleted={() => {}} onProjectDeleted={() => {}} onNeedCredits={() => {}} />,
    );

    await screen.findAllByText("ready");
    const rows = screen.getAllByRole("row");
    const olderRow = rows.find((r) => within(r).queryByText("10") !== null)!;
    const currentRow = rows.find((r) => within(r).queryByText("latest") !== null)!;

    fireEvent.click(within(olderRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(olderRow).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(resolvers[OLDER_SNAPSHOT_ID]).toBeTruthy());

    fireEvent.click(within(currentRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(currentRow).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(resolvers[CURRENT_SNAPSHOT_ID]).toBeTruthy());

    // The current snapshot's delete (the SECOND, independent one) finishes first.
    resolvers[CURRENT_SNAPSHOT_ID]({ deleted: true, snapshot_id: CURRENT_SNAPSHOT_ID });
    await waitFor(() => expect(within(currentRow).queryByRole("button", { name: "Deleting..." })).toBeNull());
    // The older row must still show its own busy state -- before the fix,
    // the current row's own finally() would have cleared it too.
    expect(within(olderRow).getByRole("button", { name: "Deleting..." })).toBeTruthy();

    resolvers[OLDER_SNAPSHOT_ID]({ deleted: true, snapshot_id: OLDER_SNAPSHOT_ID });
  });
});

describe("VersionsTab — project memory", () => {
  it("signed out: shows a sign-in nudge, never calls the memory endpoint", async () => {
    const fetchFn = routeFetch(baseRoutes());
    vi.stubGlobal("fetch", fetchFn);
    render(
      <VersionsTab projectId={PROJECT_ID} currentSnapshotId={CURRENT_SNAPSHOT_ID} loggedIn={false} onSnapshotDeleted={() => {}} onProjectDeleted={() => {}} onNeedCredits={() => {}} />,
    );

    await screen.findByText("Sign in to use project memory");
    const calls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/memory"))).toBe(false);
  });

  it("signed in + anonymous (no-owner) project: shows the claim-ownership explanation", async () => {
    renderTab({
      loggedIn: true,
      routes: baseRoutes({ memory: { method: "GET", match: (u) => u.includes("/memory"), status: 403, body: { error: "Memory requires an account-owned project" } } }),
    });
    await screen.findByText("This project has no owner");
  });

  it("signed in + owned project: lists entries and can add a new one", async () => {
    const routes = baseRoutes({
      memory: {
        method: "GET",
        match: (u) => u.includes("/memory"),
        body: { project_id: PROJECT_ID, entries: [{ id: "m1", project_id: PROJECT_ID, account_id: "a1", kind: "decision", content: "Use Postgres", source: "", created_at: "2026-07-01T00:00:00Z" }], count: 1, total: 1 },
      },
    });
    routes.push({ method: "POST", match: (u) => u.endsWith(`/v1/projects/${PROJECT_ID}/memory`), status: 201, body: { entry: { id: "m2", project_id: PROJECT_ID, account_id: "a1", kind: "goal", content: "Ship WO-P5", source: "", created_at: "2026-07-07T00:00:00Z" }, total: 2 } });
    renderTab({ loggedIn: true, routes });

    await screen.findByText("Use Postgres");

    fireEvent.change(screen.getByPlaceholderText("What should future work on this project remember?"), { target: { value: "Ship WO-P5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add memory entry" }));

    await waitFor(() => expect((screen.getByPlaceholderText("What should future work on this project remember?") as HTMLTextAreaElement).value).toBe(""));
  });
});

describe("VersionsTab — danger zone", () => {
  it("deleting the project requires confirmation, then calls onProjectDeleted", async () => {
    const routes = baseRoutes();
    routes.push({ method: "DELETE", match: (u) => u.endsWith(`/v1/projects/${PROJECT_ID}`), body: { deleted: true, project_id: PROJECT_ID, deleted_snapshots: 2 } });
    const { onProjectDeleted } = renderTab({ routes });

    await screen.findByText("Delete this project");
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => expect(onProjectDeleted).toHaveBeenCalledTimes(1));
  });
});
