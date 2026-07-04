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
  hotspots: 20,
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
        <StatCard label="TypeScript" value={`${80}%`} />
        <StatCard label="YAML" value={`${9.5}%`} />
        <StatCard label="Markdown" value={`${5.6}%`} />
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
// apps/api/src/router.ts | 96 in | 4 out | risk 1.00
// apps/api/src/test-helpers.ts | 41 in | 1 out | risk 1.00
// apps/api/src/billing.ts | 28 in | 3 out | risk 1.00
// apps/api/src/handlers.ts | 23 in | 14 out | risk 1.00
// apps/api/src/rate-limiter.ts | 36 in | 2 out | risk 1.00
// apps/api/src/logger.ts | 25 in | 0 out | risk 1.00
// apps/api/src/server.ts | 1 in | 35 out | risk 1.00
// apps/web/src/App.tsx | 1 in | 24 out | risk 1.00
// packages/generator-core/src/generate.ts | 30 in | 6 out | risk 1.00
// apps/api/src/mcp-tool-impls.ts | 0 in | 24 out | risk 1.00

// ─── API Surface: 163 routes ───
// GET: 92 endpoints
// POST: 66 endpoints
// DELETE: 5 endpoints

// ─── Domain Models: 242 entities ───
// AlertThresholds (interface, 2 fields) — apps/api/src/alerting.ts
// Counters (type_alias, 2 fields) — apps/api/src/alerting.ts
// DebounceState (interface, 2 fields) — apps/api/src/alerting.ts
// WindowResult (interface, 4 fields) — apps/api/src/alerting.ts
// AnalyticsCountByBucketResult (interface, 3 fields) — apps/api/src/analytics.ts
// AnalyticsCountByBucketRow (interface, 2 fields) — apps/api/src/analytics.ts
// AnalyticsCountByEventResult (interface, 2 fields) — apps/api/src/analytics.ts
// AnalyticsCountByEventRow (interface, 2 fields) — apps/api/src/analytics.ts
// AnalyticsCountResult (interface, 2 fields) — apps/api/src/analytics.ts
// AnalyticsDistinctUsersResult (interface, 2 fields) — apps/api/src/analytics.ts

// ─── Architecture Health ───
// Separation score: 0.65
// Patterns: monorepo, containerized
// Layer boundaries: 1
//   presentation (2 dirs)

// ─── Warnings ───
// ⚠ No lockfile found — dependency versions may be inconsistent

// Source file metrics
// Total source files scanned: 500
// Config files: .prettierrc.json, apps/api/package.json, apps/api/tsconfig.json, apps/cli/package.json, apps/cli/tsconfig.json, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, mcp/tsconfig.package.template.json, mcp/tsconfig.root.template.json, package.json, packages/context-engine/package.json, packages/context-engine/tsconfig.json, packages/generator-core/package.json