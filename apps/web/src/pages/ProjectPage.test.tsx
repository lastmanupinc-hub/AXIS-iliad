/**
 * @vitest-environment happy-dom
 */

// H-Phase-A cycle 9: browser Back/Forward between two DIFFERENT projects
// doesn't remount ProjectPage — useHashRoute.ts's hashchange handler
// preserves route.key on history navigation (only navigate() bumps it) — so
// a parent re-render can hand this component a NEW result prop (a
// different project_id) without a fresh mount. loadGeneratedFiles' own
// effect (keyed on result.project_id) then fires again for the new
// project, but an OLDER in-flight request for the PREVIOUS project could
// still land afterward and silently overwrite the newer project's files —
// the same failure shape MyAnalyticsPage.tsx/AdminPage.tsx were already
// fixed for. Tested here by directly re-rendering with a new `result` prop
// (exactly what a parent does on a hashchange-driven project switch),
// rather than fighting the full App-level routing/restore harness for a
// scenario this component's own props already make directly testable.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectPage } from "./ProjectPage.tsx";
import type { SnapshotResponse } from "../api.ts";

function makeResult(projectId: string, name: string): SnapshotResponse {
  return {
    snapshot_id: `snap_${projectId}`,
    project_id: projectId,
    status: "complete",
    context_map: {
      version: "1",
      snapshot_id: `snap_${projectId}`,
      project_id: projectId,
      generated_at: "2026-07-07T00:00:00Z",
      project_identity: { name, type: "web_application", primary_language: "TypeScript", description: null },
      structure: { total_files: 1, total_directories: 1, total_loc: 10, file_tree_summary: [], top_level_layout: [] },
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: [], ci_platform: null, deployment_target: null },
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots: [] },
      entry_points: [],
      routes: [],
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.5 },
      ai_context: { project_summary: null, key_abstractions: [], conventions: [], warnings: [] },
    },
    repo_profile: {
      version: "1",
      project: { name, type: "web_application", primary_language: "TypeScript" },
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProjectPage — stale generated-files response guard (H-Phase-A cycle 9)", () => {
  it("a slow-to-resolve PREVIOUS project's response never overwrites the CURRENT project's file count", async () => {
    const projectA = makeResult("proj_a", "project-a");
    const projectB = makeResult("proj_b", "project-b");

    let resolveAFiles!: (v: Response) => void;
    const aFilesPending = new Promise<Response>((resolve) => { resolveAFiles = resolve; });
    const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/projects/proj_a/generated-files")) return aFilesPending; // held pending deliberately
      if (url.includes("/v1/projects/proj_b/generated-files")) {
        return jsonRes({
          snapshot_id: "snap_proj_b", project_id: "proj_b", generated_at: "", skipped: [],
          files: [
            { path: "a.md", program: "skills", description: "d", content: "x", content_type: "text/markdown" },
            { path: "b.md", program: "skills", description: "d", content: "x", content_type: "text/markdown" },
          ],
        });
      }
      return jsonRes({});
    }));

    const { rerender } = render(
      <ProjectPage result={projectA} loggedIn={false} onSnapshotDeleted={noop} onProjectDeleted={noop} onNeedCredits={noop} />,
    );
    await waitFor(() => expect(screen.getByText("project-a")).toBeTruthy());

    // Same call a real parent makes on a hashchange-driven project switch —
    // no unmount, just a new `result` prop for the same element.
    rerender(
      <ProjectPage result={projectB} loggedIn={false} onSnapshotDeleted={noop} onProjectDeleted={noop} onNeedCredits={noop} />,
    );
    await waitFor(() => expect(screen.getByText("project-b")).toBeTruthy());
    await waitFor(() => {
      const artifactsTab = screen.getByRole("button", { name: /Artifacts/ });
      expect(within(artifactsTab).getByText("2")).toBeTruthy();
    });

    // Release project A's stale, late-arriving response (1 file) — it must
    // NOT overwrite project B's already-displayed count (2 files).
    resolveAFiles(jsonRes({
      snapshot_id: "snap_proj_a", project_id: "proj_a", generated_at: "", skipped: [],
      files: [{ path: "AGENTS.md", program: "skills", description: "d", content: "x", content_type: "text/markdown" }],
    }));
    await new Promise((r) => setTimeout(r, 20));

    const artifactsTab = screen.getByRole("button", { name: /Artifacts/ });
    expect(within(artifactsTab).getByText("2")).toBeTruthy();
    expect(within(artifactsTab).queryByText("1")).toBeNull();
  });
});
