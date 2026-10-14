import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";

// ─── Mock all cli.ts dependencies ───────────────────────────────

vi.mock("./scanner.js", () => ({
  scanDirectory: vi.fn().mockReturnValue({ files: [], skipped_count: 0, total_bytes: 0 }),
}));
vi.mock("./runner.js", () => ({
  run: vi.fn().mockReturnValue({
    project_name: "test",
    elapsed_ms: 10,
    generator_result: { files: [], skipped: [] },
  }),
}));
vi.mock("./writer.js", () => ({
  writeGeneratedFiles: vi.fn().mockReturnValue({ files_written: 0, total_bytes: 0 }),
}));
vi.mock("@axis/snapshots", () => ({
  fetchGitHubRepo: vi.fn().mockResolvedValue({
    files: [], owner: "o", repo: "r", ref: "HEAD", skipped_count: 0, total_bytes: 0,
  }),
}));
vi.mock("@axis/generator-core", () => ({
  listAvailableGenerators: vi.fn().mockReturnValue([]),
  DEFAULT_PUBLIC_API_BASE: "https://api.iliad.trustfabric.ai",
}));
vi.mock("./credential-store.js", () => ({
  loadConfig: vi.fn().mockReturnValue({}),
  saveConfig: vi.fn(),
  getConfigFile: vi.fn().mockReturnValue("/home/.axis/config.json"),
}));

import { main } from "./cli.js";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";
import { fetchGitHubRepo } from "@axis/snapshots";

const mockedScan = vi.mocked(scanDirectory);
const mockedRun = vi.mocked(run);
const mockedWrite = vi.mocked(writeGeneratedFiles);
const mockedFetch = vi.mocked(fetchGitHubRepo);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
const savedArgv = process.argv;

/** Flush microtask queue so async runGitHub() resolves. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

function setupAnalyzeSuccess() {
  mockedScan.mockReturnValue({
    files: [{ path: "index.ts", content: "export {}", size: 10 }],
    skipped_count: 2,
    total_bytes: 500,
  } as any);
  mockedRun.mockReturnValue({
    project_name: "my-app",
    elapsed_ms: 42,
    generator_result: {
      files: [
        { program: "search", path: "search.md", content: "c", size: 1 },
        { program: "debug", path: "debug.md", content: "d", size: 1 },
      ],
      skipped: [{ program: "theme", reason: "no CSS" }],
    },
  } as any);
  mockedWrite.mockReturnValue({ files_written: 2, total_bytes: 200 } as any);
}

function setupGitHubSuccess() {
  mockedFetch.mockResolvedValue({
    files: [{ path: "src/app.ts", content: "const a = 1;", size: 12 }],
    owner: "acme",
    repo: "widgets",
    ref: "main",
    skipped_count: 3,
    total_bytes: 12,
  } as any);
  mockedRun.mockReturnValue({
    project_name: "acme/widgets",
    elapsed_ms: 55,
    generator_result: {
      files: [{ program: "search", path: "ctx.md", content: "x", size: 1 }],
      skipped: [],
    },
  } as any);
  mockedWrite.mockReturnValue({ files_written: 1, total_bytes: 50 } as any);
}

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  mockedScan.mockReset();
  mockedRun.mockReset();
  mockedWrite.mockReset();
  mockedFetch.mockReset();
  mockedScan.mockReturnValue({ files: [], skipped_count: 0, total_bytes: 0 } as any);
  mockedFetch.mockResolvedValue({
    files: [], owner: "o", repo: "r", ref: "HEAD", skipped_count: 0, total_bytes: 0,
  } as any);
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = undefined;
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// ─── Analyze pipeline ───────────────────────────────────────────

describe("analyze pipeline", () => {
  it("scans target with resolved path", () => {
    process.argv = ["node", "axis", "analyze", "my-project"];
    main();
    expect(mockedScan).toHaveBeenCalledWith(resolve("my-project"));
  });

  it("empty scan sets exitCode = 1 with error", () => {
    process.argv = ["node", "axis", "analyze", "."];
    main();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("No source files found");
  });

  it("passes scan result and target to run()", () => {
    process.argv = ["node", "axis", "analyze", "src"];
    setupAnalyzeSuccess();
    main();
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
      resolve("src"),
      undefined,
    );
  });

  it("passes programs filter to run() when specified", () => {
    process.argv = ["node", "axis", "analyze", ".", "--program", "search"];
    setupAnalyzeSuccess();
    main();
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ["search"],
    );
  });

  it("no generated files sets exitCode = 1", () => {
    process.argv = ["node", "axis", "analyze", "."];
    mockedScan.mockReturnValue({
      files: [{ path: "a.ts", content: "x", size: 1 }],
      skipped_count: 0,
      total_bytes: 1,
    } as any);
    mockedRun.mockReturnValue({
      project_name: "x",
      elapsed_ms: 1,
      generator_result: { files: [], skipped: [] },
    } as any);
    main();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("No files were generated");
  });

  it("writes generated files to resolved output directory", () => {
    process.argv = ["node", "axis", "analyze", ".", "--output", "out"];
    setupAnalyzeSuccess();
    main();
    expect(mockedWrite).toHaveBeenCalledWith(expect.any(Array), resolve("out"));
  });

  it("shows project summary in verbose mode", () => {
    process.argv = ["node", "axis", "analyze", "."];
    setupAnalyzeSuccess();
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("my-app");
    expect(output).toContain("42ms");
    expect(output).toContain("2 files");
  });

  it("groups output by program", () => {
    process.argv = ["node", "axis", "analyze", "."];
    setupAnalyzeSuccess();
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("[debug]");
    expect(output).toContain("[search]");
  });
});

// ─── GitHub pipeline ────────────────────────────────────────────

describe("github pipeline", () => {
  it("missing URL (target=.) shows error", async () => {
    process.argv = ["node", "axis", "github"];
    main();
    await flush();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Usage: axis github");
  });

  it("success path calls fetchGitHubRepo", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/acme/widgets"];
    setupGitHubSuccess();
    main();
    await flush();
    expect(mockedFetch).toHaveBeenCalledWith("https://github.com/acme/widgets");
  });

  it("fetch failure shows error message", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/a/b"];
    mockedFetch.mockRejectedValue(new Error("Network timeout"));
    main();
    await flush();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Network timeout");
  });

  it("empty files from fetch sets error", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/a/b"];
    mockedFetch.mockResolvedValue({
      files: [], owner: "a", repo: "b", ref: "HEAD", skipped_count: 0, total_bytes: 0,
    } as any);
    main();
    await flush();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("No source files found");
  });

  it("no generated files sets error", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/a/b"];
    mockedFetch.mockResolvedValue({
      files: [{ path: "x.ts", content: "y", size: 1 }],
      owner: "a", repo: "b", ref: "HEAD", skipped_count: 0, total_bytes: 1,
    } as any);
    mockedRun.mockReturnValue({
      project_name: "a/b",
      elapsed_ms: 1,
      generator_result: { files: [], skipped: [] },
    } as any);
    main();
    await flush();
    expect(process.exitCode).toBe(1);
  });

  it("shows repo info in output", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/acme/widgets"];
    setupGitHubSuccess();
    main();
    await flush();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("acme/widgets@main");
  });

  it("passes programs to run() when specified", async () => {
    process.argv = ["node", "axis", "github", "https://github.com/acme/widgets", "--program", "debug"];
    setupGitHubSuccess();
    main();
    await flush();
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ["debug"],
    );
  });
});
