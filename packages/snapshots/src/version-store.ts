import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";

// ─── Types ──────────────────────────────────────────────────────

export interface GenerationVersion {
  version_id: string;
  snapshot_id: string;
  version_number: number;
  program: string | null;
  files: VersionFile[];
  file_count: number;
  created_at: string;
}

export interface VersionFile {
  path: string;
  content: string;
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  old_content: string | null;
  new_content: string | null;
}

export interface VersionDiff {
  old_version: number;
  new_version: number;
  snapshot_id: string;
  files: FileDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

// ─── Persistence ────────────────────────────────────────────────

interface VersionRow {
  version_id: string;
  snapshot_id: string;
  version_number: number;
  program: string | null;
  files: string;
  file_count: number;
  created_at: string;
}

function rowToVersion(row: VersionRow): GenerationVersion {
  return {
    ...row,
    files: JSON.parse(row.files) as VersionFile[],
  };
}

/** Save a new version of generated files for a snapshot. Auto-increments version_number. */
export async function saveGenerationVersion(
  snapshot_id: string,
  files: VersionFile[],
  program?: string,
): Promise<GenerationVersion> {
  const version_id = randomUUID();
  const created_at = new Date().toISOString();

  // Get next version number
  const last = await sql.one<{ max_v: number | null }>(
    "SELECT MAX(version_number) as max_v FROM generation_versions WHERE snapshot_id = ?",
    [snapshot_id],
  );
  const version_number = (last?.max_v ?? 0) + 1;

  const filesJson = JSON.stringify(files);

  await sql.run(
    "INSERT INTO generation_versions (version_id, snapshot_id, version_number, program, files, file_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [version_id, snapshot_id, version_number, program ?? null, filesJson, files.length, created_at],
  );

  return { version_id, snapshot_id, version_number, program: program ?? null, files, file_count: files.length, created_at };
}

/** List all versions for a snapshot (newest first). Does NOT include file content by default. */
export async function listGenerationVersions(snapshot_id: string): Promise<Omit<GenerationVersion, "files">[]> {
  const rows = await sql.many<Omit<VersionRow, "files">>(
    "SELECT version_id, snapshot_id, version_number, program, file_count, created_at FROM generation_versions WHERE snapshot_id = ? ORDER BY version_number DESC",
    [snapshot_id],
  );
  return rows;
}

/** Get a specific version with full file content. */
export async function getGenerationVersion(snapshot_id: string, version_number: number): Promise<GenerationVersion | undefined> {
  const row = await sql.one<VersionRow>(
    "SELECT * FROM generation_versions WHERE snapshot_id = ? AND version_number = ?",
    [snapshot_id, version_number],
  );
  return row ? rowToVersion(row) : undefined;
}

/** Compute a diff between two versions of the same snapshot. */
export async function diffGenerationVersions(
  snapshot_id: string,
  old_version: number,
  new_version: number,
): Promise<VersionDiff | undefined> {
  const oldV = await getGenerationVersion(snapshot_id, old_version);
  const newV = await getGenerationVersion(snapshot_id, new_version);
  if (!oldV || !newV) return undefined;

  const oldMap = new Map(oldV.files.map((f) => [f.path, f.content]));
  const newMap = new Map(newV.files.map((f) => [f.path, f.content]));

  const files: FileDiff[] = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  // Check new files against old
  for (const [path, content] of newMap) {
    const oldContent = oldMap.get(path);
    if (oldContent === undefined) {
      files.push({ path, status: "added", old_content: null, new_content: content });
      added++;
    } else if (oldContent === content) {
      files.push({ path, status: "unchanged", old_content: oldContent, new_content: content });
      unchanged++;
    } else {
      files.push({ path, status: "modified", old_content: oldContent, new_content: content });
      modified++;
    }
  }

  // Check for removed files
  for (const [path, content] of oldMap) {
    if (!newMap.has(path)) {
      files.push({ path, status: "removed", old_content: content, new_content: null });
      removed++;
    }
  }

  // Sort by status then path
  files.sort((a, b) => {
    const order = { added: 0, modified: 1, removed: 2, unchanged: 3 };
    const o = order[a.status] - order[b.status];
    return o !== 0 ? o : a.path.localeCompare(b.path);
  });

  return {
    old_version,
    new_version,
    snapshot_id,
    files,
    summary: { added, removed, modified, unchanged },
  };
}
