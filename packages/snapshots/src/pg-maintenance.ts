// Postgres equivalents of the SQLite db-maintenance helpers (db.ts). The old
// ones (getDbStats/runMaintenance/integrityCheck) operate on a better-sqlite3
// handle and expose SQLite-only notions (WAL checkpoint, vacuum, page_size,
// PRAGMA integrity_check). On Neon those don't apply — size/rows come from the
// catalog, "maintenance" is ANALYZE, and the health check is a trivial probe.
import { sql } from "./pg.js";
import { getPgSchemaVersion } from "./pg-schema.js";

export interface DbMaintenanceResult {
  action: string;
  success: boolean;
  details: Record<string, unknown>;
}

/** Database size + per-table live-row estimates from the Postgres catalog. */
export async function getPgDbStats(): Promise<DbMaintenanceResult> {
  try {
    const size = await sql.one<{ bytes: string }>(
      "SELECT pg_database_size(current_database()) AS bytes",
    );
    const tables = await sql.many<{ name: string; rows: string }>(
      `SELECT relname AS name, n_live_tup AS rows
         FROM pg_stat_user_tables
        WHERE schemaname = current_schema()
        ORDER BY relname`,
    );
    const schema_version = await getPgSchemaVersion();
    return {
      action: "stats",
      success: true,
      details: {
        size_bytes: Number(size?.bytes ?? 0),
        table_count: tables.length,
        schema_version,
        // name → live-row estimate (matches the old SQLite getDbStats shape).
        tables: Object.fromEntries(tables.map((t) => [t.name, Number(t.rows)])),
      },
    };
  } catch (err) {
    return { action: "stats", success: false, details: { error: (err as Error).message } };
  }
}

/** Health probe — Postgres has no PRAGMA integrity_check; a round-trip suffices. */
export async function pgIntegrityCheck(): Promise<DbMaintenanceResult> {
  try {
    await sql.one("SELECT 1 AS ok");
    return { action: "integrity_check", success: true, details: { result: "ok" } };
  } catch (err) {
    return { action: "integrity_check", success: false, details: { error: (err as Error).message } };
  }
}

/** Maintenance = ANALYZE (refresh planner stats). VACUUM is autovacuum's job on Neon. */
export async function runPgMaintenance(): Promise<DbMaintenanceResult[]> {
  const results: DbMaintenanceResult[] = [];
  try {
    await sql.exec("ANALYZE");
    results.push({ action: "analyze", success: true, details: {} });
  } catch (err) {
    results.push({ action: "analyze", success: false, details: { error: (err as Error).message } });
  }
  return results;
}
