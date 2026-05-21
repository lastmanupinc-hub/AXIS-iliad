import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────

interface Example {
  id: string;
  slug: string;
  title: string;
  description: string;
  stack: string[];
  stats: { files: number; loc: number };
  afterCount: number;
  keyArtifacts: Array<{ file: string; desc: string }>;
  gap: string;
  previewLines: string[];
}

// ─── Data ────────────────────────────────────────────────────────

const EXAMPLES: Example[] = [
  {
    id: "01",
    slug: "paid-platform",
    title: "PAI'D — Payment Processing",
    description:
      "End-to-end fintech platform: payment orchestration, ledger, reconciliation, provider routing, settlement, and merchant dashboards. Plus Trust Fabric — a repair-to-certify fintech marketplace. 7,251 tests across Go backend and Svelte frontend, 689 HTTP routes, 8 provider adapters.",
    stack: ["Go", "Svelte", "PostgreSQL", "Docker", "REST"],
    stats: { files: 3314, loc: 417166 },
    afterCount: 75,
    keyArtifacts: [
      { file: "AGENTS.md", desc: "689 routes mapped with auth requirements and handler files" },
      { file: "CLAUDE.md", desc: "Go conventions, test commands, package structure" },
      { file: ".cursorrules", desc: "Go strict mode, dual-system architecture rules" },
      { file: "context-map.json", desc: "Full dependency graph: go-backend → frontend → trust-fabric" },
      { file: "debug-playbook.md", desc: "Provider adapter failures, ledger reconciliation patterns" },
      { file: "architecture-summary.md", desc: "Dual-system pattern: Payment + Trust Fabric layers" },
    ],
    gap: "3,314 files across two interleaved systems with zero AI context files. Agents couldn't distinguish PAID routes from Trust Fabric routes, or know which of the 8 provider adapters handled which payment method.",
    previewLines: [
      "# AGENTS.md — avery-pay-platform",
      "",
      "## Project Context",
      "This is a **fintech_platform** built with **Go**.",
      "PAI'D is **two systems in one repo**:",
      "1. PAID — payment orchestration, ledger, settlement",
      "2. Trust Fabric — repair-to-certify marketplace",
      "",
      "### Stack",
      "- Go 1.22 · Svelte · PostgreSQL · Docker",
      "",
      "### Routes (689 total)",
      "| Method | Path                        | System       |",
      "|--------|-----------------------------|--------------|",
      "| POST   | /v1/payments                | PAID         |",
      "| POST   | /v1/payouts                 | PAID         |",
      "| POST   | /v1/kyc/check               | PAID         |",
      "| POST   | /v1/providers/:name/connect | PAID         |",
      "| POST   | /v1/webhooks/provider       | PAID         |",
      "| GET    | /v1/admin/metrics           | PAID         |",
      "| GET    | /healthz                    | shared       |",
    ],
  },
  {
    id: "02",
    slug: "axis-scalpel",
    title: "AXIS Scalpel — Surgical Robotics",
    description:
      "Medical device training platform for surgical robotics. Gate 9 certification framework with 186 passing tests, full audit trails, deterministic execution, and 12 enumerated refusal conditions preventing unsafe operations. Regulatory-grade evidence generation.",
    stack: ["Python", "TypeScript", "pytest", "Gate 9 Framework"],
    stats: { files: 20, loc: 3200 },
    afterCount: 75,
    keyArtifacts: [
      { file: "AGENTS.md", desc: "Gate 1–9 certification pipeline with exit criteria" },
      { file: "CLAUDE.md", desc: "Medical device constraints, refusal system rules" },
      { file: ".cursorrules", desc: "Deterministic execution enforced, no unsafe ops" },
      { file: "debug-playbook.md", desc: "Refusal condition diagnosis, audit trail replay" },
      { file: "architecture-summary.md", desc: "3-phase validation: governance → core → tests" },
      { file: "test-generation-rules.md", desc: "pytest patterns for safety-critical assertions" },
    ],
    gap: "Safety-critical medical platform with 12 refusal conditions and Gate 9 compliance — all encoded in source code but invisible to AI agents. Zero context files meant agents could suggest unsafe operations.",
    previewLines: [
      "# AGENTS.md — axis-scalpel",
      "",
      "## Project Context",
      "This is a **medical_device** platform built with **Python**.",
      "AXIS-Scalpel is a surgical robotics training system",
      "with Gate 9 certification and deterministic execution.",
      "",
      "### Safety Constraints",
      "- 12 enumerated refusal conditions",
      "- Full audit trails for regulatory compliance",
      "- Hash verification on every training run",
      "- PCE (Perceptual Constraint Engine) boundaries",
      "",
      "### Test Coverage (186 passing)",
      "| Phase   | Tests | Status |",
      "|---------|-------|--------|",
      "| Phase 1 | 62    | PASS   |",
      "| Phase 2 | 58    | PASS   |",
      "| Phase 3 | 66    | PASS   |",
      "",
      "### Key Directories",
      "- slate/core/     (artifact management, validation)",
      "- slate/axis/     (CLI tools, evidence signing)",
    ],
  },
  {
    id: "03",
    slug: "spacey",
    title: "SpaceY — Enterprise Platform",
    description:
      "Post-production enterprise platform enforcing deterministic boundaries for side effects. Complete monorepo with production-grade backend services, responsive React UI, Babble DSL compiler, CI publication gates, and test vectors with expected outcomes.",
    stack: ["Node.js", "React", "TypeScript", "Babble DSL", "Vitest"],
    stats: { files: 56, loc: 5800 },
    afterCount: 75,
    keyArtifacts: [
      { file: "AGENTS.md", desc: "Monorepo layout: apps/web, services, DSL compiler" },
      { file: "CLAUDE.md", desc: "Determinism rules, CI gate requirements, DSL syntax" },
      { file: ".cursorrules", desc: "TypeScript strict, boundary evaluation patterns" },
      { file: "context-map.json", desc: "Dependency graph: web → services → babble-compiler" },
      { file: "frontend-rules.md", desc: "React component patterns tuned to this codebase" },
      { file: "mcp-config.json", desc: "Model Context Protocol auto-configured for monorepo" },
    ],
    gap: "Monorepo with a custom DSL compiler, 4-outcome authorization model, and deterministic boundary evaluation — none of which were documented for AI agents. Agents treated it as a generic React app.",
    previewLines: [
      "# AGENTS.md — spacey",
      "",
      "## Project Context",
      "This is an **enterprise_platform** built with **TypeScript**.",
      "SpaceY enforces deterministic boundaries for side effects",
      "with a custom Babble DSL compiler and 4-outcome auth model.",
      "",
      "### Architecture",
      "- Monorepo (apps/ + services/ + compiler/)",
      "- Deterministic boundary evaluation",
      "- 4 terminal states: compliance / violation / no-outcome / invalid",
      "",
      "### Key Components",
      "| Component              | Role                        |",
      "|------------------------|-----------------------------|",
      "| BabbleEditor.tsx       | DSL policy editor + compiler|",
      "| AuthorizationView.tsx  | 4-outcome authorization     |",
      "| CanonBrowser.tsx       | Canon reference browser     |",
      "| VerificationViewer.tsx | Verification artifacts      |",
      "| GovernanceViewer.tsx   | Supersession viewer         |",
      "| AuditLogExplorer.tsx   | Audit log query UI          |",
    ],
  },
  {
    id: "04",
    slug: "slate-certification",
    title: "Slate — Gate 1–9 Certification",
    description:
      "AXIS Platform certification slate containing the full Gate 1–9 certified implementation. Artifact-first architecture with .axp pack format, 12 core components, universal input layer, and a 6-phase development roadmap. Build process with step 0–9 exit criteria.",
    stack: ["Python", "YAML", "JSON", "Markdown", "Shell"],
    stats: { files: 575, loc: 14200 },
    afterCount: 75,
    keyArtifacts: [
      { file: "AGENTS.md", desc: "Gate 1–9 pipeline: entry criteria → evidence → exit" },
      { file: "CLAUDE.md", desc: "Artifact-first rules, .axp format, build sequence" },
      { file: ".cursorrules", desc: "Deterministic build, no spec drift, evidence-required" },
      { file: "architecture-summary.md", desc: "4-area layout: Core, Runtime, Design Suite, Ops" },
      { file: "debug-playbook.md", desc: "Gate certification failures, evidence gaps" },
      { file: "optimization-rules.md", desc: "Build pipeline bottlenecks, .axp pack optimization" },
    ],
    gap: "575 files spanning certification specs, gate evidence, and a 6-phase roadmap — all interleaved with zero navigation aids. Agents had to read every file to understand which gate a change would affect.",
    previewLines: [
      "# AGENTS.md — axis-platform-slate",
      "",
      "## Project Context",
      "This is a **certification_system** built with **Python**.",
      "Slate contains Gate 1–9 certified implementation of the",
      "AXIS Platform Spine with artifact-first architecture.",
      "",
      "### Gate Certification Status",
      "| Gate | Name              | Status     |",
      "|------|-------------------|------------|",
      "| 1    | Foundation        | CERTIFIED  |",
      "| 2    | Core Components   | CERTIFIED  |",
      "| 3    | Runtime           | CERTIFIED  |",
      "| 4    | Design Suite      | CERTIFIED  |",
      "| 5    | Enterprise Ops    | CERTIFIED  |",
      "| 9    | Medical Crossmap  | CERTIFIED  |",
      "",
      "### Build Process (Steps 0–9)",
      "Each step has entry criteria, required artifacts,",
      "and exit evidence. No step may be skipped.",
      "Format: .axp deterministic packs.",
    ],
  },
  {
    id: "05",
    slug: "ruuuun",
    title: "RUUUUN!!! — Roblox Battle Royale",
    description:
      "PvP/PvE battle royale in Roblox: loot-scramble opener into a panic-inducing chase through a procedurally generated maze. 2–50 players, 5–10 minute rounds, deterministic game systems, progression system, and expansion packs.",
    stack: ["Lua", "Roblox Studio", "ReplicatedStorage", "ServerScript"],
    stats: { files: 90, loc: 4200 },
    afterCount: 75,
    keyArtifacts: [
      { file: "AGENTS.md", desc: "Game loop: loot phase → maze chase → extraction" },
      { file: "CLAUDE.md", desc: "Roblox API patterns, RemoteEvent conventions" },
      { file: ".cursorrules", desc: "Lua style, server/client boundary, no exploits" },
      { file: "debug-playbook.md", desc: "Replication bugs, maze generation edge cases" },
      { file: "architecture-summary.md", desc: "Server → Replicated → Client data flow" },
      { file: "frontend-rules.md", desc: "UI component patterns for Roblox PlayerGui" },
    ],
    gap: "Custom game engine with procedural maze generation, loot tables, progression systems, and expansion packs — all in Lua with Roblox-specific APIs. Zero documentation for AI agents to understand the server/client split.",
    previewLines: [
      "# AGENTS.md — ruuuun",
      "",
      "## Project Context",
      "This is a **game** built with **Lua** for **Roblox**.",
      "RUUUUN!!! is a battle royale: loot-scramble opener",
      "into a procedurally generated maze chase.",
      "",
      "### Game Loop",
      "1. Lobby     — 2-50 players queue",
      "2. Loot      — scramble for weapons/items",
      "3. Maze      — procedural generation, PvE chase",
      "4. Extract   — reach exit or be eliminated",
      "",
      "### Architecture",
      "| Folder              | Role                  |",
      "|---------------------|-----------------------|",
      "| ServerScriptService | Authority, game state |",
      "| ReplicatedStorage   | Shared modules, data  |",
      "| StarterPlayer       | Client UI, input      |",
      "",
      "### Systems",
      "- Procedural maze generation (deterministic seed)",
      "- Loot tables with rarity tiers",
    ],
  },
];

