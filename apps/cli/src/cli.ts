import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scanDirectory, type ScanResult } from "./scanner.js";
import { run, type RunResult } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";
import { writeZip } from "./zip.js";
import { fetchAccountStatus, DEFAULT_API_URL } from "./status.js";
import { verifyDeploy, realDeps, extractHealthCheckPath } from "./deploy-verify.js";
import { getLastTag, getCommitsSince, computeReleasePreview, executeRelease, realRunCmd } from "./release-operator.js";
import { fetchGitHubRepo } from "@axis/snapshots";
import { listAvailableGenerators } from "@axis/generator-core";
import { loadConfig, saveConfig, getConfigFile, type AxisConfig } from "./credential-store.js";

/** Every subcommand main() dispatches on — kept in sync with DocsPage by cli-docs-parity.test.ts. */
export const CLI_COMMANDS = [
  "analyze",
  "export",
  "github",
  "programs",
  "list-programs",
  "status",
  "auth",
  "verify-deploy",
  "release",
  "help",
  "version",
] as const;

interface CliArgs {
  command: string;
  target: string;
  /** Raw -o/--output value; "" = not given (per-command defaults apply). */
  output: string;
  programs: string[];
  /** Raw --format value; "" = not given (export infers zip from a .zip -o). */
  format: string;
  /** --key / --api-key value (auth save + status override). */
  apiKey?: string;
  quiet: boolean;
  verbose: boolean;
  /** release only: actually tag (still never pushes) instead of a dry-run preview. */
  execute: boolean;
}

