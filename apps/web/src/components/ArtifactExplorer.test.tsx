/**
 * @vitest-environment happy-dom
 */

// WO-P6 — ArtifactExplorer: search (name + content substring), program/type
// filters, tree/grid view toggle, markdown preview with a raw toggle,
// copy-path/copy-content, per-file download, and per-program ZIP download.
// `downloadExport`/`downloadGeneratedFile` are mocked (their own real
// behavior — anchor-click, Blob, Content-Disposition parsing — is covered in
// api.test.ts); everything else here exercises the real component against
// real, already-loaded `GeneratedFile[]` props (no fetch involved — the
// WO-P6 mini-spec is "API: existing only", and this data is already inline).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GeneratedFile } from "../api.ts";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return { ...actual, downloadExport: vi.fn(), downloadGeneratedFile: vi.fn() };
});

import { downloadExport, downloadGeneratedFile } from "../api.ts";
import { ArtifactExplorer } from "./ArtifactExplorer.tsx";

afterEach(() => {
  cleanup();
  // resetAllMocks (not just clearAllMocks) so a custom mockImplementation set
  // by one test (e.g. the in-flight downloadExport promise below) can never
  // leak into the next test — every test starts from a plain vi.fn().
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const FILES: GeneratedFile[] = [
  { path: "Dockerfile", program: "deploy", description: "container image", content: "FROM node:20\nCMD [\"npm\",\"start\"]", content_type: "text/x-dockerfile" },
  { path: "render.yaml", program: "deploy", description: "Render deploy config", content: "services:\n  - type: web", content_type: "text/yaml" },
  { path: "AGENTS.md", program: "skills", description: "agent guide", content: "# Agents\n\nRun `docker build` before shipping. See **CONTRIBUTING**.", content_type: "text/markdown" },
  { path: "design-tokens.json", program: "theme", description: "design tokens", content: "{\"color\":\"cyan\"}", content_type: "application/json" },
];

describe("ArtifactExplorer — empty state", () => {
  it("shows an empty state and no toolbar when there are no files", () => {
    render(<ArtifactExplorer files={[]} projectId="proj1" />);
    expect(screen.getByText("No artifacts yet")).toBeTruthy();
    expect(screen.queryByLabelText("Search artifacts")).toBeNull();
  });
});

describe("ArtifactExplorer — tree view + result count", () => {
  it("lists every file as a real (keyboard-operable) button, grouped by program, with a total count", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    expect(screen.getByText("4 files")).toBeTruthy();
    const row = screen.getByTitle("Dockerfile");
    expect(row.tagName).toBe("BUTTON");
    expect(screen.getByTitle("render.yaml")).toBeTruthy();
    expect(screen.getByTitle("AGENTS.md")).toBeTruthy();
    expect(screen.getByTitle("design-tokens.json")).toBeTruthy();
  });

  it("shows the 'select a file' empty state until a file is picked, then the file's content", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    expect(screen.getByText("Select a file to preview")).toBeTruthy();

    fireEvent.click(screen.getByTitle("render.yaml"));
    expect(screen.queryByText("Select a file to preview")).toBeNull();
    expect(screen.getByRole("heading", { name: "render.yaml" })).toBeTruthy();
    expect(screen.getByText("services:", { exact: false })).toBeTruthy();
  });
});

describe("ArtifactExplorer — search", () => {
  it("matches by filename substring, case-insensitively", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.change(screen.getByLabelText("Search artifacts"), { target: { value: "DOCKERFILE" } });
    expect(screen.getByText("1 of 4 files")).toBeTruthy();
    expect(screen.getByTitle("Dockerfile")).toBeTruthy();
    expect(screen.queryByTitle("render.yaml")).toBeNull();
  });

  it("also matches by CONTENT substring, across programs — the WO-P6 acceptance scenario ('docker' finds files by name AND content)", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.change(screen.getByLabelText("Search artifacts"), { target: { value: "docker" } });
    expect(screen.getByText("2 of 4 files")).toBeTruthy();
    expect(screen.getByTitle("Dockerfile")).toBeTruthy(); // matched by PATH
    expect(screen.getByTitle("AGENTS.md")).toBeTruthy(); // matched by CONTENT ("docker build")
    expect(screen.queryByTitle("render.yaml")).toBeNull();
    expect(screen.queryByTitle("design-tokens.json")).toBeNull();
  });

  it("a query with no matches shows a 'no matches' status and a clear-filters empty state, without crashing", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.change(screen.getByLabelText("Search artifacts"), { target: { value: "zzzznomatch" } });
    expect(screen.getByText("No matches in 4 files")).toBeTruthy();
    expect(screen.getByText("No files match your filters.")).toBeTruthy(); // tree list's own empty message
    expect(screen.getByText("No files match your filters")).toBeTruthy(); // preview pane's EmptyState title

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect((screen.getByLabelText("Search artifacts") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("4 files")).toBeTruthy();
    expect(screen.getByTitle("Dockerfile")).toBeTruthy();
  });

  it("keeps showing an already-selected file's preview even after a search narrows it out of the list", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("design-tokens.json"));
    expect(screen.getByRole("heading", { name: "design-tokens.json" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search artifacts"), { target: { value: "docker" } });
    expect(screen.getByText("2 of 4 files")).toBeTruthy(); // the list narrowed...
    expect(screen.getByRole("heading", { name: "design-tokens.json" })).toBeTruthy(); // ...but the preview didn't reset
  });
});

