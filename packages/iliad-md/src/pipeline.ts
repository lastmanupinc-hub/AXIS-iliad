/** files → manifest → snapshot → context map. All in memory, fully deterministic. */

import type { FileEntry, SnapshotRecord } from "./vendor/snapshots/types.js";
import type { ContextMap } from "./vendor/context-engine/types.js";
import { buildContextMap } from "./vendor/context-engine/engine.js";
import { detectManifest } from "./vendor/cli/manifest.js";

export interface RepoAnalysis {
  contextMap: ContextMap;
  files: FileEntry[];
}

/** Relative paths of the files this tool generates — excluded from analysis so
 *  generate → check round-trips are stable (the outputs never feed themselves). */
export const GENERATED_TARGET_PATHS = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
]);

export function stripGeneratedTargets(files: FileEntry[]): FileEntry[] {
  return files.filter((f) => !GENERATED_TARGET_PATHS.has(f.path));
}

/**
 * Analyze a set of repo files. Input order does not matter — files are sorted
 * by path first so every derived structure iterates deterministically.
 */
export function analyzeFiles(files: FileEntry[], projectDirName: string): RepoAnalysis {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = detectManifest(sorted, projectDirName);

  const snapshot: SnapshotRecord = {
    snapshot_id: "iliad-md",
    project_id: "iliad-md",
    created_at: "1970-01-01T00:00:00.000Z",
    input_method: "cli_submission",
    manifest,
    file_count: sorted.length,
    total_size_bytes: sorted.reduce((sum, f) => sum + f.size, 0),
    files: sorted,
    status: "ready",
    account_id: null,
  };

  return { contextMap: buildContextMap(snapshot), files: sorted };
}
