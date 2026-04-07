import { useState } from "react";
import { Icon } from "../components/AxisIcons";

type DocSection = "overview" | "programs" | "api" | "outputs" | "cli";

interface ProgramDoc {
  name: string;
  label: string;
  icon: string;
  category: string;
  promise: string;
  endpoints: string[];
  tier: "free" | "pro";
  description: string;
  generatorCount: number;
  outputFiles: string[];
  freeFeatures: string[];
  paidFeatures: string[];
  notes?: string;
}

const PROGRAM_DOCS: ProgramDoc[] = [
  {
    name: "search", label: "Axis Search", icon: "search", category: "Repo Intelligence",
    promise: "Understand the repo faster",
    description: "Search and map codebases, docs, prompts, and architecture context from a project snapshot.",
    tier: "free", generatorCount: 4,
    endpoints: ["POST /v1/search/analyze", "POST /v1/search/export"],
    outputFiles: [".ai/context-map.json", ".ai/repo-profile.yaml", "architecture-summary.md", "dependency-hotspots.md"],
    freeFeatures: ["Limited snapshot runs", "Basic repo map", "Preview results"],
    paidFeatures: ["Full repo index", "Saved indexes", "Cross-project search", "Export context map", "API access"],
  },
  {
    name: "skills", label: "Axis Skills", icon: "skills", category: "Governance",
    promise: "Generate project-specific AI governance files",
    description: "Generate root-level guidance, workflows, and AI control files tailored to the project.",
    tier: "free", generatorCount: 5,
    endpoints: ["POST /v1/skills/generate", "POST /v1/skills/export"],
    outputFiles: ["AGENTS.md", "CLAUDE.md", "CURSOR.md", ".cursorrules", ".ai/workflows/", ".ai/policies/"],
    freeFeatures: ["Limited file previews", "Basic skill generation"],
    paidFeatures: ["Full file exports", "Versioned governance", "Workflow library", "Reusable templates", "API access"],
    notes: "Framework-aware (TS/JS/Python-specific rules)",
  },
  {
    name: "debug", label: "Axis Debug", icon: "debug", category: "Repo Intelligence",
    promise: "Find root cause faster",
    description: "Turn code, logs, traces, and project context into repeatable debugging reports and playbooks.",
    tier: "free", generatorCount: 4,
    endpoints: ["POST /v1/debug/analyze", "POST /v1/debug/generate"],
    outputFiles: [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
    freeFeatures: ["Limited debug runs", "Issue preview", "Basic playbook preview"],
    paidFeatures: ["Full debug reports", "Saved incidents", "Root-cause playbooks", "Trace evaluations", "API access"],
  },
  {
    name: "frontend", label: "Axis Frontend", icon: "frontend", category: "Engineering Delivery",
    promise: "Make UI work match the project's actual standards",
    description: "Audit frontend structure and produce component, layout, and interface rules aligned to the repo.",
    tier: "pro", generatorCount: 4,
    endpoints: ["POST /v1/frontend/audit", "POST /v1/frontend/generate"],
    outputFiles: [".ai/frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
    freeFeatures: ["Limited UI audits", "Preview guidelines"],
    paidFeatures: ["Full UI audits", "Component guidelines", "Screen generation", "Design specs", "API access"],
    notes: "Framework-aware (React, Next.js, Vue, Svelte)",
  },
  {
    name: "seo", label: "Axis SEO", icon: "seo", category: "Growth & Content",
    promise: "Improve discoverability from inside the codebase",
    description: "Analyze routes, content structure, schema, and technical SEO directly from the project.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/seo/analyze", "POST /v1/seo/generate"],
    outputFiles: [".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json"],
    freeFeatures: ["Single route audit", "Preview recommendations"],
    paidFeatures: ["Full site analysis", "Route priority maps", "Schema recommendations", "Competitor exports", "API access"],
    notes: "SSR/SSG vs SPA awareness (Next.js, React)",
  },
  {
    name: "optimization", label: "Axis Optimization", icon: "optimization", category: "Repo Intelligence",
    promise: "Reduce waste and improve prompt and context efficiency",
    description: "Analyze prompts, context packing, and model workflows for cost, clarity, and output quality.",
    tier: "pro", generatorCount: 4,
    endpoints: ["POST /v1/optimization/analyze", "POST /v1/optimization/generate"],
    outputFiles: [".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
    freeFeatures: ["Single analysis", "Optimization score preview"],
    paidFeatures: ["Batch optimization", "Before/after comparisons", "Cost reports", "Organization rules", "API access"],
    notes: "Calculates actual LOC and token estimates from scanned code",
  },
  {
    name: "theme", label: "Axis Theme", icon: "theme", category: "Design System",
    promise: "Generate project-consistent themes and token systems",
    description: "Produce design tokens, theme packs, and implementation rules from existing brand and UI signals.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/theme/generate", "POST /v1/theme/export"],
    outputFiles: [".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
    freeFeatures: ["Basic palette generation", "Preview tokens"],
    paidFeatures: ["Full token systems", "Export theme files", "Multiple theme variants", "Brand sync", "API access"],
  },
  {
    name: "brand", label: "Axis Brand", icon: "brand", category: "Growth & Content",
    promise: "Turn brand intent into enforceable AI content rules",
    description: "Structure tone, voice, and content constraints into reusable system files and prompt-ready guidance.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/brand/generate", "POST /v1/brand/export"],
    outputFiles: ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", "channel-rulebook.md"],
    freeFeatures: ["One brand profile", "Tone preview"],
    paidFeatures: ["Multiple brand kits", "Channel-specific rules", "Team sharing", "Export packs", "API access"],
    notes: "Adapts to project type (web app, CLI, library)",
  },
  {
    name: "superpowers", label: "Axis Superpowers", icon: "superpowers", category: "Engineering Delivery",
    promise: "Give builders reusable high-leverage development workflows",
    description: "Package debugging, planning, testing, and refactoring actions into repeatable, project-aware tools.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/superpowers/generate", "POST /v1/superpowers/export"],
    outputFiles: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
    freeFeatures: ["Utility-level functions", "Limited runs"],
    paidFeatures: ["Project workflows", "Pipeline automation", "Team playbooks", "Reusable actions", "API access"],
  },
  {
    name: "marketing", label: "Axis Marketing", icon: "marketing", category: "Growth & Content",
    promise: "Build reusable growth systems from one project context",
    description: "Generate campaigns, copy systems, funnel logic, and growth playbooks tied to the product.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/marketing/generate", "POST /v1/marketing/export"],
    outputFiles: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
    freeFeatures: ["Limited templates", "One campaign preview"],
    paidFeatures: ["Campaign workspaces", "Sequence exports", "Funnel maps", "Team templates", "API access"],
  },
  {
    name: "notebook", label: "Axis Notebook", icon: "notebook", category: "Knowledge & Context",
    promise: "Turn source materials into structured research artifacts",
    description: "Build project-specific notebooks, summaries, and source-linked outputs from uploaded materials.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/notebook/generate", "POST /v1/notebook/export"],
    outputFiles: ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
    freeFeatures: ["Limited uploads", "Summary preview"],
    paidFeatures: ["Larger collections", "Saved notebooks", "Export artifacts", "Workflow generation", "API access"],
  },
  {
    name: "obsidian", label: "Axis Obsidian", icon: "obsidian", category: "Knowledge & Context",
    promise: "Bring structured AI workflows into vault-based knowledge systems",
    description: "Generate vault-aware workflows, linking rules, and knowledge graph helpers for Obsidian users.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/obsidian/analyze", "POST /v1/obsidian/generate"],
    outputFiles: ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
    freeFeatures: ["Basic vault helpers", "Limited skill packs"],
    paidFeatures: ["Advanced vault analysis", "Graph workflows", "Premium skill packs", "Export/import tools", "API access"],
  },
  {
    name: "mcp", label: "Axis MCP", icon: "mcp", category: "Engineering Delivery",
    promise: "Connect tools and services through a hosted protocol layer",
    description: "Provide private, hosted MCP endpoints and capability orchestration for build workflows.",
    tier: "pro", generatorCount: 4,
    endpoints: ["POST /v1/mcp/provision", "POST /v1/mcp/configure", "GET /v1/mcp/registry"],
    outputFiles: ["mcp-config.json", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml"],
    freeFeatures: ["Sandbox server", "Limited connections"],
    paidFeatures: ["Hosted private endpoints", "Persistent configs", "Auth management", "Usage logs", "Webhooks"],
  },
  {
    name: "artifacts", label: "Axis Artifacts", icon: "artifacts", category: "Engineering Delivery",
    promise: "Generate drop-in web artifacts for the active project",
    description: "Create dashboards, widgets, calculators, and mini-apps that match the project stack and style.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/artifacts/generate", "POST /v1/artifacts/export"],
    outputFiles: ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json"],
    freeFeatures: ["Preview artifacts", "Limited generations"],
    paidFeatures: ["Export code", "Save templates", "Deploy support", "Embed outputs", "API access"],
  },
  {
    name: "remotion", label: "Axis Remotion", icon: "remotion", category: "Creative Generation",
    promise: "Turn structured inputs into automated video workflows",
    description: "Generate scripts, scenes, and render-ready plans for video output tied to product or brand context.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/remotion/generate", "POST /v1/remotion/export"],
    outputFiles: ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
    freeFeatures: ["Short script generation", "Scene preview"],
    paidFeatures: ["Rendering workflows", "Reusable templates", "Batch generation", "Branded exports", "API access"],
  },
  {
    name: "canvas", label: "Axis Canvas", icon: "canvas", category: "Creative Generation",
    promise: "Generate structured design assets in the Axis visual language",
    description: "Create posters, social assets, panels, and visual surfaces aligned to the system theme.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/canvas/generate", "POST /v1/canvas/export"],
    outputFiles: ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "brand-board.md"],
    freeFeatures: ["Watermarked exports", "Limited templates"],
    paidFeatures: ["Clean exports", "Full template library", "Multi-format output", "Brand sync", "API access"],
  },
  {
    name: "algorithmic", label: "Axis Algorithmic", icon: "algorithmic", category: "Creative Generation",
    promise: "Turn parameter spaces into generative visual outputs",
    description: "Generate p5.js sketches, parameter packs, collection maps, and variation matrices for creative coding.",
    tier: "pro", generatorCount: 5,
    endpoints: ["POST /v1/algorithmic/generate", "POST /v1/algorithmic/export"],
    outputFiles: ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
    freeFeatures: ["Single sketch generation", "Preview output"],
    paidFeatures: ["Batch generation", "Collection management", "Export manifests", "High-res output", "API access"],
  },
];

