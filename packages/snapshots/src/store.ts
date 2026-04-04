import { randomUUID } from "node:crypto";
import type {
  SnapshotInput,
  SnapshotRecord,
  SnapshotStatus,
} from "./types.js";
import { getDb } from "./db.js";

// ─── Snapshot CRUD ──────────────────────────────────────────────

export function createSnapshot(input: SnapshotInput): SnapshotRecord {
  const db = getDb();
  const snapshot_id = randomUUID();

  // Resolve project_id: reuse existing or create new
  const existingProject = db.prepare("SELECT project_id FROM projects WHERE project_name = ?").get(input.manifest.project_name) as { project_id: string } | undefined;
  const project_id = existingProject?.project_id ?? randomUUID();

  if (!existingProject) {
    db.prepare("INSERT INTO projects (project_id, project_name) VALUES (?, ?)").run(project_id, input.manifest.project_name);
  }

  const record: SnapshotRecord = {
    snapshot_id,
    project_id,
    created_at: new Date().toISOString(),
    input_method: input.input_method,
    manifest: input.manifest,
    file_count: input.files.length,
    total_size_bytes: input.files.reduce((sum, f) => sum + f.size, 0),
    files: input.files,
    status: "processing",
  };

  db.prepare(
    `INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.snapshot_id,
    record.project_id,
    record.created_at,
    record.input_method,
    JSON.stringify(record.manifest),
    record.file_count,
    record.total_size_bytes,
    JSON.stringify(record.files),
    record.status,
  );

  return record;
}

function rowToSnapshot(row: Record<string, unknown>): SnapshotRecord {
  return {
    snapshot_id: row.snapshot_id as string,
    project_id: row.project_id as string,
    created_at: row.created_at as string,
    input_method: row.input_method as SnapshotRecord["input_method"],
    manifest: JSON.parse(row.manifest as string),
    file_count: row.file_count as number,
    total_size_bytes: row.total_size_bytes as number,
    files: JSON.parse(row.files as string),
    status: row.status as SnapshotStatus,
  };
}

export function getSnapshot(snapshot_id: string): SnapshotRecord | undefined {
  const row = getDb().prepare("SELECT * FROM snapshots WHERE snapshot_id = ?").get(snapshot_id) as Record<string, unknown> | undefined;
  return row ? rowToSnapshot(row) : undefined;
}

export function updateSnapshotStatus(
  snapshot_id: string,
  status: SnapshotStatus,
): boolean {
  const result = getDb().prepare("UPDATE snapshots SET status = ? WHERE snapshot_id = ?").run(status, snapshot_id);
  return result.changes > 0;
}

export function getProjectSnapshots(project_id: string): SnapshotRecord[] {
  const rows = getDb().prepare("SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at ASC").all(project_id) as Record<string, unknown>[];
  return rows.map(rowToSnapshot);
}

// ─── Context Map persistence ────────────────────────────────────

export function saveContextMap(snapshot_id: string, data: unknown): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO context_maps (snapshot_id, data) VALUES (?, ?)",
  ).run(snapshot_id, JSON.stringify(data));
}

/** Runtime shape check — validates minimum required ContextMap fields */
function isValidContextMap(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.version === "string"
    && typeof d.snapshot_id === "string"
    && typeof d.project_id === "string"
    && typeof d.project_identity === "object" && d.project_identity !== null;
}

export function getContextMap(snapshot_id: string): unknown | undefined {
  const row = getDb().prepare("SELECT data FROM context_maps WHERE snapshot_id = ?").get(snapshot_id) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidContextMap(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ─── Repo Profile persistence ───────────────────────────────────

export function saveRepoProfile(snapshot_id: string, data: unknown): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO repo_profiles (snapshot_id, data) VALUES (?, ?)",
  ).run(snapshot_id, JSON.stringify(data));
}

/** Runtime shape check — validates minimum required RepoProfile fields */
function isValidRepoProfile(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.version === "string"
    && typeof d.snapshot_id === "string"
    && typeof d.project_id === "string"
    && typeof d.project === "object" && d.project !== null;
}

export function getRepoProfile(snapshot_id: string): unknown | undefined {
  const row = getDb().prepare("SELECT data FROM repo_profiles WHERE snapshot_id = ?").get(snapshot_id) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidRepoProfile(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ─── Generator Result persistence ───────────────────────────────

export function saveGeneratorResult(snapshot_id: string, data: unknown): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO generator_results (snapshot_id, data) VALUES (?, ?)",
  ).run(snapshot_id, JSON.stringify(data));
}

/** Runtime shape check — validates minimum required GeneratorResult fields */
function isValidGeneratorResult(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.snapshot_id === "string"
    && typeof d.generated_at === "string"
    && Array.isArray(d.files);
}

export function getGeneratorResult(snapshot_id: string): unknown | undefined {
  const row = getDb().prepare("SELECT data FROM generator_results WHERE snapshot_id = ?").get(snapshot_id) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidGeneratorResult(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