function envIsTrue(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    command: "analyze",
    target: ".",
    output: "",
    programs: [],
    format: "",
    quiet: false,
    verbose: envIsTrue(process.env.AXIS_VERBOSE),
    execute: false,
  };

  let i = 0;
  // First positional: command
  if (args[i] && !args[i].startsWith("-")) {
    result.command = args[i];
    i++;
  }

  // Second positional: target path
  if (args[i] && !args[i].startsWith("-")) {
    result.target = args[i];
    i++;
  }

  // Named flags
  for (; i < args.length; i++) {
    if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
      result.output = args[++i];
    } else if (args[i] === "--program" && args[i + 1]) {
      // Legacy singular, repeatable form
      result.programs.push(args[++i]);
    } else if ((args[i] === "--programs" || args[i] === "-p") && args[i + 1]) {
      // Documented comma-separated form: --programs search,skills,debug
      result.programs.push(...args[++i].split(",").map((p) => p.trim()).filter(Boolean));
    } else if ((args[i] === "--format" || args[i] === "-f") && args[i + 1]) {
      result.format = args[++i];
    } else if ((args[i] === "--key" || args[i] === "--api-key") && args[i + 1]) {
      result.apiKey = args[++i];
    } else if (args[i] === "--quiet") {
      result.quiet = true;
    } else if (args[i] === "--execute") {
      result.execute = true;
    } else if (args[i] === "--verbose") {
      result.verbose = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      result.command = "help";
    } else if (args[i] === "--version" || args[i] === "-v") {
      result.command = "version";
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
axis-iliad — Axis' Iliad CLI (offline codebase → AI-agent artifacts)

Usage:
  axis-iliad analyze [path] [options]        Scan a directory and generate artifacts
  axis-iliad export [path] [options]         Same pipeline, written as a file tree or ZIP
  axis-iliad github <url> [options]          Fetch a public GitHub repo and generate
  axis-iliad list-programs                   List all programs with tier and category
  axis-iliad status                          Show account plan, usage, and API health
  axis-iliad auth --key <api_key>            Save an API key to ~/.axis/config.json
  axis-iliad auth login <api_key>            (legacy form of the same)
  axis-iliad auth status                     Show current auth config
  axis-iliad auth logout                     Remove the saved API key
  axis-iliad verify-deploy [path] [options]  Build (and boot, if Docker is available) the
                                              generated deploy/Dockerfile against your own
                                              local Docker daemon — never sent to the API
  axis-iliad release [path] [--execute]      Preview (default) or cut (--execute) the next
                                              release from conventional commits — never pushes

Commands:
  analyze        Scan a local repository and generate config files (default)
  export         Export generated files to a directory or ZIP archive
  github         Fetch a public GitHub repo by URL and generate config files
  list-programs  List all available programs with tier, category, and generators
  programs       Alias of list-programs
  status         Check API reachability, auth, plan, and usage
  auth           Manage API key authentication
  verify-deploy  Build + boot + healthcheck the generated Dockerfile locally
                 (falls back to hadolint if Docker isn't installed)
  release        Compute the next version + changelog from conventional commits;
                 --execute builds/checksums/tags locally — never pushes
  help           Show this help message
  version        Show version

Options:
  -o, --output <path>    Output directory (analyze: .ai-output, export: output)
                         or ZIP file path for export --format zip
  -p, --programs <a,b>   Comma-separated list of programs to run
      --program <name>   Single program filter (repeatable, legacy)
  -f, --format <fmt>     Export format: dir (default) or zip
      --key <api_key>    API key for auth; --api-key also works everywhere
      --execute          release only: actually build/checksum/tag (default: dry-run preview)
      --quiet            Suppress progress output
      --verbose          Verbose logging (per-file paths, timing)
  -h, --help             Show help
  -v, --version          Show version

Environment:
  AXIS_API_KEY      API key (used if --api-key not set)
  AXIS_API_URL      Custom API server URL for status
  AXIS_OUTPUT_DIR   Default output directory
  AXIS_VERBOSE      Set to "1" or "true" for verbose mode
`);
}

function printVersion(): void {
  // package.json sits one level above both src/ (tsx dev) and dist/ (built),
  // so "../package.json" resolves correctly from either layout.
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  console.log(`axis v${pkg.version}`);
}

// Program → category taxonomy for list-programs. Grouped by what the
// program's artifacts are FOR — no category metadata exists in generator-core,
// so this map is the CLI's own labelling (fallback: "general").
const PROGRAM_CATEGORIES: Record<string, string> = {
  search: "analysis",
  debug: "analysis",
  algorithmic: "analysis",
  skills: "agent-config",
  superpowers: "agent-config",
  mcp: "agent-config",
  frontend: "code-quality",
  optimization: "code-quality",
  theme: "design",
  brand: "design",
  canvas: "design",
  artifacts: "media",
  remotion: "media",
  notebook: "knowledge",
  obsidian: "knowledge",
  seo: "growth",
  marketing: "growth",
  "agentic-purchasing": "commerce",
  closer: "operations",
  deploy: "operations",
};

const FREE_PROGRAMS = new Set(["search", "skills", "debug"]);

function printPrograms(): void {
  const generators = listAvailableGenerators();
  const byProgram = new Map<string, string[]>();
  for (const g of generators) {
    const list = byProgram.get(g.program) ?? [];
    list.push(g.path);
    byProgram.set(g.program, list);
  }

  console.log(`\nAxis' Iliad — ${generators.length} generators across ${byProgram.size} programs\n`);

  for (const [program, paths] of [...byProgram.entries()].sort()) {
    const tier = FREE_PROGRAMS.has(program) ? "FREE" : "PRO";
    const category = PROGRAM_CATEGORIES[program] ?? "general";
    console.log(
      `  ${program.padEnd(20)} [${tier}]`.padEnd(30) +
      `${category.padEnd(14)} ${paths.length} generator${paths.length > 1 ? "s" : ""}`,
    );
    for (const p of paths) {
      console.log(`    └─ ${p}`);
    }
  }
  console.log("");
}

function saveApiKey(config: AxisConfig, key: string): boolean {
  if (!key.startsWith("axis_")) {
    console.error("Usage: axis auth login <api_key>");
    console.error("  The API key should start with 'axis_'");
    process.exitCode = 1;
    return false;
  }
  config.api_key = key;
  saveConfig(config);
  console.log("API key encrypted and saved to ~/.axis/config.json");
  console.log(`Key prefix: ${key.slice(0, 10)}...`);
  return true;
}

function handleAuth(args: CliArgs): void {
  const subcommand = args.target;  // "login", "status", or "logout"
  const config = loadConfig();

  // Documented form: axis-iliad auth --key axis_... (also --api-key)
  if (args.apiKey !== undefined) {
    saveApiKey(config, args.apiKey);
    return;
  }

  if (subcommand === "login") {
    // Legacy form — the API key is the next arg after "login"
    const keyArg = process.argv.find(a => a.startsWith("axis_"));
    if (!keyArg) {
      console.error("Usage: axis auth login <api_key>");
      console.error("  The API key should start with 'axis_'");
      process.exitCode = 1;
      return;
    }
    saveApiKey(config, keyArg);
    return;
  }

  if (subcommand === "logout") {
    delete config.api_key;
    saveConfig(config);
    console.log("API key removed.");
    return;
  }

  // status (default)
  if (config.api_key) {
    console.log(`Authenticated: ${config.api_key.slice(0, 10)}...`);
    console.log(`Config:        ${getConfigFile()}`);
    console.log(`API URL:       ${config.api_url ?? "http://localhost:4000"}`);
  } else {
    console.log("Not authenticated. Run: axis auth login <api_key>");
  }
}

export function main(): void {
  const args = parseArgs(process.argv);

  if (args.command === "help") {
    printHelp();
    return;
  }
  if (args.command === "version") {
    printVersion();
    return;
  }
  if (args.command === "programs" || args.command === "list-programs") {
    printPrograms();
    return;
  }
  if (args.command === "auth") {
    handleAuth(args);
    return;
  }
  if (args.command === "status") {
    runStatus(args).catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    });
    return;
  }

  if (args.command === "verify-deploy") {
    runVerifyDeploy(args).catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    });
    return;
  }

  if (args.command === "release") {
    try {
      runRelease(args);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (args.command !== "analyze" && args.command !== "github" && args.command !== "export") {
    console.error(`Unknown command: ${args.command}`);
    console.error('Run "axis help" for usage.');
    process.exitCode = 1;
    return;
  }

  if (args.command === "github") {
    runGitHub(args).catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    });
    return;
  }

  if (args.command === "export") {
    runExport(args);
    return;
  }

  // ── analyze (default) ─────────────────────────────────────────
  const targetDir = resolve(args.target);
  const outputDir = resolve(args.output || process.env.AXIS_OUTPUT_DIR || ".ai-output");

  if (!args.quiet) {
    console.log(`Scanning ${targetDir} ...`);
  }

  const scan = scanDirectory(targetDir);

  if (scan.files.length === 0) {
    console.error("No source files found in target directory.");
    process.exitCode = 1;
    return;
  }

  /* v8 ignore next 4 — tests run with --quiet */
  if (!args.quiet) {
    console.log(`Found ${scan.files.length} files (${formatBytes(scan.total_bytes)}), ${scan.skipped_count} skipped`);
    console.log("Running analysis pipeline ...");
  }

  const result = run(scan, targetDir, args.programs.length > 0 ? args.programs : undefined);
  const generated = result.generator_result.files;

  if (generated.length === 0) {
    console.error("No files were generated.");
    process.exitCode = 1;
    return;
  }

  const writeResult = writeGeneratedFiles(generated, outputDir);

  /* v8 ignore start — tests run with --quiet */
  if (!args.quiet) {
    console.log("");
    console.log(`Done in ${result.elapsed_ms}ms`);
    console.log(`  Project:   ${result.project_name}`);
    console.log(`  Generated: ${writeResult.files_written} files (${formatBytes(writeResult.total_bytes)})`);
    console.log(`  Skipped:   ${result.generator_result.skipped.length} generators`);
    console.log(`  Output:    ${outputDir}`);
    console.log("");

    // Group by program
    const byProgram = new Map<string, number>();
    for (const f of generated) {
      byProgram.set(f.program, (byProgram.get(f.program) ?? 0) + 1);
    }
    for (const [prog, count] of [...byProgram.entries()].sort()) {
      console.log(`  [${prog}] ${count} file${count > 1 ? "s" : ""}`);
    }

    if (args.verbose) {
      console.log("");
      for (const f of generated) {
        console.log(`  ${f.path}`);
      }
    }
  }
  /* v8 ignore stop */
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Run the local scan → generate pipeline (shared by export). */
function runLocalPipeline(args: CliArgs): { scan: ScanResult; result: RunResult } | null {
  const targetDir = resolve(args.target);

  if (!args.quiet) {
    console.log(`Scanning ${targetDir} ...`);
  }

  const scan = scanDirectory(targetDir);

  if (scan.files.length === 0) {
    console.error("No source files found in target directory.");
    process.exitCode = 1;
    return null;
  }

  /* v8 ignore next 4 — tests run with --quiet */
  if (!args.quiet) {
    console.log(`Found ${scan.files.length} files (${formatBytes(scan.total_bytes)}), ${scan.skipped_count} skipped`);
    console.log("Running analysis pipeline ...");
  }

  const result = run(scan, targetDir, args.programs.length > 0 ? args.programs : undefined);

  if (result.generator_result.files.length === 0) {
    console.error("No files were generated.");
    process.exitCode = 1;
    return null;
  }

  return { scan, result };
}