describe("ArtifactExplorer — program and type filters", () => {
  it("narrows to one program via the program filter", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.change(screen.getByLabelText("Filter by program"), { target: { value: "theme" } });
    expect(screen.getByText("1 of 4 files")).toBeTruthy();
    expect(screen.getByTitle("design-tokens.json")).toBeTruthy();
    expect(screen.queryByTitle("Dockerfile")).toBeNull();
  });

  it("narrows to one file type via the type filter (friendly label in the dropdown, raw content_type as the value)", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.change(screen.getByLabelText("Filter by file type"), { target: { value: "text/yaml" } });
    expect(screen.getByText("1 of 4 files")).toBeTruthy();
    expect(screen.getByTitle("render.yaml")).toBeTruthy();
    expect(screen.queryByTitle("Dockerfile")).toBeNull();
  });
});

describe("ArtifactExplorer — tree/grid toggle", () => {
  it("Grid view renders a flat card per file (no program grouping) and hides the tree rows", () => {
    const { container } = render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(container.querySelectorAll(".artifact-card").length).toBe(FILES.length);
    expect(container.querySelectorAll(".artifact-row").length).toBe(0);
  });

  it("selecting a card in Grid view shows the preview below it", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(screen.queryByRole("heading", { name: "Dockerfile" })).toBeNull();

    fireEvent.click(screen.getByTitle("Dockerfile"));
    expect(screen.getByRole("heading", { name: "Dockerfile" })).toBeTruthy();
  });

  it("switching back to Tree preserves the current selection", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    fireEvent.click(screen.getByTitle("Dockerfile"));
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByRole("heading", { name: "Dockerfile" })).toBeTruthy();
  });
});

describe("ArtifactExplorer — markdown preview + raw toggle", () => {
  it("renders Markdown by default (real heading/code/strong elements) and can switch to Raw", () => {
    const { container } = render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("AGENTS.md"));

    expect(screen.getByRole("heading", { level: 3, name: "Agents" })).toBeTruthy();
    expect(screen.getByText("docker build").tagName).toBe("CODE");
    expect(screen.getByText("CONTRIBUTING").tagName).toBe("STRONG");

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.queryByRole("heading", { level: 3, name: "Agents" })).toBeNull();
    const pre = container.querySelector(".card pre");
    expect(pre?.textContent).toContain("# Agents");
    expect(pre?.textContent).toContain("`docker build`");
  });

  it("non-markdown files never show the Rendered/Raw toggle", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("Dockerfile"));
    expect(screen.queryByRole("button", { name: "Rendered" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
  });
});

describe("ArtifactExplorer — copy actions", () => {
  it("copies the file path and shows a transient confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("Dockerfile"));

    fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    expect(writeText).toHaveBeenCalledWith("Dockerfile");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy());
  });

  it("copies the file content (not the path)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("Dockerfile"));

    fireEvent.click(screen.getByRole("button", { name: "Copy content" }));
    expect(writeText).toHaveBeenCalledWith(FILES[0].content);
  });
});

describe("ArtifactExplorer — downloads", () => {
  it("downloads a single already-loaded file via downloadGeneratedFile — no network call", () => {
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);
    fireEvent.click(screen.getByTitle("Dockerfile"));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(downloadGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({ path: "Dockerfile", content: FILES[0].content }));
  });

  it("downloads a per-program ZIP via downloadExport and disables the button while in flight — the WO-P6 acceptance's 'deploy ZIP' step", async () => {
    let resolveExport!: () => void;
    vi.mocked(downloadExport).mockImplementation(() => new Promise<void>((res) => { resolveExport = res; }));
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);

    const btn = screen.getByRole("button", { name: "Download deploy ZIP" }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(downloadExport).toHaveBeenCalledWith("proj1", "deploy");
    expect(btn.disabled).toBe(true);

    resolveExport();
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  it("without a projectId, no per-program ZIP buttons render (nothing to export against)", () => {
    render(<ArtifactExplorer files={FILES} />);
    expect(screen.queryByRole("button", { name: /Download .* ZIP/ })).toBeNull();
  });

  // H-Phase-A cycle 19: downloadingProgram was a single shared string, not
  // per-program state — downloading "deploy" then "skills" before the first
  // resolved used to overwrite it to "skills", silently re-enabling the
  // "deploy" button while its own download was still in flight.
  it("downloading a second program's ZIP does not re-enable or clear the first program's still-in-flight button", async () => {
    const resolvers: Array<() => void> = [];
    vi.mocked(downloadExport).mockImplementation(() => new Promise<void>((res) => { resolvers.push(res); }));
    render(<ArtifactExplorer files={FILES} projectId="proj1" />);

    const deployBtn = screen.getByRole("button", { name: "Download deploy ZIP" }) as HTMLButtonElement;
    const skillsBtn = screen.getByRole("button", { name: "Download skills ZIP" }) as HTMLButtonElement;

    fireEvent.click(deployBtn); // deploy's export now in flight
    expect(deployBtn.disabled).toBe(true);

    fireEvent.click(skillsBtn); // skills started BEFORE deploy resolves
    expect(skillsBtn.disabled).toBe(true);
    expect(deployBtn.disabled).toBe(true); // still in flight, unaffected by skills starting

    // skills (the SECOND, independent download) finishes first.
    resolvers[1]();
    await waitFor(() => expect(skillsBtn.disabled).toBe(false));
    // deploy must still show disabled — before the fix, skills' own
    // `finally { setDownloadingProgram(null) }` would have re-enabled it too.
    expect(deployBtn.disabled).toBe(true);

    resolvers[0]();
    await waitFor(() => expect(deployBtn.disabled).toBe(false));
  });
});
