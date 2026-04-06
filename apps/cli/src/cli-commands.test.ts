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

const mockedScan = vi.mocked(scanDirectory);
const mockedRun = vi.mocked(run);
const mockedWrite = vi.mocked(writeGeneratedFiles);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
const savedArgv = process.argv;

function setupSuccessPath(overrides?: { total_bytes?: number; write_bytes?: number }) {
  mockedScan.mockReturnValue({
    files: [{ path: "index.ts", content: "export {}", size: 10 }],
    skipped_count: 2,
    total_bytes: overrides?.total_bytes ?? 10,
  } as any);
  mockedRun.mockReturnValue({
    project_name: "my-app",
    elapsed_ms: 42,
    generator_result: {
      files: [{ program: "search", path: "search.md", content: "c", size: 1 }],
      skipped: [],
    },
  } as any);
  mockedWrite.mockReturnValue({
    files_written: 1,
    total_bytes: overrides?.write_bytes ?? 100,
  } as any);
}

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  mockedScan.mockReset();
  mockedRun.mockReset();
  mockedWrite.mockReset();
  mockedScan.mockReturnValue({ files: [], skipped_count: 0, total_bytes: 0 } as any);
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = undefined;
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// ─── parseArgs behavior (tested through main()) ────────────────

describe("parseArgs via main()", () => {
  it("defaults to analyze when no args given", () => {
    process.argv = ["node", "axis"];
    main();
    expect(mockedScan).toHaveBeenCalled();
  });

  it("first positional sets command to help", () => {
    process.argv = ["node", "axis", "help"];
    main();
    expect(mockedScan).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Usage:");
  });

  it("second positional sets target directory", () => {
    process.argv = ["node", "axis", "analyze", "src"];
    main();
    expect(mockedScan).toHaveBeenCalledWith(resolve("src"));
  });

  it("--output flag sets output directory", () => {
    process.argv = ["node", "axis", "analyze", ".", "--output", "custom-out"];
    setupSuccessPath();
    main();
    expect(mockedWrite).toHaveBeenCalledWith(expect.anything(), resolve("custom-out"));
  });

  it("--program single filter passed to run()", () => {
    process.argv = ["node", "axis", "analyze", ".", "--program", "search"];
    setupSuccessPath();
    main();
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), expect.anything(), ["search"]);
  });

  it("--program accumulates multiple values", () => {
    process.argv = ["node", "axis", "analyze", ".", "--program", "search", "--program", "debug"];
    setupSuccessPath();
    main();
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), expect.anything(), ["search", "debug"]);
  });

  it("--quiet suppresses progress output", () => {
    process.argv = ["node", "axis", "analyze", ".", "--quiet"];
    setupSuccessPath();
    main();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("--help overrides command to help even with analyze", () => {
    process.argv = ["node", "axis", "analyze", ".", "--help"];
    main();
    expect(mockedScan).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Usage:");
  });

  it("-h shorthand works like --help", () => {
    process.argv = ["node", "axis", "analyze", ".", "-h"];
    main();
    expect(mockedScan).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Usage:");
  });

  it("--version overrides command", () => {
    process.argv = ["node", "axis", "analyze", ".", "--version"];
    main();
    expect(mockedScan).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("v0.3.0");
  });

  it("-v shorthand works like --version", () => {
    process.argv = ["node", "axis", "analyze", ".", "-v"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("v0.3.0");
  });

  it("default target is current directory", () => {
    process.argv = ["node", "axis", "analyze"];
    main();
    expect(mockedScan).toHaveBeenCalledWith(resolve("."));
  });
});

// ─── formatBytes (tested via console output) ────────────────────

describe("formatBytes", () => {
  it("formats bytes under 1024 as B", () => {
    process.argv = ["node", "axis", "analyze", "."];
    setupSuccessPath({ total_bytes: 512 });
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("512 B");
  });

  it("formats kilobytes with one decimal", () => {
    process.argv = ["node", "axis", "analyze", "."];
    setupSuccessPath({ total_bytes: 2048 });
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("2.0 KB");
  });

  it("formats megabytes with one decimal", () => {
    process.argv = ["node", "axis", "analyze", "."];
    setupSuccessPath({ total_bytes: 2 * 1024 * 1024 });
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("2.0 MB");
  });
});

// ─── Command routing ────────────────────────────────────────────

describe("command routing", () => {
  it("unknown command sets exitCode = 1", () => {
    process.argv = ["node", "axis", "badcommand"];
    main();
    expect(process.exitCode).toBe(1);
  });

  it("unknown command suggests running help", () => {
    process.argv = ["node", "axis", "badcommand"];
    main();
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Unknown command: badcommand");
    expect(output).toContain("axis help");
  });

  it("help command prints usage text with all commands", () => {
    process.argv = ["node", "axis", "help"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("analyze");
    expect(output).toContain("github");
    expect(output).toContain("programs");
    expect(output).toContain("auth");
  });

  it("version command prints axis v0.3.0", () => {
    process.argv = ["node", "axis", "version"];
    main();
    expect(logSpy).toHaveBeenCalledWith("axis v0.3.0");
  });

  // Layer 11: github command error catch (cli.ts lines 180-181)
  it("github command logs error when runGitHub rejects", async () => {
    const { fetchGitHubRepo } = await import("@axis/snapshots");
    const mockedFetch = vi.mocked(fetchGitHubRepo);
    mockedFetch.mockResolvedValue({
      files: [{ path: "x.go", content: "package main", size: 12 }],
      owner: "o", repo: "r", ref: "HEAD", skipped_count: 0, total_bytes: 12,
    });
    mockedRun.mockImplementation(() => { throw new Error("pipeline exploded"); });

    process.argv = ["node", "axis", "github", "https://github.com/owner/repo"];
    main();
    // runGitHub is async, wait for the microtask
    await new Promise((r) => setTimeout(r, 50));
    expect(errorSpy).toHaveBeenCalledWith("Error: pipeline exploded");
  });
});