/**
 * verify-deploy — runs the deploy program, then actually builds (and, when
 * Docker is available, boots + healthchecks) the Dockerfile it emits.
 * Deliberately local-only: this never sends the target repo's content
 * anywhere for server-side execution (see deploy-verify.ts's header for why).
 */
async function runVerifyDeploy(args: CliArgs): Promise<void> {
  const targetDir = resolve(args.target);
  const pipeline = runLocalPipeline({ ...args, programs: ["deploy"] });
  if (!pipeline) return; // runLocalPipeline already reported the error and set exitCode

  const files = pipeline.result.generator_result.files;
  const dockerfile = files.find((f) => f.path === "deploy/Dockerfile");
  if (!dockerfile) {
    console.error("The deploy program did not produce a Dockerfile for this project — nothing to verify.");
    process.exitCode = 1;
    return;
  }
  const renderYaml = files.find((f) => f.path === "deploy/render.yaml");
  const healthCheckPath = extractHealthCheckPath(renderYaml?.content);

  const tmpDir = mkdtempSync(join(tmpdir(), "axis-verify-deploy-"));
  const dockerfilePath = join(tmpDir, "Dockerfile");
  writeFileSync(dockerfilePath, dockerfile.content, "utf-8");

  if (!args.quiet) {
    console.log(`Verifying ${targetDir}'s generated deploy/Dockerfile ...`);
  }

  try {
    const result = await verifyDeploy({ dockerfilePath, buildContext: targetDir, healthCheckPath }, realDeps());
    console.log("");
    console.log(`Method: ${result.method}`);
    console.log(`Result: ${result.pass ? "PASS" : "FAIL"}`);
    console.log(`Detail: ${result.detail}`);
    if (args.verbose && result.log) {
      console.log("");
      console.log(result.log);
    }
    if (!result.pass) process.exitCode = 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * release — decides the next version + changelog from conventional commits
 * since the last tag, and (only with --execute) creates the local git tag
 * the generated .github/workflows/release.yml already triggers off of.
 * Never pushes — see release-operator.ts's header for why that's a
 * deliberate, separate manual step.
 */
function runRelease(args: CliArgs): void {
  const targetDir = resolve(args.target);
  const pkgPath = join(targetDir, "package.json");
  let pkg: { version?: string };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
  } catch {
    console.error(`No readable package.json at ${pkgPath} — axis release only supports npm-versioned projects today.`);
    process.exitCode = 1;
    return;
  }
  const currentVersion = pkg.version ?? "0.0.0";

  const run = realRunCmd();
  const lastTag = getLastTag(run, targetDir);
  const rawCommits = getCommitsSince(run, targetDir, lastTag);
  const preview = computeReleasePreview(currentVersion, lastTag, rawCommits, new Date().toISOString().slice(0, 10));

  console.log("");
  console.log(`Current version: ${currentVersion}${lastTag ? ` (last tag: ${lastTag})` : " (no tags yet)"}`);
  console.log(`Commits analyzed: ${rawCommits.length} (${preview.skippedCommits} non-conventional, skipped)`);
  console.log(`Bump: ${preview.bump}`);

  if (preview.bump === "none") {
    console.log("");
    console.log("No release-worthy changes (feat/fix/perf/breaking) since the last tag.");
    return;
  }

  console.log(`Next version: ${preview.nextVersion}`);
  console.log("");
  console.log(preview.changelog);

  if (!args.execute) {
    console.log("Dry run — nothing was changed. Pass --execute to build, checksum, and tag this release locally.");
    return;
  }

  console.log("Building and computing checksums before tagging ...");
  const result = executeRelease(run, targetDir, preview);
  if (result.status === "build_failed") {
    console.error("Build failed — release aborted, nothing was tagged.");
    if (args.verbose && result.buildLog) console.error(result.buildLog);
    process.exitCode = 1;
    return;
  }
  if (result.status === "nothing_to_release") {
    console.log("Nothing to release.");
    return;
  }
  console.log(`Tagged ${result.tag} locally (package.json + CHANGELOG.md committed). Nothing was pushed.`);
  console.log("Review the changes, then run: git push --follow-tags");
  console.log("Pushing the tag is what triggers your generated .github/workflows/release.yml (build, publish, GitHub Release) — axis release never does that for you.");
}

/**
 * export — same pipeline as analyze, written as a plain file tree (default)
 * or a single ZIP archive (--format zip, or a -o path ending in .zip).
 */
function runExport(args: CliArgs): void {
  // Resolve format: explicit --format wins; otherwise infer zip from -o *.zip
  let format: "dir" | "zip";
  if (args.format) {
    if (args.format !== "dir" && args.format !== "zip") {
      console.error(`Unknown export format: ${args.format} (expected "dir" or "zip")`);
      process.exitCode = 1;
      return;
    }
    format = args.format;
  } else {
    format = args.output.toLowerCase().endsWith(".zip") ? "zip" : "dir";
  }

  const pipeline = runLocalPipeline(args);
  if (!pipeline) return;
  const { result } = pipeline;
  const generated = result.generator_result.files;

  const envDir = process.env.AXIS_OUTPUT_DIR;

  if (format === "zip") {
    const zipPath = resolve(
      args.output || (envDir ? join(envDir, "axis-export.zip") : "axis-export.zip"),
    );
    const zipResult = writeZip(generated, zipPath);

    /* v8 ignore start — tests run with --quiet */
    if (!args.quiet) {
      console.log("");
      console.log(`Done in ${result.elapsed_ms}ms`);
      console.log(`  Project:   ${result.project_name}`);
      console.log(`  Exported:  ${zipResult.entries} entries → ${zipPath} (${formatBytes(zipResult.bytes)})`);
      if (args.verbose) {
        console.log("");
        for (const f of generated) console.log(`  ${f.path}`);
      }
    }
    /* v8 ignore stop */
    return;
  }

  const outputDir = resolve(args.output || envDir || "output");
  const writeResult = writeGeneratedFiles(generated, outputDir);

  /* v8 ignore start — tests run with --quiet */
  if (!args.quiet) {
    console.log("");
    console.log(`Done in ${result.elapsed_ms}ms`);
    console.log(`  Project:   ${result.project_name}`);
    console.log(`  Exported:  ${writeResult.files_written} files (${formatBytes(writeResult.total_bytes)}) → ${outputDir}`);
    if (args.verbose) {
      console.log("");
      for (const f of generated) console.log(`  ${f.path}`);
    }
  }
  /* v8 ignore stop */
}

/**
 * status — reachability + auth + plan + usage against the live API.
 * Degrades honestly (and still exits 0) when offline or unauthenticated.
 */
async function runStatus(args: CliArgs): Promise<void> {
  const config = loadConfig();
  const apiKey = args.apiKey ?? process.env.AXIS_API_KEY ?? config.api_key;
  const configuredUrl = process.env.AXIS_API_URL ?? config.api_url;
  const apiUrl = configuredUrl ?? DEFAULT_API_URL;

  const status = await fetchAccountStatus(apiUrl, apiKey);

  console.log(`API URL:    ${status.api_url}${configuredUrl ? "" : " (default — set AXIS_API_URL or auth to override)"}`);
  console.log(`Reachable:  ${status.reachable ? "yes" : `no — ${status.error ?? "unreachable"}`}`);

  if (!apiKey) {
    console.log("Auth:       no API key configured — run: axis-iliad auth --key <api_key>");
  } else if (status.authenticated) {
    console.log(`Auth:       authenticated (${apiKey.slice(0, 10)}...)`);
  } else {
    console.log(`Auth:       not authenticated${status.reachable && status.error ? ` — ${status.error}` : ""}`);
  }

  if (status.plan) {
    console.log(`Plan:       ${status.plan}`);
  }
  if (status.usage && status.usage.calls !== undefined) {
    console.log(`Usage:      ${status.usage.calls} credits used${status.usage.period ? ` (${status.usage.period})` : ""}`);
  }
  /* v8 ignore next 3 — cosmetic hint, exercised implicitly */
  if (args.verbose) {
    console.log(`Config:     ${getConfigFile()}`);
  }
  // Honest degradation is not an error: status always exits 0.
}

async function runGitHub(args: CliArgs): Promise<void> {
  const url = args.target;
  if (!url || url === ".") {
    console.error("Usage: axis github <url>");
    process.exitCode = 1;
    return;
  }

  const outputDir = resolve(args.output || process.env.AXIS_OUTPUT_DIR || ".ai-output");

  /* v8 ignore next 3 — tests run with --quiet */
  if (!args.quiet) {
    console.log(`Fetching ${url} ...`);
  }

  let fetchResult;
  try {
    fetchResult = await fetchGitHubRepo(url);
  } catch (err) {
    console.error(`Failed to fetch repository: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  if (fetchResult.files.length === 0) {
    console.error("No source files found in repository.");
    process.exitCode = 1;
    return;
  }

  /* v8 ignore next 5 — tests run with --quiet */
  if (!args.quiet) {
    console.log(`Fetched ${fetchResult.owner}/${fetchResult.repo}@${fetchResult.ref}`);
    console.log(`Found ${fetchResult.files.length} files (${formatBytes(fetchResult.total_bytes)}), ${fetchResult.skipped_count} skipped`);
    console.log("Running analysis pipeline ...");
  }

  const scan = {
    files: fetchResult.files,
    skipped_count: fetchResult.skipped_count,
    total_bytes: fetchResult.total_bytes,
  };

  const projectDir = `${fetchResult.owner}/${fetchResult.repo}`;
  const result = run(scan, projectDir, args.programs.length > 0 ? args.programs : undefined);
  const generated = result.generator_result.files;

  if (generated.length === 0) {
    console.error("No files were generated.");
    process.exitCode = 1;
    return;
  }

  const writeResult = writeGeneratedFiles(generated, outputDir);

  /* v8 ignore start — tests run with --quiet */
  if (!args.quiet) {
    console.log("");
    console.log(`Done in ${result.elapsed_ms}ms`);
    console.log(`  Repo:      ${fetchResult.owner}/${fetchResult.repo}@${fetchResult.ref}`);
    console.log(`  Generated: ${writeResult.files_written} files (${formatBytes(writeResult.total_bytes)})`);
    console.log(`  Skipped:   ${result.generator_result.skipped.length} generators`);
    console.log(`  Output:    ${outputDir}`);
    console.log("");

    const byProgram = new Map<string, number>();
    for (const f of generated) {
      byProgram.set(f.program, (byProgram.get(f.program) ?? 0) + 1);
    }
    for (const [prog, count] of [...byProgram.entries()].sort()) {
      console.log(`  [${prog}] ${count} file${count > 1 ? "s" : ""}`);
    }

    if (args.verbose) {
      console.log("");
      for (const f of generated) {
        console.log(`  ${f.path}`);
      }
    }
  }
  /* v8 ignore stop */
}

const entryFile = process.argv[1] ? resolve(process.argv[1]) : null;

if (entryFile === fileURLToPath(import.meta.url)) {
  main();
}
