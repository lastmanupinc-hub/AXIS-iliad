import { randomUUID } from "node:crypto";
import type {
  SnapshotInput,
  SnapshotRecord,
  SnapshotStatus,
  InputMethod,
  FileEntry,
} from "./types.js";
import { sql, pgPlaceholders } from "./pg.js";

// ─── Snapshot CRUD ──────────────────────────────────────────────

export async function createSnapshot(input: SnapshotInput, account_id?: string): Promise<SnapshotRecord> {
  const snapshot_id = randomUUID();

  // Resolve project_id: reuse existing or create new (scoped by account to prevent cross-account collisions)
  const existingProject = account_id
    ? await sql.one<{ project_id: string }>("SELECT project_id FROM projects WHERE project_name = ? AND account_id = ?", [input.manifest.project_name, account_id])
    : await sql.one<{ project_id: string }>("SELECT project_id FROM projects WHERE project_name = ? AND account_id IS NULL", [input.manifest.project_name]);
  const project_id = existingProject?.project_id ?? randomUUID();

  if (!existingProject) {
    await sql.run("INSERT INTO projects (project_id, project_name, account_id) VALUES (?, ?, ?)", [project_id, input.manifest.project_name, account_id ?? null]);
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
    account_id: account_id ?? null,
  };

  await sql.run(
    `INSERT INTO snapshots (snapshot_id, project_id, created_at, input_method, manifest, file_count, total_size_bytes, files, status, account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.snapshot_id,
      record.project_id,
      record.created_at,
      record.input_method,
      JSON.stringify(record.manifest),
      record.file_count,
      record.total_size_bytes,
      JSON.stringify(record.files),
      record.status,
      record.account_id,
    ],
  );

  return record;
}

function rowToSnapshot(row: Record<string, unknown>): SnapshotRecord | undefined {
  try {
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
      account_id: (row.account_id as string) ?? null,
    };
  } catch {
    return undefined;
  }
}

export async function getSnapshot(snapshot_id: string): Promise<SnapshotRecord | undefined> {
  const row = await sql.one<Record<string, unknown>>("SELECT * FROM snapshots WHERE snapshot_id = ?", [snapshot_id]);
  return row ? rowToSnapshot(row) : undefined;
}

export async function updateSnapshotStatus(
  snapshot_id: string,
  status: SnapshotStatus,
): Promise<boolean> {
  const result = await sql.run("UPDATE snapshots SET status = ? WHERE snapshot_id = ?", [status, snapshot_id]);
  return result.rowCount > 0;
}

export async function getProjectSnapshots(project_id: string): Promise<SnapshotRecord[]> {
  const rows = await sql.many<Record<string, unknown>>("SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at ASC", [project_id]);
  return rows.map(rowToSnapshot).filter((r): r is SnapshotRecord => r !== undefined);
}

export async function getProjectOwner(project_id: string): Promise<string | null> {
  const row = await sql.one<{ account_id: string | null }>("SELECT account_id FROM projects WHERE project_id = ?", [project_id]);
  return row?.account_id ?? null;
}

/** All projects owned by an account, alphabetical by name (deterministic — fleet report input). */
export async function listProjectsByAccount(account_id: string): Promise<Array<{ project_id: string; project_name: string }>> {
  return await sql.many<{ project_id: string; project_name: string }>(
    "SELECT project_id, project_name FROM projects WHERE account_id = ? ORDER BY project_name",
    [account_id],
  );
}

/** One project row as `GET /v1/projects` (WO-A1) needs it: identity + earliest
 *  snapshot timestamp (proxy for "project created") + total snapshot count +
 *  the full latest-snapshot record (so the caller can grade compliance without
 *  a second round trip). `latest_snapshot` is null only if a project row exists
 *  with zero snapshots, which the current write path never produces. */
export interface ProjectListEntry {
  project_id: string;
  project_name: string;
  /** Earliest snapshot's created_at ("" if the project somehow has none). */
  first_created_at: string;
  snapshot_count: number;
  /** input_method of the EARLIEST snapshot — github-sourced projects have a
   *  stable owner/repo project_name the caller can reconstruct a URL from. */
  input_method: InputMethod | null;
  latest_snapshot: {
    snapshot_id: string;
    created_at: string;
    status: SnapshotStatus;
    file_count: number;
    files: FileEntry[];
  } | null;
}

/**
 * Paginated project list for one account, newest-analyzed-first (by the
 * latest snapshot's created_at). Two queries: (1) the page of project rows
 * with cheap correlated-subquery aggregates (first/last snapshot time, count),
 * (2) one `DISTINCT ON` pass over just that page's projects to pull the full
 * latest-snapshot row (incl. `files`, for compliance grading by the caller) —
 * avoids an N+1 fetch per project. The ORDER BY's correlated MAX(...) subquery
 * runs once per project row scanned; fine at today's account sizes, revisit
 * (e.g. a materialized "last_analyzed_at" column) if it becomes a hot path.
 */
export async function listProjectsWithLatestSnapshot(
  account_id: string,
  opts: { limit: number; offset: number },
): Promise<{ items: ProjectListEntry[]; total: number }> {
  const totalRow = await sql.one<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM projects WHERE account_id = ?",
    [account_id],
  );
  const total = Number(totalRow?.c ?? 0);
  if (total === 0) return { items: [], total: 0 };

  const projectRows = await sql.many<{
    project_id: string;
    project_name: string;
    first_created_at: string | null;
    snapshot_count: string | number;
    input_method: string | null;
  }>(
    `SELECT
       p.project_id,
       p.project_name,
       (SELECT MIN(s.created_at) FROM snapshots s WHERE s.project_id = p.project_id) AS first_created_at,
       (SELECT COUNT(*) FROM snapshots s WHERE s.project_id = p.project_id) AS snapshot_count,
       (SELECT s.input_method FROM snapshots s WHERE s.project_id = p.project_id ORDER BY s.created_at ASC LIMIT 1) AS input_method
     FROM projects p
     WHERE p.account_id = ?
     ORDER BY (SELECT MAX(s2.created_at) FROM snapshots s2 WHERE s2.project_id = p.project_id) DESC NULLS LAST, p.project_name ASC
     LIMIT ? OFFSET ?`,
    [account_id, opts.limit, opts.offset],
  );

  // SELECT * (not a narrower column list): rowToSnapshot unconditionally
  // JSON.parses `manifest`, so a projection missing it would throw inside the
  // helper's try/catch and silently hydrate every row to undefined.
  const projectIds = projectRows.map((r) => r.project_id);
  const latestRows = projectIds.length
    ? await sql.many<Record<string, unknown>>(
        `SELECT DISTINCT ON (project_id) *
         FROM snapshots
         WHERE project_id = ANY(?)
         ORDER BY project_id, created_at DESC`,
        [projectIds],
      )
    : [];

  const latestByProject = new Map<string, SnapshotRecord>();
  for (const row of latestRows) {
    const snap = rowToSnapshot(row);
    if (snap) latestByProject.set(snap.project_id, snap);
  }

  const items: ProjectListEntry[] = projectRows.map((r) => {
    const latest = latestByProject.get(r.project_id) ?? null;
    return {
      project_id: r.project_id,
      project_name: r.project_name,
      first_created_at: r.first_created_at ?? "",
      snapshot_count: Number(r.snapshot_count ?? 0),
      input_method: (r.input_method as InputMethod | null) ?? null,
      latest_snapshot: latest
        ? {
            snapshot_id: latest.snapshot_id,
            created_at: latest.created_at,
            status: latest.status,
            file_count: latest.file_count,
            files: latest.files,
          }
        : null,
    };
  });

  return { items, total };
}

/** Delete a snapshot and all associated data (context map, repo profile, generator results, search index). */
export async function deleteSnapshot(snapshot_id: string): Promise<boolean> {
  return await sql.tx(async (client) => {
    await client.query(pgPlaceholders("DELETE FROM search_index WHERE snapshot_id = ?"), [snapshot_id]);
    await client.query(pgPlaceholders("DELETE FROM generator_results WHERE snapshot_id = ?"), [snapshot_id]);
    await client.query(pgPlaceholders("DELETE FROM repo_profiles WHERE snapshot_id = ?"), [snapshot_id]);
    await client.query(pgPlaceholders("DELETE FROM context_maps WHERE snapshot_id = ?"), [snapshot_id]);
    await client.query(pgPlaceholders("DELETE FROM generation_versions WHERE snapshot_id = ?"), [snapshot_id]);
    // persistence_credits is a monetary audit trail — never delete the ledger row,
    // only null out the snapshot it references (the column is already nullable).
    await client.query(pgPlaceholders("UPDATE persistence_credits SET snapshot_id = NULL WHERE snapshot_id = ?"), [snapshot_id]);
    const result = await client.query(pgPlaceholders("DELETE FROM snapshots WHERE snapshot_id = ?"), [snapshot_id]);
    return (result.rowCount ?? 0) > 0;
  });
}

/** Delete a project and ALL its snapshots (cascading). Returns count of snapshots deleted. */
export async function deleteProject(project_id: string): Promise<{ deleted_snapshots: number }> {
  const snapshots = await sql.many<{ snapshot_id: string }>("SELECT snapshot_id FROM snapshots WHERE project_id = ?", [project_id]);
  await sql.tx(async (client) => {
    for (const { snapshot_id } of snapshots) {
      await client.query(pgPlaceholders("DELETE FROM search_index WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM generator_results WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM repo_profiles WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM context_maps WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM generation_versions WHERE snapshot_id = ?"), [snapshot_id]);
      // persistence_credits is a monetary audit trail — never delete the ledger row,
      // only null out the snapshot it references (the column is already nullable).
      await client.query(pgPlaceholders("UPDATE persistence_credits SET snapshot_id = NULL WHERE snapshot_id = ?"), [snapshot_id]);
      await client.query(pgPlaceholders("DELETE FROM snapshots WHERE snapshot_id = ?"), [snapshot_id]);
    }
    await client.query(pgPlaceholders("DELETE FROM project_memory WHERE project_id = ?"), [project_id]);
    await client.query(pgPlaceholders("DELETE FROM projects WHERE project_id = ?"), [project_id]);
  });
  return { deleted_snapshots: snapshots.length };
}

// ─── Context Map persistence ────────────────────────────────────

export async function saveContextMap(snapshot_id: string, data: unknown): Promise<void> {
  await sql.run(
    "INSERT INTO context_maps (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data",
    [snapshot_id, JSON.stringify(data)],
  );
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

export async function getContextMap(snapshot_id: string): Promise<unknown | undefined> {
  const row = await sql.one<{ data: string }>("SELECT data FROM context_maps WHERE snapshot_id = ?", [snapshot_id]);
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidContextMap(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ─── Repo Profile persistence ───────────────────────────────────

export async function saveRepoProfile(snapshot_id: string, data: unknown): Promise<void> {
  await sql.run(
    "INSERT INTO repo_profiles (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data",
    [snapshot_id, JSON.stringify(data)],
  );
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

export async function getRepoProfile(snapshot_id: string): Promise<unknown | undefined> {
  const row = await sql.one<{ data: string }>("SELECT data FROM repo_profiles WHERE snapshot_id = ?", [snapshot_id]);
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidRepoProfile(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ─── Generator Result persistence ───────────────────────────────

export async function saveGeneratorResult(snapshot_id: string, data: unknown): Promise<void> {
  await sql.run(
    "INSERT INTO generator_results (snapshot_id, data) VALUES (?, ?) ON CONFLICT (snapshot_id) DO UPDATE SET data = EXCLUDED.data",
    [snapshot_id, JSON.stringify(data)],
  );
}

/** Runtime shape check — validates minimum required GeneratorResult fields */
function isValidGeneratorResult(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.snapshot_id === "string"
    && typeof d.generated_at === "string"
    && Array.isArray(d.files);
}

export async function getGeneratorResult(snapshot_id: string): Promise<unknown | undefined> {
  const row = await sql.one<{ data: string }>("SELECT data FROM generator_results WHERE snapshot_id = ?", [snapshot_id]);
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.data);
    return isValidGeneratorResult(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
