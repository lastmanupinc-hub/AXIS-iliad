// ─── Project Memory — Pillar 2 of the agentic-asset strategy ────
//
// Per-project, server-side memory: decisions made, conventions confirmed,
// evidence of what worked. Written via REST during work (this file), read
// back into generation by the weave in @axis/generator-core (a later WO).
// Append-only in v1 — corrections are new "decision" entries, not edits.

import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";

export type MemoryKind = "decision" | "convention" | "evidence" | "goal";
export const MEMORY_KINDS: readonly MemoryKind[] = ["decision", "convention", "evidence", "goal"];
export const MEMORY_CONTENT_MAX = 4000; // chars; bounds the weave
export const MEMORY_SOURCE_MAX = 500;
export const MEMORY_PROJECT_CAP = 500; // entries per project (append-only ⇒ cap abuse)

export interface MemoryEntry {
  id: string;
  project_id: string;
  account_id: string;
  kind: MemoryKind;
  content: string;
  source: string;
  created_at: string;
}

/** Insert one entry. No validation here — the REST handler owns HTTP-level validation. */
export async function addMemoryEntry(
  project_id: string,
  account_id: string,
  kind: MemoryKind,
  content: string,
  source = "",
): Promise<MemoryEntry> {
  const entry: MemoryEntry = {
    id: randomUUID(),
    project_id,
    account_id,
    kind,
    content,
    source,
    created_at: new Date().toISOString(),
  };
  await sql.run(
    "INSERT INTO project_memory (id, project_id, account_id, kind, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [entry.id, entry.project_id, entry.account_id, entry.kind, entry.content, entry.source, entry.created_at],
  );
  return entry;
}

/**
 * Newest-first: created_at DESC, seq DESC (deterministic tiebreak).
 * CI-fix: created_at is millisecond-precision, so two entries inserted in the
 * same millisecond (routine under load) tie — `seq` (a real monotonic
 * IDENTITY column, migration v36) breaks that tie on genuine insertion
 * order; the old `id DESC` tiebreak sorted by random UUID, unrelated to
 * insertion order.
 */
export async function listMemoryEntries(
  project_id: string,
  opts: { kind?: MemoryKind; limit?: number } = {},
): Promise<MemoryEntry[]> {
  const { kind, limit = 50 } = opts;
  if (kind) {
    return await sql.many<MemoryEntry>(
      "SELECT * FROM project_memory WHERE project_id = ? AND kind = ? ORDER BY created_at DESC, seq DESC LIMIT ?",
      [project_id, kind, limit],
    );
  }
  return await sql.many<MemoryEntry>(
    "SELECT * FROM project_memory WHERE project_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?",
    [project_id, limit],
  );
}

export async function countMemoryEntries(project_id: string): Promise<number> {
  const row = await sql.one<{ count: string | number }>(
    "SELECT COUNT(*) as count FROM project_memory WHERE project_id = ?",
    [project_id],
  );
  // pg COUNT(*) returns a string/bigint — coerce so the cap comparison is numeric.
  return Number(row?.count ?? 0);
}

/** The projects row, or undefined when the project doesn't exist — lets the handler
 *  distinguish 404 (missing) from 403 (anonymous, no owner to claim memory writes). */
export async function getMemoryProject(project_id: string): Promise<{ project_id: string; account_id: string | null } | undefined> {
  return await sql.one<{ project_id: string; account_id: string | null }>(
    "SELECT project_id, account_id FROM projects WHERE project_id = ?",
    [project_id],
  );
}
