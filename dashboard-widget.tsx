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
  project: "axis-iliad",
  type: "monorepo",
  language: "TypeScript",
  entryPoints: 0,
  hotspots: 7,
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
        <StatCard label="TypeScript" value={`${73.3}%`} />
        <StatCard label="JSON" value={`${10}%`} />
        <StatCard label="YAML" value={`${7.6}%`} />
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
// apps/web/src/App.tsx | 1 in | 17 out | risk 0.90
// apps/web/src/api.ts | 17 in | 0 out | risk 0.85
// apps/web/src/pages.test.tsx | 0 in | 15 out | risk 0.75
// apps/web/src/pages/DashboardPage.tsx | 1 in | 10 out | risk 0.55
// apps/web/src/components/Toast.tsx | 4 in | 0 out | risk 0.20
// apps/web/src/components/AxisIcons.tsx | 4 in | 0 out | risk 0.20
// apps/web/src/upload-utils.ts | 3 in | 0 out | risk 0.15

// ─── API Surface: 473 routes ───
// GET: 263 endpoints
// POST: 189 endpoints
// DELETE: 21 endpoints

// ─── Domain Models: 163 entities ───
// AuthContext (interface, 3 fields) — apps/api/src/billing.ts
// EnvSpec (interface, 5 fields) — apps/api/src/env.ts
// ValidationError (interface, 2 fields) — apps/api/src/env.ts
// ValidationResult (interface, 3 fields) — apps/api/src/env.ts
// ZipEntry (interface, 4 fields) — apps/api/src/export.ts
// IntentCapture (interface, 5 fields) — apps/api/src/mcp-server.ts
// JsonRpcRequest (interface, 4 fields) — apps/api/src/mcp-server.ts
// McpCallCounters (interface, 5 fields) — apps/api/src/mcp-server.ts
// RpcError (interface, 5 fields) — apps/api/src/mcp-server.ts
// RpcSuccess (interface, 3 fields) — apps/api/src/mcp-server.ts

// ─── Architecture Health ───
// Separation score: 0.65
// Patterns: monorepo, containerized
// Layer boundaries: 1
//   presentation (2 dirs)

// ─── Warnings ───
// ⚠ No lockfile found — dependency versions may be inconsistent

// Source file metrics
// Total source files scanned: 500
// Config files: apps/api/package.json, apps/api/tsconfig.json, apps/cli/package.json, apps/cli/tsconfig.json, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, package.json, packages/context-engine/package.json, packages/context-engine/tsconfig.json, packages/generator-core/package.json, packages/generator-core/tsconfig.json, packages/repo-parser/package.json, packages/repo-parser/tsconfig.json, packages/sdk/package.json, packages/sdk/tsconfig.json, packages/snapshots/package.json, packages/snapshots/tsconfig.json