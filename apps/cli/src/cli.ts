import { resolve } from "node:path";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";
import { fetchGitHubRepo } from "@axis/snapshots";
import { listAvailableGenerators } from "@axis/generator-core";
import { loadConfig, saveConfig, getConfigFile, type AxisConfig } from "./credential-store.js";

interface CliArgs {
  command: string;
  target: string;
  output: string;
  programs: string[];
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    command: "analyze",
    target: ".",
    output: ".ai-output",
    programs: [],
    quiet: false,
  };

  let i = 0;
  // First positional: command
  if (args[i] && !args[i].startsWith("--")) {
    result.command = args[i];
    i++;
  }

  // Second positional: target path
  if (args[i] && !args[i].startsWith("--")) {
    result.target = args[i];
    i++;
  }

  // Named flags
  for (; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      result.output = args[++i];
    } else if (args[i] === "--program" && args[i + 1]) {
      result.programs.push(args[++i]);
    } else if (args[i] === "--quiet") {
      result.quiet = true;
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
axis — AXIS Toolbox CLI

Usage:
  axis analyze [path] [options]
  axis github <url> [options]
  axis programs                   List all available programs and generators
  axis auth login <api_key>       Save API key to ~/.axis/config.json
  axis auth status                Show current auth and account info
  axis auth logout                Remove saved API key

Commands:
  analyze    Scan a local repository and generate config files (default)
  github     Fetch a public GitHub repo by URL and generate config files
  programs   List all available programs with generator counts
  auth       Manage API key authentication
  help       Show this help message
  version    Show version

Options:
  --output <dir>    Output directory (default: .ai-output)
  --program <name>  Filter to specific program (repeatable)
  --quiet           Suppress progress output
  -h, --help        Show help
  -v, --version     Show version
`);
}

function printVersion(): void {
  console.log("axis v0.3.0");
}

function printPrograms(): void {
  const generators = listAvailableGenerators();
  const byProgram = new Map<string, string[]>();
  for (const g of generators) {
    const list = byProgram.get(g.program) ?? [];
    list.push(g.path);
    byProgram.set(g.program, list);
  }

  console.log(`\nAXIS Toolbox — ${generators.length} generators across ${byProgram.size} programs\n`);

  const FREE_PROGRAMS = new Set(["search", "skills", "debug"]);

  for (const [program, paths] of [...byProgram.entries()].sort()) {
    const tier = FREE_PROGRAMS.has(program) ? "FREE" : "PRO";
    console.log(`  ${program.padEnd(14)} [${tier}]  ${paths.length} generator${paths.length > 1 ? "s" : ""}`);
    for (const p of paths) {
      console.log(`    └─ ${p}`);
    }
  }
  console.log("");
}

function handleAuth(args: CliArgs): void {
  const subcommand = args.target;  // "login", "status", or "logout"
  const config = loadConfig();

  if (subcommand === "login") {
    // The API key is the next arg after "login"
    const keyArg = process.argv.find(a => a.startsWith("axis_"));
    if (!keyArg) {
      console.error("Usage: axis auth login <api_key>");
      console.error("  The API key should start with 'axis_'");
      process.exitCode = 1;
      return;
    }
    config.api_key = keyArg;
    saveConfig(config);
    console.log("API key encrypted and saved to ~/.axis/config.json");
    console.log(`Key prefix: ${keyArg.slice(0, 10)}...`);
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
  if (args.command === "programs") {
    printPrograms();
    return;
  }
  if (args.command === "auth") {
    handleAuth(args);
    return;
  }

  if (args.command !== "analyze" && args.command !== "github") {
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

  const targetDir = resolve(args.target);
  const outputDir = resolve(args.output);

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
  }
  /* v8 ignore stop */
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function runGitHub(args: CliArgs): Promise<void> {
  const url = args.target;
  if (!url || url === ".") {
    console.error("Usage: axis github <url>");
    process.exitCode = 1;
    return;
  }

  const outputDir = resolve(args.output);

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
  }
  /* v8 ignore stop */
}

main();
