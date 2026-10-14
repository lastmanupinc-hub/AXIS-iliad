import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import { listAvailableGenerators } from "@axis/generator-core";
import { loadConfig, saveConfig, getConfigFile } from "./credential-store.js";

const mockedGenerators = vi.mocked(listAvailableGenerators);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedGetConfigFile = vi.mocked(getConfigFile);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
const savedArgv = process.argv;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  mockedLoadConfig.mockReturnValue({} as any);
  mockedSaveConfig.mockReset();
  mockedGetConfigFile.mockReturnValue("/home/.axis/config.json");
  mockedGenerators.mockReturnValue([]);
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = undefined;
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// ─── handleAuth ─────────────────────────────────────────────────

describe("handleAuth", () => {
  it("login saves API key via saveConfig", () => {
    process.argv = ["node", "axis", "auth", "login", "axis_testkey123"];
    main();
    expect(mockedSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ api_key: "axis_testkey123" }),
    );
  });

  it("login shows key prefix in confirmation", () => {
    process.argv = ["node", "axis", "auth", "login", "axis_testkey123"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("axis_testk...");
  });

  it("login shows encrypted confirmation message", () => {
    process.argv = ["node", "axis", "auth", "login", "axis_testkey123"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("encrypted and saved");
  });

  it("login without axis_ prefix shows error", () => {
    process.argv = ["node", "axis", "auth", "login", "badkey"];
    main();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("axis_");
  });

  it("logout removes API key from config", () => {
    mockedLoadConfig.mockReturnValue({ api_key: "axis_old" } as any);
    process.argv = ["node", "axis", "auth", "logout"];
    main();
    const savedArg = mockedSaveConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(savedArg.api_key).toBeUndefined();
  });

  it("logout confirms removal", () => {
    process.argv = ["node", "axis", "auth", "logout"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("removed");
  });

  it("status with key shows authenticated", () => {
    mockedLoadConfig.mockReturnValue({ api_key: "axis_secretkey" } as any);
    process.argv = ["node", "axis", "auth", "status"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Authenticated");
    expect(output).toContain("axis_secre...");
  });

  it("status without key shows not authenticated", () => {
    mockedLoadConfig.mockReturnValue({} as any);
    process.argv = ["node", "axis", "auth", "status"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Not authenticated");
  });

  it("status shows config file path", () => {
    mockedLoadConfig.mockReturnValue({ api_key: "axis_abc123456" } as any);
    process.argv = ["node", "axis", "auth", "status"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("/home/.axis/config.json");
  });

  it("status shows default API URL when not configured", () => {
    mockedLoadConfig.mockReturnValue({ api_key: "axis_abc123456" } as any);
    process.argv = ["node", "axis", "auth", "status"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("http://localhost:4000");
  });
});

// ─── printPrograms ──────────────────────────────────────────────

describe("printPrograms", () => {
  it("lists generators grouped by program", () => {
    mockedGenerators.mockReturnValue([
      { program: "search", path: "context-map.md" },
      { program: "search", path: "repo-profile.yaml" },
      { program: "debug", path: "playbook.md" },
    ] as any);
    process.argv = ["node", "axis", "programs"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("3 generators across 2 programs");
  });

  it("shows FREE tier for search/skills/debug", () => {
    mockedGenerators.mockReturnValue([
      { program: "search", path: "a.md" },
      { program: "skills", path: "b.md" },
      { program: "debug", path: "c.md" },
    ] as any);
    process.argv = ["node", "axis", "programs"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toMatch(/search.*\[FREE\]/);
    expect(output).toMatch(/skills.*\[FREE\]/);
    expect(output).toMatch(/debug.*\[FREE\]/);
  });

  it("shows PRO tier for non-free programs", () => {
    mockedGenerators.mockReturnValue([
      { program: "seo", path: "rules.md" },
      { program: "theme", path: "tokens.json" },
    ] as any);
    process.argv = ["node", "axis", "programs"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toMatch(/seo.*\[PRO\]/);
    expect(output).toMatch(/theme.*\[PRO\]/);
  });

  it("pluralizes generators when count > 1", () => {
    mockedGenerators.mockReturnValue([
      { program: "search", path: "a.md" },
      { program: "search", path: "b.md" },
    ] as any);
    process.argv = ["node", "axis", "programs"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("2 generators");
  });

  it("uses singular for single generator", () => {
    mockedGenerators.mockReturnValue([
      { program: "seo", path: "rules.md" },
    ] as any);
    process.argv = ["node", "axis", "programs"];
    main();
    const output = logSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toMatch(/1 generator(?!s)/);
  });
});
