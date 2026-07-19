/**
 * @vitest-environment happy-dom
 */

// WO-P3 — Account Dashboard: recent-projects cards, usage stat tiles, and
// the quick-actions grid. gradeBadgeClass/statusBadgeClass tests live in
// badge-utils.test.ts (H-Phase-A cycle 9 — extracted the shared
// implementation this page, ProjectsPage.tsx, and VersionsTab.tsx all use).

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountDashboardPage } from "./AccountDashboardPage.tsx";

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

const ONE_PROJECT = {
  projects: [{
    project_id: "proj_1",
    name: "fixture-repo",
    github_url: "https://github.com/octocat/fixture-repo",
    created_at: "2026-07-01T00:00:00Z",
    latest_snapshot: { snapshot_id: "snap_1", status: "ready", created_at: "2026-07-01T00:00:00Z", file_count: 10, compliance_grade: { grade: "A" } },
    snapshot_count: 3,
  }],
  total: 1,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let onOpenProject: ReturnType<typeof vi.fn>;
let onNavigate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onOpenProject = vi.fn();
  onNavigate = vi.fn();
});

describe("AccountDashboardPage — quick actions", () => {
  // H-Phase-A cycle 9: this card used to call onNavigate("account") — a
  // route routes.tsx's own comment says "survives only as the OAuth
  // redirect target." An authenticated visit there does eventually bounce
  // to Settings (AccountPage.tsx's own redirect effect), so this wasn't a
  // dead end, but it took a visible extra render-then-redirect hop instead
  // of the direct navigation every other quick action on this page uses.
  it("Invite teammate navigates straight to Settings, not through the Account redirect page", async () => {
    stubFetch([["/v1/projects", ONE_PROJECT]]);
    render(<AccountDashboardPage onOpenProject={onOpenProject} onNavigate={onNavigate} />);

    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Invite teammate/ }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("the other quick actions still navigate to their own direct destinations", async () => {
    stubFetch([["/v1/projects", ONE_PROJECT]]);
    render(<AccountDashboardPage onOpenProject={onOpenProject} onNavigate={onNavigate} />);

    await waitFor(() => expect(screen.getByText("fixture-repo")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Analyze new repo/ }));
    expect(onNavigate).toHaveBeenCalledWith("analyze");
    fireEvent.click(screen.getByRole("button", { name: /Run a program/ }));
    expect(onNavigate).toHaveBeenCalledWith("runner");
    fireEvent.click(screen.getByRole("button", { name: /Open MCP config/ }));
    expect(onNavigate).toHaveBeenCalledWith("mcp");
  });
});

// H-Phase-A cycle 10: load() is triggered from the mount effect AND two
// independent Retry buttons, neither disabled while loading — an older
// in-flight load's response landing after a newer one would silently win
// with no guard, same shape MyAnalyticsPage.tsx/AdminPage.tsx already had
// fixed. The real app (main.tsx) mounts under <StrictMode>, which
// double-invokes a no-cleanup mount effect exactly once in development —
// a genuinely reachable trigger for two overlapping load() calls on the
// same instance, matching AdminPage's own established reachability
// argument for this exact race shape.
describe("AccountDashboardPage — stale-response race guard", () => {
  it("shows the NEWER load's data even when an older (StrictMode double-invoked) request resolves after it", async () => {
    let callCount = 0;
    let resolveFirst!: (v: Response) => void;
    const firstPending = new Promise<Response>((resolve) => { resolveFirst = resolve; });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/projects")) {
        callCount++;
        if (callCount === 1) return firstPending; // StrictMode's first (discarded) effect invocation
        return { ok: true, status: 200, json: async () => ({ projects: [], total: 999 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}", headers: { get: () => null } } as unknown as Response;
    }));

    render(<StrictMode><AccountDashboardPage onOpenProject={onOpenProject} onNavigate={onNavigate} /></StrictMode>);

    await waitFor(() => expect(screen.getByText("999")).toBeTruthy());

    // Release the STALE first (StrictMode-discarded) request — it must be
    // ignored, not overwrite the already-displayed newer total.
    resolveFirst({ ok: true, status: 200, json: async () => ({ projects: [], total: 111 }), text: async () => "", headers: { get: () => null } } as unknown as Response);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("111")).toBeNull();
    expect(screen.getByText("999")).toBeTruthy();
  });
});
