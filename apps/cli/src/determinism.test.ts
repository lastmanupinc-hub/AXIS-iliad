import { describe, it, expect } from "vitest";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";

/**
 * eq_086 — Determinism proof
 *
 * Running the full pipeline twice on the same input MUST produce
 * byte-identical JSON output. This guards against:
 * - Map iteration order variance
 * - Date.now() leaking into deterministic fields
 * - Set → Array without sort
 * - Random UUIDs in deterministic slots
 */

function makeSnapshot(files: Array<{ path: string; content?: string }>): SnapshotRecord {
  const entries: FileEntry[] = files.map(f => ({
    path: f.path,
    content: f.content ?? "",
    size: f.content?.length ?? 0,
  }));
  return {
    snapshot_id: "snap-determinism-001",
    project_id: "proj-determinism-001",
    created_at: "2025-01-01T00:00:00.000Z",
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: "determinism-test",
      project_type: "backend_api",
      frameworks: [],
      goals: ["test determinism"],
      requested_outputs: [],
    },
    file_count: entries.length,
    total_size_bytes: entries.reduce((s, e) => s + e.size, 0),
    files: entries,
    status: "ready",
  };
}

const polyglotFixture = makeSnapshot([
  // Go backend
  { path: "go.mod", content: "module github.com/acme/payments\ngo 1.22\nrequire github.com/go-chi/chi/v5 v5.0.10" },
  { path: "main.go", content: 'package main\nimport "net/http"\nfunc main() { http.ListenAndServe(":8080", nil) }' },
  { path: "cmd/api/main.go", content: "package main\nfunc main() {}" },
  {
    path: "internal/handler/routes.go",
    content: `package handler
import "github.com/go-chi/chi/v5"
func Routes(r chi.Router) {
	r.Get("/users", list)
	r.Post("/users", create)
	r.Delete("/users/{id}", remove)
}`,
  },
  { path: "internal/handler/user.go", content: "package handler" },
  { path: "internal/domain/user.go", content: "package domain\ntype User struct {\n\tID int\n\tName string\n\tEmail string\n}" },
  { path: "internal/repository/user_repo.go", content: "package repository\ntype UserRepository interface {\n\tFindByID(id int) *User\n}" },

  // SQL
  { path: "migrations/001_users.sql", content: "CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  created_at TIMESTAMP NOT NULL\n);" },
  { path: "migrations/002_orders.sql", content: "CREATE TABLE orders (\n  id INTEGER PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  total DECIMAL(10,2) NOT NULL,\n  FOREIGN KEY (user_id) REFERENCES users (id)\n);" },

  // TypeScript frontend
  { path: "web/package.json", content: '{"name":"web","dependencies":{"react":"18.0.0"}}' },
  { path: "web/src/App.tsx", content: 'import React from "react";\nexport default function App() { return <div>Hello</div>; }' },
  { path: "web/src/types.ts", content: "export interface UserDTO {\n  id: number;\n  name: string;\n  email: string;\n}" },

  // Config
  { path: "Dockerfile", content: "FROM golang:1.22" },
  { path: ".github/workflows/ci.yml", content: "name: CI" },
]);

describe("determinism proof (eq_086)", () => {
  it("buildContextMap produces identical output on consecutive runs", () => {
    const a = buildContextMap(polyglotFixture);
    const b = buildContextMap(polyglotFixture);

    // Zero out generated_at since it uses Date.now()
    a.generated_at = "FIXED";
    b.generated_at = "FIXED";

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("buildRepoProfile produces identical output on consecutive runs", () => {
    const a = buildRepoProfile(polyglotFixture);
    const b = buildRepoProfile(polyglotFixture);

    a.generated_at = "FIXED";
    b.generated_at = "FIXED";

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("routes are sorted deterministically", () => {
    const a = buildContextMap(polyglotFixture);
    const b = buildContextMap(polyglotFixture);
    a.generated_at = "FIXED";
    b.generated_at = "FIXED";

    const aRoutes = JSON.stringify(a.routes);
    const bRoutes = JSON.stringify(b.routes);
    expect(aRoutes).toBe(bRoutes);
  });

  it("domain models are sorted deterministically", () => {
    const a = buildContextMap(polyglotFixture);
    const b = buildContextMap(polyglotFixture);

    const aModels = JSON.stringify(a.domain_models);
    const bModels = JSON.stringify(b.domain_models);
    expect(aModels).toBe(bModels);
  });

  it("sql_schema is sorted deterministically", () => {
    const a = buildContextMap(polyglotFixture);
    const b = buildContextMap(polyglotFixture);

    const aSql = JSON.stringify(a.sql_schema);
    const bSql = JSON.stringify(b.sql_schema);
    expect(aSql).toBe(bSql);
  });

  it("separation_score is stable across runs", () => {
    const scores = Array.from({ length: 5 }, () =>
      buildContextMap(polyglotFixture).architecture_signals.separation_score,
    );
    expect(new Set(scores).size).toBe(1);
  });
});