const API_ENDPOINTS = [
  { method: "POST", path: "/v1/snapshots", description: "Create a new snapshot from uploaded source files", auth: true },
  { method: "GET", path: "/v1/projects/:id/generated-files", description: "List all generated files for a project", auth: true },
  { method: "GET", path: "/v1/projects/:id/generated-files/:path", description: "Get contents of a specific generated file", auth: true },
  { method: "POST", path: "/v1/{program}/endpoint", description: "Run a specific program against a snapshot", auth: true },
  { method: "GET", path: "/v1/projects/:id/export", description: "Export all generated files as ZIP", auth: true },
  { method: "GET", path: "/v1/health", description: "Health check — returns status and version", auth: false },
  { method: "POST", path: "/v1/search/index", description: "Build full-text search index for a snapshot", auth: true },
  { method: "POST", path: "/v1/search/query", description: "Full-text search across indexed snapshot", auth: true },
  { method: "POST", path: "/v1/accounts", description: "Create a new account", auth: false },
  { method: "GET", path: "/v1/account", description: "Get current account details", auth: true },
  { method: "POST", path: "/v1/account/keys", description: "Create a new API key", auth: true },
  { method: "GET", path: "/v1/account/keys", description: "List all API keys", auth: true },
  { method: "GET", path: "/v1/account/usage", description: "Get usage statistics", auth: true },
  { method: "GET", path: "/v1/plans", description: "List available plans and features", auth: false },
  { method: "GET", path: "/v1/account/funnel", description: "Get funnel/onboarding status", auth: true },
  { method: "POST", path: "/v1/account/seats", description: "Invite a team member", auth: true },
  { method: "GET", path: "/v1/account/seats", description: "List team seats", auth: true },
];

