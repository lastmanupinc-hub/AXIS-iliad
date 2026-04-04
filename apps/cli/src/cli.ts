import { resolve } from "node:path";
import { scanDirectory } from "./scanner.js";
import { run } from "./runner.js";
import { writeGeneratedFiles } from "./writer.js";

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

Commands:
  analyze    Scan a repository and generate config files (default)
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
  console.log("axis v0.2.0");
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

  if (args.command !== "analyze") {
    console.error(`Unknown command: ${args.command}`);
    console.error('Run "axis help" for usage.');
    process.exitCode = 1;
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

main();
