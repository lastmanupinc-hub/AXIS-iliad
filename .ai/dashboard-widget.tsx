import React from "react";

interface DashboardData {
  project: string;
  type: string;
  language: string;
  entryPoints: number;
  hotspots: number;
  frameworks: string[];
}

const data: DashboardData = {
  project: "axis-toolbox",
  type: "monorepo",
  language: "TypeScript",
  entryPoints: 0,
  hotspots: 6,
  frameworks: ["React"],
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function DashboardWidget() {
  return (
    <div className="dashboard-widget">
      <h2>{data.project} Dashboard</h2>
      <div className="stat-grid">
        <StatCard label="Type" value={data.type} />
        <StatCard label="Language" value={data.language} />
        <StatCard label="Entry Points" value={data.entryPoints} />
        <StatCard label="Hotspots" value={data.hotspots} />
        <StatCard label="TypeScript" value={`${71.2}%`} />
        <StatCard label="YAML" value={`${16}%`} />
        <StatCard label="JSON" value={`${6.9}%`} />
      </div>
      <div className="framework-tags">
        {data.frameworks.map(f => (
          <span key={f} className="tag">{f}</span>
        ))}
      </div>
    </div>
  );
}

export default DashboardWidget;

// ─── Dependency Hotspots (highest risk) ───
// Path | Inbound | Outbound | Risk Score
// apps/web/src/api.ts | 16 in | 0 out | risk 0.80
// apps/web/src/App.tsx | 1 in | 14 out | risk 0.75
// apps/web/src/pages/DashboardPage.tsx | 1 in | 9 out | risk 0.50
// apps/web/src/components/Toast.tsx | 3 in | 0 out | risk 0.15
// apps/web/src/components/AxisIcons.tsx | 3 in | 0 out | risk 0.15
// apps/web/src/upload-utils.ts | 3 in | 0 out | risk 0.15

// ─── API Surface: 387 routes ───
// GET: 202 endpoints
// POST: 165 endpoints
// DELETE: 20 endpoints

// ─── Domain Models: 131 entities ───
// AuthContext (interface, 3 fields) — apps/api/src/billing.ts
// EnvSpec (interface, 5 fields) — apps/api/src/env.ts
// ValidationError (interface, 2 fields) — apps/api/src/env.ts
// ValidationResult (interface, 3 fields) — apps/api/src/env.ts
// ZipEntry (interface, 4 fields) — apps/api/src/export.ts
// HistogramEntry (interface, 3 fields) — apps/api/src/metrics.ts
// OpenApiSpec (interface, 6 fields) — apps/api/src/openapi.ts
// WindowEntry (interface, 2 fields) — apps/api/src/rate-limiter.ts
// AppHandle (interface, 3 fields) — apps/api/src/router.ts
// Route (interface, 4 fields) — apps/api/src/router.ts

// ─── Architecture Health ───
// Separation score: 0.64
// Patterns: monorepo, containerized
// Layer boundaries: 1
//   presentation (2 dirs)

// ─── Warnings ───
// ⚠ No CI/CD pipeline detected
// ⚠ No lockfile found — dependency versions may be inconsistent

// Source file metrics
// Total source files scanned: 432
// Config files: apps/api/package.json, apps/api/tsconfig.json, apps/cli/package.json, apps/cli/tsconfig.json, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, package.json, packages/context-engine/package.json, packages/context-engine/tsconfig.json, packages/generator-core/package.json, packages/generator-core/tsconfig.json, packages/repo-parser/package.json, packages/repo-parser/tsconfig.json, packages/snapshots/package.json, packages/snapshots/tsconfig.json, tsconfig.base.json, vitest.config.ts