import { randomUUID } from "node:crypto";
import type { SnapshotRecord, SnapshotManifest, FileEntry } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import { generateFiles, listAvailableGenerators } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import type { ScanResult } from "./scanner.js";

export interface RunResult {
  generator_result: GeneratorResult;
  snapshot_id: string;
  project_name: string;
  elapsed_ms: number;
}

/**
 * Orchestrates scan results through the full pipeline:
 * files → snapshot → context → generate
 *
 * Bypasses SQLite — constructs SnapshotRecord in-memory.
 */
export function run(scan: ScanResult, projectDir: string, programs?: string[]): RunResult {
  const start = Date.now();
  const manifest = detectManifest(scan.files, projectDir);
  const snapshot = buildInMemorySnapshot(scan, manifest);
  const contextMap = buildContextMap(snapshot);
  const repoProfile = buildRepoProfile(snapshot);

  // Determine requested outputs
  const allGenerators = listAvailableGenerators();
  let requested: string[];

  if (programs && programs.length > 0) {
    // Filter generators by program name
    requested = allGenerators
      .filter((g) => programs.some((p) => g.program.toLowerCase().includes(p.toLowerCase())))
      .map((g) => g.path);
    if (requested.length === 0) requested = allGenerators.map((g) => g.path);
  } else {
    requested = allGenerators.map((g) => g.path);
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: requested,
  });

  return {
    generator_result: result,
    snapshot_id: snapshot.snapshot_id,
    project_name: manifest.project_name,
    elapsed_ms: Date.now() - start,
  };
}

/** Build a SnapshotRecord without touching the database */
function buildInMemorySnapshot(scan: ScanResult, manifest: SnapshotManifest): SnapshotRecord {
  return {
    snapshot_id: randomUUID(),
    project_id: randomUUID(),
    created_at: new Date().toISOString(),
    input_method: "cli_submission",
    manifest,
    file_count: scan.files.length,
    total_size_bytes: scan.total_bytes,
    files: scan.files,
    status: "ready",
  };
}

/** Auto-detect project metadata from scanned files */
function detectManifest(files: FileEntry[], projectDir: string): SnapshotManifest {
  const pkgFile = files.find((f) => f.path === "package.json");
  let pkgJson: Record<string, unknown> = {};

  if (pkgFile) {
    try {
      pkgJson = JSON.parse(pkgFile.content);
    } catch {
      // malformed package.json — continue with defaults
    }
  }

  const name = (pkgJson.name as string) ?? projectDir.split(/[\\/]/).pop() ?? "unknown";
  const frameworks = detectFrameworks(pkgJson, files);
  const projectType = detectProjectType(files, frameworks);
  const primaryLanguage = detectPrimaryLanguage(files);

  return {
    project_name: name,
    project_type: projectType,
    frameworks,
    goals: ["analyze", "generate-config"],
    requested_outputs: [],
    primary_language: primaryLanguage,
  };
}

function detectFrameworks(pkg: Record<string, unknown>, files: FileEntry[]): string[] {
  const found: string[] = [];
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
    ...(pkg.devDependencies as Record<string, string> ?? {}),
  };

  const frameworkMap: Record<string, string> = {
    react: "React",
    next: "Next.js",
    vue: "Vue",
    nuxt: "Nuxt",
    svelte: "Svelte",
    angular: "Angular",
    express: "Express",
    fastify: "Fastify",
    hono: "Hono",
    "react-native": "React Native",
    electron: "Electron",
    astro: "Astro",
    remix: "Remix",
    solid: "Solid",
    vite: "Vite",
    vitest: "Vitest",
    jest: "Jest",
    tailwindcss: "Tailwind CSS",
    prisma: "Prisma",
    drizzle: "Drizzle",
  };

  for (const [dep, label] of Object.entries(frameworkMap)) {
    if (dep in allDeps) found.push(label);
  }

  // Python frameworks
  const reqFile = files.find((f) => f.path === "requirements.txt" || f.path === "pyproject.toml");
  if (reqFile) {
    if (reqFile.content.includes("django")) found.push("Django");
    if (reqFile.content.includes("flask")) found.push("Flask");
    if (reqFile.content.includes("fastapi")) found.push("FastAPI");
  }

  return found;
}

function detectProjectType(files: FileEntry[], frameworks: string[]): string {
  const hasPackages = files.some((f) => f.path.startsWith("packages/"));
  const hasApps = files.some((f) => f.path.startsWith("apps/"));
  if (hasPackages || hasApps) return "monorepo";

  if (frameworks.some((f) => ["Next.js", "Nuxt", "Remix", "Astro"].includes(f))) return "fullstack_web";
  if (frameworks.some((f) => ["React", "Vue", "Svelte", "Angular", "Solid"].includes(f))) return "frontend_web";
  if (frameworks.some((f) => ["Express", "Fastify", "Hono"].includes(f))) return "backend_api";
  if (frameworks.some((f) => ["Django", "Flask", "FastAPI"].includes(f))) return "backend_api";
  if (frameworks.some((f) => ["React Native", "Electron"].includes(f))) return "native_app";

  const hasHtml = files.some((f) => f.path.endsWith(".html"));
  if (hasHtml) return "static_site";

  return "library";
}

function detectPrimaryLanguage(files: FileEntry[]): string {
  const extCount = new Map<string, number>();
  for (const f of files) {
    const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
    extCount.set(ext, (extCount.get(ext) ?? 0) + 1);
  }

  const langMap: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript",
    js: "JavaScript", jsx: "JavaScript",
    py: "Python",
    go: "Go",
    rs: "Rust",
    java: "Java",
    rb: "Ruby",
    cs: "C#",
    swift: "Swift",
    kt: "Kotlin",
    php: "PHP",
    cpp: "C++", cc: "C++",
    c: "C",
  };

  let best = "unknown";
  let bestCount = 0;
  for (const [ext, count] of extCount) {
    const lang = langMap[ext];
    if (lang && count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}
