import { LiveDemoTeaser } from "../components/LiveDemoTeaser.tsx";
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, FREE_FILE_COUNT, PROGRAM_COUNT } from "../config.ts";
import type { PageId } from "../routes.tsx";

// ─── HomePage (WO-P1) ────────────────────────────────────────────────────────
// Landing/Hero — the marketing half of the former UploadPage, split from the
// form (now pages/AnalyzePage.tsx at #analyze). Public, no login required.

interface Props {
  /** Navigate to the Analyze form (routes.tsx wires this to #analyze). */
  onAnalyze: () => void;
  /** Opens the sign-in popup (passed through to the live demo's signup nudge). */
  onRequireLogin: () => void;
  /** Lets the live demo teaser link out to the full Playground (WO-P15). */
  onNavigate: (page: PageId) => void;
}

const PROGRAM_BADGES = [
  { name: "Search", free: true }, { name: "Skills", free: true }, { name: "Debug", free: true },
  { name: "Frontend", free: false }, { name: "SEO", free: false }, { name: "Optimization", free: false },
  { name: "Theme", free: false }, { name: "Brand", free: false }, { name: "Superpowers", free: false },
  { name: "Marketing", free: false }, { name: "Notebook", free: false }, { name: "Obsidian", free: false },
  { name: "MCP", free: false }, { name: "Artifacts", free: false }, { name: "Remotion", free: false },
  { name: "Canvas", free: false }, { name: "Algorithmic", free: false },
  { name: "Agentic Purchasing", free: false }, { name: "Closer", free: false }, { name: "Deploy", free: false },
];

// No usage numbers on this page (owner's rule, 2026-10-13, AXIS Launch
// taskgate T24): it says what Iliad does, never how often it is used. The
// live call-count strip that read GET /v1/stats was removed with it.

export function HomePage({ onAnalyze, onRequireLogin, onNavigate }: Props) {
  return (
    <div>
      {/* ── Hero value prop ────────────────────────────────────── */}
      <section className="upload-hero">
        <h1 className="upload-hero-title">Analyze any repo in seconds.</h1>
        <p className="upload-hero-sub">
          Point Axis&apos; Iliad at a GitHub URL and get {ARTIFACT_COUNT} structured AI artifacts back — AGENTS.md,
          CLAUDE.md, .cursorrules, MCP configs, SEO rules, brand guidelines, debug playbooks, and more — across{" "}
          {PROGRAM_COUNT} programs. Every one ships free artifacts — {FREE_FILE_COUNT} of them, no account required.
        </p>
        <div className="flex" style={{ justifyContent: "center", marginBottom: 20 }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo — free
          </button>
        </div>
        <div className="upload-hero-pills">
          {["AGENTS.md", "CLAUDE.md", ".cursorrules", "MCP Config", "SEO Rules", "Brand Guidelines", "Debug Playbook", "Design Tokens", "Obsidian Vault", "Remotion Script"].map((label) => (
            <span key={label} className="upload-hero-pill">{label}</span>
          ))}
        </div>
      </section>

      {/* ── Live demo teaser ──────────────────────────────────── */}
      <LiveDemoTeaser onRequireLogin={onRequireLogin} onOpenPlayground={() => onNavigate("playground")} />

      {/* ── Programs listing ──────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{PROGRAM_COUNT} Programs — {FREE_FILE_COUNT} artifacts free · {ARTIFACT_COUNT - FREE_FILE_COUNT} paid</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {PROGRAM_BADGES.map(({ name, free }) => (
            <span key={name} className={`badge ${free ? "badge-green" : "badge-accent"}`} style={{ fontSize: "0.78rem" }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* ── Example output preview ─────────────────────────────── */}
      <details style={{ marginBottom: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem", color: "var(--text-muted)", userSelect: "none" }}>
          See example output → <code>AGENTS.md</code>
        </summary>
        <pre style={{ marginTop: 12, fontSize: "0.75rem", lineHeight: 1.6, color: "var(--text-muted)", overflow: "auto", maxHeight: 280, background: "var(--bg)", borderRadius: 4, padding: "12px 14px" }}>{`# AGENTS.md — my-project

## Project Context
Web application built with TypeScript + React 19.
Upload or point at any codebase — get ${ARTIFACT_COUNT} generated artifacts.

### Stack
- React ^19.1.0

### Architecture
- monorepo  · containerized

### Routes
- \`GET /\` → apps/api/src/server.ts
- \`POST /v1/snapshots\` → apps/api/src/server.ts
- *… 107 more (see OpenAPI spec or \`/v1/docs\`)*

### Domain Models
| Model | Kind | Fields | Source |
|-------|------|--------|--------|
| \`AuthContext\` | interface | 3 | apps/api/src/billing.ts |
| \`SnapshotRow\` | interface | 8 | apps/api/src/db.ts |
| *… 127 more* | | | |

## Agent Instructions
- Use strict TypeScript. Avoid \`any\` types.
- Run tests with vitest before committing.
- Use \`pnpm\` for dependency management.`}</pre>
      </details>

      {/* ── Closing CTA ─────────────────────────────────────────── */}
      <div className="card text-center" style={{ padding: "28px 24px" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Ready to see your own repo?</h2>
        <p className="text-muted mb-4">
          Free tier: {FREE_FILE_COUNT} artifacts across all {PROGRAM_COUNT} programs, no signup. Upgrade any time for the remaining {ARTIFACT_COUNT - FREE_FILE_COUNT}.
        </p>
        <button type="button" className="btn btn-primary" onClick={onAnalyze}>
          Analyze your repo
        </button>
      </div>
    </div>
  );
}