export function DocsPage() {
  const [section, setSection] = useState<DocSection>("overview");
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  const sections: { id: DocSection; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "docs-overview" },
    { id: "programs", label: "Programs", icon: "toolbox" },
    { id: "api", label: "API Reference", icon: "api-link" },
    { id: "outputs", label: "Output Formats", icon: "file-doc" },
    { id: "cli", label: "CLI Usage", icon: "terminal" },
  ];

  return (
    <div>
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Documentation</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto" }}>
          Everything you need to know about Axis Toolbox — programs, API, outputs, and CLI.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`tab ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <Icon name={s.icon} /> {s.label}
          </button>
        ))}
      </div>

      {section === "overview" && <OverviewSection />}
      {section === "programs" && (
        <ProgramsSection expanded={expandedProgram} onToggle={setExpandedProgram} />
      )}
      {section === "api" && <ApiSection />}
      {section === "outputs" && <OutputsSection />}
      {section === "cli" && <CliSection />}
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>What is Axis Toolbox?</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
          Axis is the umbrella platform for AI-native development — a multi-program system
          that turns project snapshots into diagnostics, governed outputs, and build-integrated
          tooling. It provides shared identity, snapshot intake, project context, and a unified
          design system across 17 separately billable programs organized into 6 categories:
          Repo Intelligence, Governance, Engineering Delivery, Growth &amp; Content,
          Knowledge &amp; Context, Design System, and Creative Generation.
        </p>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
          <strong style={{ color: "var(--accent)" }}>Positioning:</strong>{" "}
          The operating system for AI-native development. Free gives diagnosis — paid gives execution.
          Every program is purchasable individually, while the Suite bundle is optional.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>How It Works</h3>
        <div className="grid grid-3">
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}><Icon name="upload" /></div>
            <h4 style={{ marginBottom: 4 }}>1. Upload</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Drop a folder, upload a ZIP, or paste a GitHub URL. Axis scans all source files.
            </p>
          </div>
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}><Icon name="analyze" /></div>
            <h4 style={{ marginBottom: 4 }}>2. Analyze</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              The snapshot engine detects frameworks, languages, structure, dependencies, and patterns.
            </p>
          </div>
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}><Icon name="toolbox" /></div>
            <h4 style={{ marginBottom: 4 }}>3. Generate</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Run any of 17 programs to produce specialized output files — rules, configs, docs, and more.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Quick Stats</h3>
        <div className="grid grid-4">
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">17</div>
            <div className="stat-label">Programs</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">80</div>
            <div className="stat-label">Generators</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">3 Free</div>
            <div className="stat-label">14 Pro</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">6</div>
            <div className="stat-label">Categories</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Snapshot Lifecycle</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          Every analysis follows the same six-stage pipeline. Understanding this flow
          helps you get the most from each program run.
        </p>
        <div className="grid grid-3" style={{ gap: 12 }}>
          {[
            { stage: "1. Intake", icon: "inbox", desc: "Files received via folder upload, ZIP, or GitHub clone. Binary and ignored paths are filtered out." },
            { stage: "2. Parse", icon: "zoom", desc: "Each source file is tokenized — language, imports, exports, and AST structure are extracted." },
            { stage: "3. Detect", icon: "flask", desc: "Frameworks, libraries, build tools, and project type are identified from dependency manifests and code patterns." },
            { stage: "4. Context", icon: "brain", desc: "A project-wide context object is assembled: file tree, dependency graph, framework signals, and README content." },
            { stage: "5. Generate", icon: "gear", desc: "Selected programs consume the context object and produce output files — each generator writes one artifact." },
            { stage: "6. Export", icon: "package", desc: "Generated files are stored per-project and available for preview, copy, download, or ZIP export." },
          ].map((s) => (
            <div key={s.stage} className="card" style={{ padding: 14, marginBottom: 0 }}>
              <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                <Icon name={s.icon} />
                <strong style={{ fontSize: "0.8125rem" }}>{s.stage}</strong>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Architecture &amp; Tech Stack</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          Axis Toolbox is a monorepo with three packages — a React frontend, a Node.js API
          server, and a shared types/utils package.
        </p>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>Frontend</strong>
            <div className="flex-wrap" style={{ gap: 6 }}>
              {["React 19", "Vite 6", "TypeScript 5.7", "Dark-mode CSS", "Hash Router"].map((t) => (
                <span key={t} className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }}>{t}</span>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>API Server</strong>
            <div className="flex-wrap" style={{ gap: 6 }}>
              {["Node.js 22", "tsx (ESM)", "SQLite + FTS5", "better-sqlite3", "REST / JSON"].map((t) => (
                <span key={t} className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }}>{t}</span>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>Monorepo Layout</strong>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.8, color: "var(--text-muted)" }}>
              <div>apps/web/ &nbsp;— React frontend (Vite)</div>
              <div>apps/api/ &nbsp;— REST API server</div>
              <div>packages/ — shared types &amp; utils</div>
            </div>
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>Key Infrastructure</strong>
            <div className="flex-wrap" style={{ gap: 6 }}>
              {["pnpm workspaces", "vitest", "JSZip", "FTS5 search", "Bearer auth"].map((t) => (
                <span key={t} className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Program Categories</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          The 17 programs are organized into 6 functional categories. Each category addresses
          a different dimension of the development lifecycle.
        </p>
        <div className="grid grid-3" style={{ gap: 12 }}>
          {[
            { cat: "Repo Intelligence", icon: "search", programs: ["Search", "Debug", "Optimization"], desc: "Understand, diagnose, and improve your codebase" },
            { cat: "Governance", icon: "skills", programs: ["Skills"], desc: "Generate AI control files and workflow policies" },
            { cat: "Engineering Delivery", icon: "frontend", programs: ["Frontend", "Superpowers", "MCP", "Artifacts"], desc: "Audit UI, automate workflows, connect services" },
            { cat: "Growth & Content", icon: "seo", programs: ["SEO", "Brand", "Marketing"], desc: "Improve discoverability, content systems, and growth" },
            { cat: "Knowledge & Context", icon: "notebook", programs: ["Notebook", "Obsidian"], desc: "Structure research and vault-based knowledge" },
            { cat: "Creative Generation", icon: "remotion", programs: ["Theme", "Remotion", "Canvas", "Algorithmic"], desc: "Design tokens, video, visual assets, generative art" },
          ].map((c) => (
            <div key={c.cat} className="card" style={{ padding: 14, marginBottom: 0 }}>
              <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                <Icon name={c.icon} />
                <strong style={{ fontSize: "0.8125rem" }}>{c.cat}</strong>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.5, marginBottom: 8 }}>{c.desc}</p>
              <div className="flex-wrap" style={{ gap: 4 }}>
                {c.programs.map((p) => (
                  <span key={p} className="badge badge-accent" style={{ fontSize: "0.625rem" }}>{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Authentication</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          All authenticated endpoints require a Bearer token in the <code className="mono">Authorization</code> header.
          API keys use the <code className="mono">axis_</code> prefix. Keys are created during account signup
          and can be rotated from the Account page.
        </p>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.8125rem" }}>
          <span style={{ color: "var(--text-muted)" }}>Authorization:</span>{" "}
          <span style={{ color: "var(--accent)" }}>Bearer axis_your_api_key_here</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 6 }}>Key Format</strong>
          <table>
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Length</th>
                <th>Character Set</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono" style={{ fontSize: "0.8125rem" }}>axis_</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>64 chars total</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Alphanumeric + underscore</td>
                <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>axis_a1b2c3d4e5f6...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProgramsSection({
  expanded,
  onToggle,
}: {
  expanded: string | null;
  onToggle: (name: string | null) => void;
}) {
  const free = PROGRAM_DOCS.filter((p) => p.tier === "free");
  const pro = PROGRAM_DOCS.filter((p) => p.tier === "pro");

  return (
    <div className="stagger">
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3>Free Programs</h3>
          <span className="badge badge-green">{free.length} programs</span>
        </div>
        {free.map((p) => (
          <ProgramDocCard
            key={p.name}
            program={p}
            expanded={expanded === p.name}
            onToggle={() => onToggle(expanded === p.name ? null : p.name)}
          />
        ))}
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3>Pro Programs</h3>
          <span className="badge badge-accent">{pro.length} programs</span>
        </div>
        {pro.map((p) => (
          <ProgramDocCard
            key={p.name}
            program={p}
            expanded={expanded === p.name}
            onToggle={() => onToggle(expanded === p.name ? null : p.name)}
          />
        ))}
      </div>
    </div>
  );
}

function ProgramDocCard({
  program,
  expanded,
  onToggle,
}: {
  program: ProgramDoc;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "12px 0",
      }}
    >
      <div
        className="flex-between"
        style={{ cursor: "pointer" }}
        onClick={onToggle}
      >
        <div className="flex" style={{ gap: 10 }}>
          <span style={{ fontSize: "1.1rem" }}><Icon name={program.icon} /></span>
          <div>
            <strong style={{ fontSize: "0.875rem" }}>{program.label}</strong>
            <span
              className={`badge ${program.tier === "free" ? "badge-green" : "badge-accent"}`}
              style={{ marginLeft: 8, fontSize: "0.6875rem" }}
            >
              {program.tier}
            </span>
            <span
              className="badge"
              style={{ marginLeft: 4, fontSize: "0.6875rem", background: "var(--bg)" }}
            >
              {program.category}
            </span>
          </div>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 32 }} className="animate-fade-in">
          <p style={{ color: "var(--accent)", fontSize: "0.875rem", fontStyle: "italic", marginBottom: 8 }}>
            "{program.promise}"
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6, marginBottom: 12 }}>
            {program.description}
          </p>
          {program.notes && (
            <p style={{ color: "var(--yellow)", fontSize: "0.75rem", marginBottom: 12 }}>
              <Icon name="bolt" /> {program.notes}
            </p>
          )}

          <div className="grid grid-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Endpoints</strong>
              <div style={{ marginTop: 4 }}>
                {program.endpoints.map((ep) => {
                  const [method, ...pathParts] = ep.split(" ");
                  return (
                    <div
                      key={ep}
                      className="mono"
                      style={{
                        background: "var(--bg)",
                        padding: "4px 8px",
                        borderRadius: "var(--radius)",
                        fontSize: "0.75rem",
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: method === "GET" ? "var(--green)" : "var(--accent)" }}>{method}</span>{" "}
                      {pathParts.join(" ")}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Output Files ({program.generatorCount} generators)
              </strong>
              <div className="flex-wrap" style={{ gap: 4, marginTop: 4 }}>
                {program.outputFiles.map((f) => (
                  <span
                    key={f}
                    className="badge"
                    style={{ fontSize: "0.6875rem", background: "var(--bg)" }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <strong style={{ fontSize: "0.75rem", color: "var(--green)" }}>Free Features</strong>
              <ul style={{ paddingLeft: 16, margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {program.freeFeatures.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div>
              <strong style={{ fontSize: "0.75rem", color: "var(--accent)" }}>Paid Features</strong>
              <ul style={{ paddingLeft: 16, margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {program.paidFeatures.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Base URL</h3>
        <div
          className="mono"
          style={{
            background: "var(--bg)",
            padding: 12,
            borderRadius: "var(--radius)",
            fontSize: "0.875rem",
          }}
        >
          http://localhost:4000/v1
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 8 }}>
          All endpoints are prefixed with <code className="mono">/v1</code>.
          Authenticated endpoints require a valid <code className="mono">axis_*</code> Bearer token.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Endpoints</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: "10%" }}>Method</th>
              <th style={{ width: "40%" }}>Path</th>
              <th style={{ width: "40%" }}>Description</th>
              <th style={{ width: "10%", textAlign: "center" }}>Auth</th>
            </tr>
          </thead>
          <tbody>
            {API_ENDPOINTS.map((ep) => (
              <tr key={`${ep.method}-${ep.path}`}>
                <td>
                  <span
                    className="badge"
                    style={{
                      fontSize: "0.6875rem",
                      background: ep.method === "GET" ? "var(--green)" : "var(--accent)",
                      color: "white",
                    }}
                  >
                    {ep.method}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: "0.8125rem" }}>{ep.path}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>{ep.description}</td>
                <td style={{ textAlign: "center" }}>
                  {ep.auth ? (
                    <span style={{ color: "var(--yellow)" }}><Icon name="key" /></span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Request &amp; Response Examples</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 16 }}>
          All request bodies are JSON. Responses include a top-level <code className="mono">ok</code> boolean
          and a <code className="mono">data</code> object (or <code className="mono">error</code> string on failure).
        </p>

        {/* Example 1: Create Snapshot */}
        <div style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>
            <span className="badge badge-accent" style={{ fontSize: "0.625rem", marginRight: 6 }}>POST</span>
            Create Snapshot
          </strong>
          <div style={{ background: "var(--bg)", padding: 16, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, overflowX: "auto" }}>
            <div><span style={{ color: "var(--text-muted)" }}>curl</span> -X POST http://localhost:4000/v1/snapshots \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Authorization: Bearer axis_your_key"</span> \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Content-Type: application/json"</span> \</div>
            <div>&nbsp; -d <span style={{ color: "var(--yellow)" }}>'{`{`}</span></div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--yellow)" }}>{`"project_name": "my-app",`}</span></div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--yellow)" }}>{`"project_type": "web_app",`}</span></div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--yellow)" }}>{`"goals": "Improve test coverage",`}</span></div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--yellow)" }}>{`"files": [{"path": "src/app.ts", "content": "..."}]`}</span></div>
            <div>&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--yellow)" }}>{`}`}</span>'</div>
          </div>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, marginTop: 6, overflowX: "auto" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>// Response 200</div>
            <div>{`{ "ok": true, "data": { "project_id": "prj_abc123", "snapshot_id": "snap_def456",`}</div>
            <div>&nbsp;&nbsp;{`"file_count": 42, "languages": ["typescript","css"], "frameworks": ["react","vite"] } }`}</div>
          </div>
        </div>

        {/* Example 2: Run Program */}
        <div style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>
            <span className="badge badge-accent" style={{ fontSize: "0.625rem", marginRight: 6 }}>POST</span>
            Run a Program
          </strong>
          <div style={{ background: "var(--bg)", padding: 16, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, overflowX: "auto" }}>
            <div><span style={{ color: "var(--text-muted)" }}>curl</span> -X POST http://localhost:4000/v1/search/analyze \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Authorization: Bearer axis_your_key"</span> \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Content-Type: application/json"</span> \</div>
            <div>&nbsp; -d <span style={{ color: "var(--yellow)" }}>{`'{"project_id": "prj_abc123"}'`}</span></div>
          </div>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, marginTop: 6, overflowX: "auto" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>// Response 200</div>
            <div>{`{ "ok": true, "data": { "program": "search", "files_generated": 4,`}</div>
            <div>&nbsp;&nbsp;{`"files": [".ai/context-map.json", ".ai/repo-profile.yaml",`}</div>
            <div>&nbsp;&nbsp;&nbsp;{`"architecture-summary.md", "dependency-hotspots.md"] } }`}</div>
          </div>
        </div>

        {/* Example 3: Get Generated Files */}
        <div style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>
            <span className="badge" style={{ fontSize: "0.625rem", marginRight: 6, background: "var(--green)", color: "white" }}>GET</span>
            List Generated Files
          </strong>
          <div style={{ background: "var(--bg)", padding: 16, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, overflowX: "auto" }}>
            <div><span style={{ color: "var(--text-muted)" }}>curl</span> http://localhost:4000/v1/projects/prj_abc123/generated-files \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Authorization: Bearer axis_your_key"</span></div>
          </div>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, marginTop: 6, overflowX: "auto" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>// Response 200</div>
            <div>{`{ "ok": true, "data": { "files": [`}</div>
            <div>&nbsp;&nbsp;{`{ "path": ".ai/context-map.json", "program": "search", "size": 4210,`}</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;{`"created_at": "2025-01-15T10:30:00Z" },`}</div>
            <div>&nbsp;&nbsp;{`{ "path": "AGENTS.md", "program": "skills", "size": 2048,`}</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;{`"created_at": "2025-01-15T10:31:00Z" }`}</div>
            <div>&nbsp;&nbsp;{`] } }`}</div>
          </div>
        </div>

        {/* Example 4: Search Query */}
        <div style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>
            <span className="badge badge-accent" style={{ fontSize: "0.625rem", marginRight: 6 }}>POST</span>
            Search Snapshot
          </strong>
          <div style={{ background: "var(--bg)", padding: 16, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, overflowX: "auto" }}>
            <div><span style={{ color: "var(--text-muted)" }}>curl</span> -X POST http://localhost:4000/v1/search/query \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Authorization: Bearer axis_your_key"</span> \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Content-Type: application/json"</span> \</div>
            <div>&nbsp; -d <span style={{ color: "var(--yellow)" }}>{`'{"project_id": "prj_abc123", "query": "handleSubmit", "limit": 10}'`}</span></div>
          </div>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, marginTop: 6, overflowX: "auto" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>// Response 200</div>
            <div>{`{ "ok": true, "data": { "results": [`}</div>
            <div>&nbsp;&nbsp;{`{ "file": "src/components/Form.tsx", "line": 45,`}</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;{`"snippet": "async function handleSubmit(data: FormData) {",`}</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;{`"score": 0.95 }`}</div>
            <div>&nbsp;&nbsp;{`], "total": 1 } }`}</div>
          </div>
        </div>

        {/* Example 5: Create Account */}
        <div>
          <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 8 }}>
            <span className="badge badge-accent" style={{ fontSize: "0.625rem", marginRight: 6 }}>POST</span>
            Create Account
          </strong>
          <div style={{ background: "var(--bg)", padding: 16, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, overflowX: "auto" }}>
            <div><span style={{ color: "var(--text-muted)" }}>curl</span> -X POST http://localhost:4000/v1/accounts \</div>
            <div>&nbsp; -H <span style={{ color: "var(--green)" }}>"Content-Type: application/json"</span> \</div>
            <div>&nbsp; -d <span style={{ color: "var(--yellow)" }}>{`'{"name": "Jane Doe", "email": "jane@example.com"}'`}</span></div>
          </div>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.6, marginTop: 6, overflowX: "auto" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>// Response 200</div>
            <div>{`{ "ok": true, "data": { "account_id": "acc_xyz789",`}</div>
            <div>&nbsp;&nbsp;{`"api_key": "axis_a1b2c3...(64 chars)", "plan": "free",`}</div>
            <div>&nbsp;&nbsp;{`"limits": { "snapshots_per_month": 10, "programs": 3, "seats": 1 } } }`}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Pagination &amp; Filtering</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          List endpoints accept optional query parameters for pagination and filtering.
        </p>
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Type</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>limit</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>number</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>50</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Max items per page (1–200)</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>offset</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>number</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>0</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Number of items to skip</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>program</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>string</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Filter generated files by program name</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>sort</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>string</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>created_at</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Sort field: created_at, name, size</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Error Responses</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: "15%" }}>Code</th>
              <th style={{ width: "30%" }}>Status</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><span className="badge badge-yellow">400</span></td><td>Bad Request</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Invalid or missing parameters</td></tr>
            <tr><td><span className="badge badge-yellow">401</span></td><td>Unauthorized</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Missing or invalid API key</td></tr>
            <tr><td><span className="badge badge-yellow">403</span></td><td>Forbidden</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Insufficient tier for this program</td></tr>
            <tr><td><span className="badge badge-red">404</span></td><td>Not Found</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Resource does not exist</td></tr>
            <tr><td><span className="badge badge-red">429</span></td><td>Rate Limit</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Too many requests — retry after cooldown</td></tr>
            <tr><td><span className="badge badge-red">500</span></td><td>Server Error</td><td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Internal error — check server logs</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutputsSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Output Structure</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          Every program generates files organized by program name. Files are returned as part
          of the snapshot response and can be downloaded individually or exported as a ZIP archive.
        </p>
        <div
          style={{
            background: "var(--bg)",
            padding: 16,
            borderRadius: "var(--radius)",
            fontFamily: "var(--mono)",
            fontSize: "0.75rem",
            lineHeight: 1.8,
          }}
        >
          <div style={{ color: "var(--accent)" }}>generated-files/</div>
          <div>&nbsp; <span style={{ color: "var(--green)" }}>search/</span></div>
          <div>&nbsp;&nbsp;&nbsp; .ai/context-map.json</div>
          <div>&nbsp;&nbsp;&nbsp; .ai/repo-profile.yaml</div>
          <div>&nbsp;&nbsp;&nbsp; architecture-summary.md</div>
          <div>&nbsp;&nbsp;&nbsp; dependency-hotspots.md</div>
          <div>&nbsp; <span style={{ color: "var(--green)" }}>skills/</span></div>
          <div>&nbsp;&nbsp;&nbsp; AGENTS.md</div>
          <div>&nbsp;&nbsp;&nbsp; CLAUDE.md</div>
          <div>&nbsp;&nbsp;&nbsp; CURSOR.md</div>
          <div>&nbsp;&nbsp;&nbsp; .cursorrules</div>
          <div>&nbsp;&nbsp;&nbsp; .ai/workflows/</div>
          <div>&nbsp;&nbsp;&nbsp; .ai/policies/</div>
          <div>&nbsp; <span style={{ color: "var(--green)" }}>debug/</span></div>
          <div>&nbsp;&nbsp;&nbsp; .ai/debug-playbook.md</div>
          <div>&nbsp;&nbsp;&nbsp; incident-template.md</div>
          <div>&nbsp;&nbsp;&nbsp; tracing-rules.md</div>
          <div>&nbsp;&nbsp;&nbsp; root-cause-checklist.md</div>
          <div>&nbsp; <span style={{ color: "var(--green)" }}>theme/</span></div>
          <div>&nbsp;&nbsp;&nbsp; .ai/design-tokens.json</div>
          <div>&nbsp;&nbsp;&nbsp; theme.css</div>
          <div>&nbsp;&nbsp;&nbsp; theme-guidelines.md</div>
          <div>&nbsp;&nbsp;&nbsp; component-theme-map.json</div>
          <div>&nbsp;&nbsp;&nbsp; dark-mode-tokens.json</div>
          <div>&nbsp; <span style={{ color: "var(--text-muted)" }}>... (13 more programs)</span></div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Output Files Per Program</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Each program produces 4–6 files. Here is the full inventory across all 17 programs (80 generators total).
        </p>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th>Generators</th>
                <th>Key Output Files</th>
              </tr>
            </thead>
            <tbody>
              {PROGRAM_DOCS.map((p) => (
                <tr key={p.name}>
                  <td>
                    <span style={{ marginRight: 4 }}><Icon name={p.icon} /></span>
                    <span style={{ fontSize: "0.8125rem" }}>{p.label}</span>
                  </td>
                  <td style={{ textAlign: "center", color: "var(--accent)", fontWeight: 600, fontSize: "0.8125rem" }}>{p.generatorCount}</td>
                  <td>
                    <div className="flex-wrap" style={{ gap: 4 }}>
                      {p.outputFiles.slice(0, 3).map((f) => (
                        <span key={f} className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{f}</span>
                      ))}
                      {p.outputFiles.length > 3 && (
                        <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>+{p.outputFiles.length - 3} more</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>File Formats</h3>
        <table>
          <thead>
            <tr>
              <th>Format</th>
              <th>Extension</th>
              <th>Used By</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-green">Markdown</span></td>
              <td className="mono">.md</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Most programs — docs, rules, playbooks</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>AGENTS.md, debug-playbook.md</td>
            </tr>
            <tr>
              <td><span className="badge badge-accent">JSON</span></td>
              <td className="mono">.json</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Tokens, configs, maps, registries</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>design-tokens.json, mcp-config.json</td>
            </tr>
            <tr>
              <td><span className="badge badge-yellow">YAML</span></td>
              <td className="mono">.yaml</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Manifests, pipelines, messaging</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>repo-profile.yaml, automation-pipeline.yaml</td>
            </tr>
            <tr>
              <td><span className="badge badge-blue">CSS</span></td>
              <td className="mono">.css</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Theme program — generated stylesheets</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>theme.css</td>
            </tr>
            <tr>
              <td><span className="badge" style={{ background: "var(--accent)", color: "white" }}>TypeScript/JS</span></td>
              <td className="mono">.tsx, .ts, .js</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Artifacts, Remotion, algorithmic</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>generative-sketch.ts, remotion-script.ts</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Export Options</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Download all generated files as a ZIP archive, or export a single program's output.
          The export endpoint supports query parameters to filter and format.
        </p>
        <div
          className="mono"
          style={{
            background: "var(--bg)",
            padding: 12,
            borderRadius: "var(--radius)",
            fontSize: "0.8125rem",
            marginBottom: 12,
          }}
        >
          <div>GET /v1/projects/:id/export <span style={{ color: "var(--text-muted)" }}>→ full ZIP (all programs)</span></div>
          <div>GET /v1/projects/:id/export?program=search <span style={{ color: "var(--text-muted)" }}>→ search-only ZIP</span></div>
          <div>GET /v1/projects/:id/export?format=tar <span style={{ color: "var(--text-muted)" }}>→ .tar.gz archive</span></div>
          <div>GET /v1/projects/:id/generated-files/:path <span style={{ color: "var(--text-muted)" }}>→ single file content</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Use Case</th>
              <th>Content-Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Full ZIP</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Download everything — all programs, all files</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>application/zip</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Program filter</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Only files from one program (e.g. skills)</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>application/zip</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Single file</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>View or copy one generated file by path</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>text/plain</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>UI copy</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Click the copy icon in Generated Files tab</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>clipboard</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CliSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>CLI Overview</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Axis Toolbox includes a CLI for running analysis directly from your terminal.
          Point it at any directory to generate a snapshot and run programs. Install globally
          or run via <code className="mono">npx</code>.
        </p>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
          <div><span style={{ color: "var(--text-muted)" }}># Install globally</span></div>
          <div>npm install -g axis-toolbox</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Or run without installing</span></div>
          <div>npx axis-toolbox --help</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Commands</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Command</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>analyze &lt;path&gt;</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Scan a directory or file and create a snapshot</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>export &lt;path&gt;</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Export generated files to a local directory</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>list-programs</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Show all 17 programs with tier and category</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>auth</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Store or verify your API key</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>status</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Show account plan, usage, and API health</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>github &lt;url&gt;</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Clone and analyze a GitHub repository</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Usage Examples</h3>
        <div
          style={{
            background: "var(--bg)",
            padding: 16,
            borderRadius: "var(--radius)",
            fontFamily: "var(--mono)",
            fontSize: "0.75rem",
            lineHeight: 1.8,
          }}
        >
          <div><span style={{ color: "var(--text-muted)" }}># Analyze the current directory</span></div>
          <div>npx axis-toolbox analyze .</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Analyze and run specific programs</span></div>
          <div>npx axis-toolbox analyze ./my-project --programs search,skills,debug</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Run all free programs with verbose logging</span></div>
          <div>npx axis-toolbox analyze . --programs search,skills,debug -v</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Analyze a GitHub repo</span></div>
          <div>npx axis-toolbox github https://github.com/user/repo --programs search</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Export generated files to disk</span></div>
          <div>npx axis-toolbox export ./my-project --output ./output</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Export as ZIP</span></div>
          <div>npx axis-toolbox export ./my-project --format zip -o ./my-project-output.zip</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Check account status and usage</span></div>
          <div>npx axis-toolbox status</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Store your API key locally</span></div>
          <div>npx axis-toolbox auth --key axis_your_key_here</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># List all available programs</span></div>
          <div>npx axis-toolbox list-programs</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>CLI Options</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: "25%" }}>Flag</th>
              <th style={{ width: "15%" }}>Alias</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--programs</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>-p</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Comma-separated list of programs to run</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--output</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>-o</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Output directory for generated files</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--api-key</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>API key (overrides env var and stored key)</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--format</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>-f</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Output format: json, markdown, zip, or tar</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--verbose</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>-v</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Enable verbose logging with timing info</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--name</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Set project name (default: directory name)</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--type</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Project type: web_app, api, cli, library, monorepo</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--dry-run</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Show what would happen without running programs</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Environment Variables</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Set these in your shell profile or CI environment. CLI flags override env vars.
        </p>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Description</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>AXIS_API_KEY</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Your API key (used if --api-key not set)</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>axis_a1b2c3...</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>AXIS_API_URL</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Custom API server URL</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>http://localhost:4000</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>AXIS_OUTPUT_DIR</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Default output directory for exports</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>./axis-output</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>AXIS_VERBOSE</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Set to "1" or "true" for verbose mode</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>true</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>CI/CD Integration</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 16 }}>
          Run Axis in your CI pipeline to generate fresh artifacts on every push. Here's a GitHub Actions example:
        </p>
        <div
          style={{
            background: "var(--bg)",
            padding: 16,
            borderRadius: "var(--radius)",
            fontFamily: "var(--mono)",
            fontSize: "0.75rem",
            lineHeight: 1.7,
            overflowX: "auto",
          }}
        >
          <div style={{ color: "var(--text-muted)" }}># .github/workflows/axis.yml</div>
          <div><span style={{ color: "var(--accent)" }}>name:</span> Axis Toolbox</div>
          <div><span style={{ color: "var(--accent)" }}>on:</span> [push]</div>
          <div><span style={{ color: "var(--accent)" }}>jobs:</span></div>
          <div>&nbsp; <span style={{ color: "var(--accent)" }}>analyze:</span></div>
          <div>&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>runs-on:</span> ubuntu-latest</div>
          <div>&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>steps:</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - <span style={{ color: "var(--accent)" }}>uses:</span> actions/checkout@v4</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - <span style={{ color: "var(--accent)" }}>uses:</span> actions/setup-node@v4</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>with:</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>node-version:</span> 22</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - <span style={{ color: "var(--accent)" }}>run:</span> |</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; npx axis-toolbox analyze . \</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; --programs search,skills,debug \</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; --output ./axis-output</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>env:</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>AXIS_API_KEY:</span> {"${{ secrets.AXIS_API_KEY }}"}</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - <span style={{ color: "var(--accent)" }}>uses:</span> actions/upload-artifact@v4</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>with:</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>name:</span> axis-output</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: "var(--accent)" }}>path:</span> ./axis-output</div>
        </div>
      </div>
    </div>
  );
}
