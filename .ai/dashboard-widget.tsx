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
        <StatCard label="TypeScript" value={`${72}%`} />
        <StatCard label="YAML" value={`${12.6}%`} />
        <StatCard label="Markdown" value={`${8.8}%`} />
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
// apps/api/src/router.ts | 113 in | 4 out | risk 1.00
// apps/api/src/test-helpers.ts | 54 in | 1 out | risk 1.00
// apps/api/src/billing.ts | 44 in | 3 out | risk 1.00
// apps/api/src/handlers.ts | 36 in | 21 out | risk 1.00
// apps/api/src/rate-limiter.ts | 46 in | 2 out | risk 1.00
// apps/api/src/mcp-tool-impls.ts | 18 in | 27 out | risk 1.00
// apps/api/src/mpp.ts | 19 in | 1 out | risk 1.00
// apps/api/src/logger.ts | 34 in | 0 out | risk 1.00
// apps/api/src/mcp-server.ts | 17 in | 15 out | risk 1.00
// apps/api/src/server.ts | 2 in | 35 out | risk 1.00

// ─── API Surface: 174 routes ───
// GET: 102 endpoints
// POST: 65 endpoints
// DELETE: 6 endpoints
// PATCH: 1 endpoints

// ─── Domain Models: 278 entities ───
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
// Separation score: 0.64
// Patterns: monorepo, containerized
// Layer boundaries: 1
//   presentation (1 dirs)

// Source file metrics
// Total source files scanned: 500
// Config files: .prettierrc.json, package.json, tsconfig.base.json, vitest.config.ts, mcp/tsconfig.package.template.json, mcp/tsconfig.root.template.json, apps/api/package.json, apps/api/tsconfig.json, packages/agentic-compliance/package.json, packages/agentic-compliance/tsconfig.json, apps/cli/package.json, apps/cli/tsconfig.json, packages/ap2/package.json, packages/ap2/tsconfig.json, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, packages/context-engine/package.json, packages/context-engine/tsconfig.json, packages/generator-core/package.json, packages/generator-core/tsconfig.json, packages/iliad-md/package.json, packages/iliad-md/tsconfig.json, packages/mpp/package.json, packages/mpp/tsconfig.json, packages/paid-client/package.json, packages/paid-client/tsconfig.json