// ─── Components ──────────────────────────────────────────────────

function ArtifactCount({ count }: { count: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        border: "3px solid var(--green)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 4px",
        fontSize: "1rem", fontWeight: 800, color: "var(--green)",
      }}>{count}</div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>artifacts</div>
    </div>
  );
}

function CodePreview({ lines }: { lines: string[] }) {
  return (
    <div style={{
      background: "var(--bg-code, rgba(0,0,0,0.05))",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "12px 16px",
      fontSize: "0.68rem",
      fontFamily: "var(--mono)",
      lineHeight: 1.7,
      overflow: "auto",
      maxHeight: 280,
      whiteSpace: "pre",
      color: "var(--text-muted)",
    }}>
      {lines.join("\n")}
    </div>
  );
}

function ExampleCard({ ex, expanded, onToggle }: { ex: Example; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      overflow: "hidden", background: "var(--bg-card)",
    }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "16px 20px", display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          gap: 16, alignItems: "center", textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
          {ex.id}
        </span>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 3 }}>{ex.title}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {ex.stack.join(" · ")} — {ex.stats.files} files, {ex.stats.loc.toLocaleString()} LOC
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              border: "3px solid var(--red, #ef4444)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", fontWeight: 800, color: "var(--red, #ef4444)",
            }}>0</div>
            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 2 }}>before</div>
          </div>
          <div style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>→</div>
          <ArtifactCount count={ex.afterCount} />
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "16px 0 12px", lineHeight: 1.6 }}>
            {ex.description}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 8 }}>Gap (before AXIS)</p>
              <div style={{
                padding: "10px 12px", background: "rgba(239,68,68,0.05)",
                border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius)",
                fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6,
              }}>
                {ex.gap}
              </div>
            </div>
            <div>
              <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 8 }}>Key artifacts generated</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ex.keyArtifacts.map(a => (
                  <div key={a.file} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ color: "var(--green)", fontSize: "0.7rem", flexShrink: 0 }}>✓</span>
                    <div>
                      <code style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--accent)" }}>{a.file}</code>
                      <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginLeft: 6 }}>{a.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AGENTS.md preview */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 8 }}>Preview — generated AGENTS.md</p>
            <CodePreview lines={ex.previewLines} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={`https://github.com/lastmanupinc-hub/axis-iliad/tree/main/examples/${ex.id}-${ex.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", padding: "6px 14px",
                background: "var(--accent)", color: "#fff",
                borderRadius: "var(--radius)", fontSize: "0.73rem",
                fontWeight: 600, textDecoration: "none",
              }}
            >
              View on GitHub
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export function ExamplesPage() {
  const [expanded, setExpanded] = useState<string | null>("01");

  function toggle(id: string) {
    setExpanded(prev => prev === id ? null : id);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 40px" }}>
      {/* Hero */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 8 }}>
          Before &amp; After — 5 Real Repos
        </h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.7 }}>
          Five codebases across Go, Python, TypeScript, Lua, and YAML — each went from{" "}
          <strong style={{ color: "var(--red, #ef4444)" }}>0 AI context files</strong> to{" "}
          <strong style={{ color: "var(--green)" }}>75 structured artifacts</strong>.
          Browse the generated AGENTS.md, CLAUDE.md, .cursorrules, debug playbooks, and more.
        </p>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Repos analyzed", value: "5", color: "var(--accent)" },
            { label: "Languages covered", value: "5", color: "var(--text)" },
            { label: "Before (AI files)", value: "0", color: "var(--red, #ef4444)" },
            { label: "After (per repo)", value: "75", color: "var(--green)" },
          ].map(stat => (
            <div key={stat.label} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", textAlign: "center" }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: stat.color, marginBottom: 3 }}>{stat.value}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="https://github.com/lastmanupinc-hub/axis-iliad/tree/main/examples"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", padding: "8px 16px",
              background: "var(--accent)", color: "#fff",
              borderRadius: "var(--radius)", fontSize: "0.8rem", fontWeight: 700,
              textDecoration: "none",
            }}
          >
            View all examples on GitHub →
          </a>
          <a
            href="#upload"
            style={{
              display: "inline-block", padding: "8px 16px",
              border: "1px solid var(--border)", color: "var(--text)",
              borderRadius: "var(--radius)", fontSize: "0.8rem", fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Try it on your repo
          </a>
        </div>
      </div>

      {/* What you get */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}>What AXIS generates for every repo</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 6, color: "var(--green)" }}>Free (3 programs, 12 files)</p>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              AGENTS.md · CLAUDE.md · .cursorrules · context-map.json · copilot-instructions.md · debug-playbook.md · incident-template.md · tracing-rules.md
            </div>
          </div>
          <div>
            <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>Pro (16 programs, 89 files)</p>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              frontend-rules.md · component-guidelines.md · seo-rules.md · schema-recommendations.json · optimization-rules.md · theme.css · design-tokens.json · brand-guidelines.md · mcp-config.json · superpower-pack.md · and 77 more
            </div>
          </div>
          <div>
            <p style={{ fontSize: "0.73rem", fontWeight: 600, marginBottom: 6 }}>How it works</p>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              Upload your repo (zip, folder, or GitHub URL). AXIS detects 60+ languages and 10+ frameworks, builds a context graph, then fires 99 generators across 19 programs.
            </div>
          </div>
        </div>
      </div>

      {/* Example cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {EXAMPLES.map(ex => (
          <ExampleCard
            key={ex.id}
            ex={ex}
            expanded={expanded === ex.id}
            onToggle={() => toggle(ex.id)}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="card" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
          Your repo is next
        </h2>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.7 }}>
          Upload a ZIP, select a folder, or paste a GitHub URL.
          One scan generates 99 artifacts across 19 programs. Takes under 60 seconds.
        </p>
        <a
          href="#upload"
          style={{
            display: "inline-block", padding: "10px 22px",
            background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)",
            fontSize: "0.85rem", fontWeight: 700, textDecoration: "none",
          }}
        >
          Analyze your repo — free tier available
        </a>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8 }}>
          3 free programs (Search, Skills, Debug). No credit card required.
        </p>
      </div>
    </div>
  );
}
