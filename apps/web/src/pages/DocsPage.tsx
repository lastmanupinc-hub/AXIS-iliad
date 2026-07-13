import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/AxisIcons";
import type { PageId } from "../routes.tsx";
import { getOpenApiSpec, getMcpManifest, getErrorCodes, apiErrorDetails, type OpenApiSpec, type McpManifest, type ErrorCodeCatalogResponse } from "../api.ts";
import { Callout, CodeBlock, Skeleton, TableWrap } from "../components/primitives/index.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, FREE_PROGRAM_COUNT, PROGRAM_COUNT, PRO_PROGRAM_COUNT, DOCS_API_BASE } from "../config.ts";

type DocSection = "overview" | "programs" | "api" | "outputs" | "cli" | "mcp" | "errors" | "examples";

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
    tier: "free", generatorCount: 5,
    endpoints: ["POST /v1/search/analyze", "POST /v1/search/export"],
    outputFiles: [".ai/context-map.json", ".ai/repo-profile.yaml", "architecture-summary.md", "dependency-hotspots.md", ".ai/symbol-index.json"],
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
    tier: "pro", generatorCount: 17,
    endpoints: ["POST /v1/mcp/provision", "POST /v1/mcp/configure", "GET /v1/mcp/registry"],
    outputFiles: ["mcp-config.json", "mcp-registry-metadata.json", "protocol-spec.md", "spec.types.ts", "mcp/README.md", "mcp/project-setup.md", "mcp/build-artifacts.md", "mcp/package-json.root.template.json", "mcp/package-json.package.template.json", "mcp/tsconfig.root.template.json", "mcp/tsconfig.package.template.json", "mcp/monorepo-structure.md", "mcp/core-implementation-artifacts.md", "mcp/testing-documentation-polish-artifacts.md", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml"],
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
  {
    name: "agentic-purchasing", label: "Agentic Purchasing", icon: "credit-card", category: "Agentic Commerce",
    promise: "Make the codebase ready for autonomous purchasing agents",
    description: "Generate AP2/UCP-aligned purchasing playbooks, product schemas, checkout-flow documentation, and negotiation rules from the project's commerce signals.",
    tier: "pro", generatorCount: 6,
    endpoints: ["POST /v1/agentic-purchasing/generate"],
    outputFiles: ["agent-purchasing-playbook.md", "product-schema.json", "checkout-flow.md", "negotiation-rules.md", "commerce-registry.json", "ap2-interop-samples.json"],
    freeFeatures: ["Compliance-grade readiness signal (via the Commerce hub)"],
    paidFeatures: ["Purchasing playbook", "Product schema", "Checkout-flow documentation", "Negotiation rules", "Commerce registry", "AP2 interop samples", "API access"],
    notes: "Run this program in-app from the Commerce hub (#commerce)",
  },
  {
    name: "closer", label: "Closer / Packaging", icon: "package", category: "Engineering Delivery",
    promise: "Package the project for real-world distribution",
    description: "Generate packaging manifests, Dockerfiles, CI/release workflows, and distributable-format templates (npm, VS Code, Docker Hub, GitHub Marketplace, Unreal).",
    tier: "pro", generatorCount: 16,
    endpoints: ["POST /v1/closer/generate"],
    outputFiles: ["packaging/README.md", "packaging/LICENSE", "Dockerfile", "docker-compose.yml", ".github/workflows/ci.yml", ".github/workflows/release.yml", "packaging/manifests/npm-package.json", "packaging/manifests/unreal.uplugin", "packaging/manifests/vscode-extension.json", "packaging/manifests/dockerhub-repository.md", "packaging/manifests/github-marketplace-listing.md", "packaging/trust-fabric/attestation.json", "packaging/trust-fabric/merkle-proof.json", "packaging-report.md", "DISTRIBUTABLE.md", "Makefile"],
    freeFeatures: ["None — requires Pro or Suite tier with this program enabled"],
    paidFeatures: ["Packaging manifests", "CI/release workflows", "Multi-format distributable templates", "Trust Fabric attestation", "API access"],
  },
  {
    name: "deploy", label: "Axis Deploy", icon: "rocket", category: "Engineering Delivery",
    promise: "Ship the project to production infrastructure",
    description: "Generate Dockerfiles, docker-compose configs, Render blueprints, deploy scripts, and Cloudflare Worker/Pages configuration tailored to the project's stack.",
    tier: "pro", generatorCount: 13,
    endpoints: ["POST /v1/deploy/generate"],
    outputFiles: ["deploy/Dockerfile", "deploy/Dockerfile.dockerignore", "deploy/docker-compose.dev.yml", "deploy/render.yaml", "deploy/deploy.sh", "deploy/deploy.ps1", "deploy/vscode-launch.json.template", "deploy/wrangler.pages.toml", "deploy/wrangler.containers.toml", "deploy/worker.ts", "deploy/deploy-cloudflare.sh", "deploy/deploy-cloudflare.ps1", "deploy/deploy-qualification-report.md"],
    freeFeatures: ["None — requires Pro or Suite tier with this program enabled"],
    paidFeatures: ["Dockerfiles and compose configs", "Render blueprint", "Deploy scripts (bash + PowerShell)", "Cloudflare Worker/Pages config", "API access"],
  },
];

interface Props {
  onNavigate: (page: PageId) => void;
}

export function DocsPage({ onNavigate }: Props) {
  const [section, setSection] = useState<DocSection>("overview");
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  const sections: { id: DocSection; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "docs-overview" },
    { id: "programs", label: "Programs", icon: "programs" },
    { id: "api", label: "API Reference", icon: "api-link" },
    { id: "mcp", label: "MCP Protocol", icon: "mcp" },
    { id: "errors", label: "Error Codes", icon: "warning" },
    { id: "outputs", label: "Output Formats", icon: "file-doc" },
    { id: "examples", label: "Example Artifacts", icon: "folder" },
    { id: "cli", label: "CLI Usage", icon: "terminal" },
  ];

  return (
    <div>
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Documentation</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto" }}>
          Everything you need to know about Axis' Iliad — programs, API, outputs, and CLI.
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
      {section === "mcp" && <McpProtocolSection onNavigate={onNavigate} />}
      {section === "errors" && <ErrorCodesSection />}
      {section === "outputs" && <OutputsSection />}
      {section === "examples" && <ExampleArtifactsSection onNavigate={onNavigate} />}
      {section === "cli" && <CliSection />}
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>What is Axis' Iliad?</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
          Axis is the umbrella platform for AI-native development — a multi-program system
          that turns project snapshots into diagnostics, governed outputs, and build-integrated
          tooling. It provides shared identity, snapshot intake, project context, and a unified
          design system across {PROGRAM_COUNT} separately billable programs organized into 8 categories:
          Repo Intelligence, Governance, Engineering Delivery, Growth &amp; Content,
          Knowledge &amp; Context, Design System, Creative Generation, and Agentic Commerce.
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
            <div style={{ fontSize: "2rem", marginBottom: 8 }}><Icon name="programs" /></div>
            <h4 style={{ marginBottom: 4 }}>3. Generate</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Run any of {PROGRAM_COUNT} programs to produce specialized output files — rules, configs, docs, and more.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Quick Stats</h3>
        <div className="grid grid-4">
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">{PROGRAM_COUNT}</div>
            <div className="stat-label">Programs</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">{ARTIFACT_COUNT}</div>
            <div className="stat-label">Generators</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">{FREE_PROGRAM_COUNT} Free</div>
            <div className="stat-label">{PRO_PROGRAM_COUNT} Pro</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="stat-value">7</div>
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
          Axis' Iliad is a monorepo with three packages — a React frontend, a Node.js API
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
              {["Node.js 22", "tsx (ESM)", "Neon Postgres", "pg (node-postgres)", "REST / JSON"].map((t) => (
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
              {["pnpm workspaces", "vitest", "JSZip", "full-text search", "Bearer auth"].map((t) => (
                <span key={t} className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Program Categories</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          The {PROGRAM_COUNT} programs are organized into 8 functional categories. Each category addresses
          a different dimension of the development lifecycle.
        </p>
        <div className="grid grid-3" style={{ gap: 12 }}>
          {[
            { cat: "Repo Intelligence", icon: "search", programs: ["Search", "Debug", "Optimization"], desc: "Understand, diagnose, and improve your codebase" },
            { cat: "Governance", icon: "skills", programs: ["Skills"], desc: "Generate AI control files and workflow policies" },
            { cat: "Engineering Delivery", icon: "frontend", programs: ["Frontend", "Superpowers", "MCP", "Artifacts", "Closer / Packaging", "Deploy"], desc: "Audit UI, automate workflows, connect services, package and ship" },
            { cat: "Growth & Content", icon: "seo", programs: ["SEO", "Brand", "Marketing"], desc: "Improve discoverability, content systems, and growth" },
            { cat: "Knowledge & Context", icon: "notebook", programs: ["Notebook", "Obsidian"], desc: "Structure research and vault-based knowledge" },
            { cat: "Design System", icon: "theme", programs: ["Theme"], desc: "Design tokens and theme implementation rules" },
            { cat: "Creative Generation", icon: "remotion", programs: ["Remotion", "Canvas", "Algorithmic"], desc: "Video workflows, visual assets, and generative outputs" },
            { cat: "Agentic Commerce", icon: "credit-card", programs: ["Agentic Purchasing"], desc: "Purchasing readiness and AP2/UCP compliance packaging" },
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
          API keys use the <code className="mono">axis_</code> prefix. Create and rotate keys from the Settings page.
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
      <button
        type="button"
        className="flex-between"
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0, textAlign: "left" }}
        aria-expanded={expanded}
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
      </button>

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

// ─── API Reference — live OpenAPI explorer (WO-P13) ──────────────
// Hand-rolled from GET /openapi.json — tag-grouped, expandable, copy-curl.
// No swagger-ui dependency. Every endpoint below is read live from the spec,
// so drift between this page and the real API surface is impossible by
// construction (the acceptance bar this work order sets).

interface OpenApiParam {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
}

interface OpenApiOperation {
  summary?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenApiParam[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, { description?: string }>;
  security?: Array<Record<string, unknown>>;
}

interface EndpointEntry {
  method: string;
  path: string;
  op: OpenApiOperation;
}

function resolveSchema(schema: unknown, schemas: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref === "string") {
    const name = s.$ref.split("/").pop();
    const target = name ? schemas?.[name] : undefined;
    return (target as Record<string, unknown>) ?? null;
  }
  return s;
}

/** Recursive JSON-Schema renderer — resolves $refs against components.schemas.
 *  Depth-capped defensively against a self-referential or very deep schema. */
function SchemaView({ schema, schemas, depth = 0 }: { schema: unknown; schemas: Record<string, unknown> | undefined; depth?: number }) {
  const resolved = resolveSchema(schema, schemas);
  if (!resolved) return <span className="text-muted text-xs">—</span>;

  if (resolved.type === "array") {
    return (
      <span>
        <span className="mono text-xs text-muted">array of </span>
        <SchemaView schema={resolved.items} schemas={schemas} depth={depth} />
      </span>
    );
  }

  const properties = resolved.properties as Record<string, unknown> | undefined;
  if (resolved.type === "object" || properties) {
    const entries = Object.entries(properties ?? {});
    if (entries.length === 0) return <span className="mono text-xs text-muted">object</span>;
    if (depth > 3) return <span className="mono text-xs text-muted">{"object { ... }"}</span>;
    const required = new Set((resolved.required as string[]) ?? []);
    return (
      <table style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        <tbody>
          {entries.map(([name, propSchema]) => {
            const prop = resolveSchema(propSchema, schemas) ?? {};
            const isNested = prop.type === "object" || prop.type === "array" || Boolean(prop.properties);
            return (
              <tr key={name}>
                <td className="mono" style={{ fontSize: "0.75rem", verticalAlign: "top", paddingRight: 8 }}>
                  {name}{required.has(name) && <span style={{ color: "var(--red)" }}>*</span>}
                </td>
                <td style={{ verticalAlign: "top", paddingBottom: 2 }}>
                  {isNested ? (
                    <SchemaView schema={propSchema} schemas={schemas} depth={depth + 1} />
                  ) : (
                    <span className="mono text-xs text-muted">
                      {(prop.type as string) ?? "any"}
                      {Array.isArray(prop.enum) ? ` (${(prop.enum as string[]).join(" | ")})` : ""}
                    </span>
                  )}
                  {typeof prop.description === "string" && (
                    <div className="text-muted text-xs">{prop.description}</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <span className="mono text-xs text-muted">
      {(resolved.type as string) ?? "any"}
      {Array.isArray(resolved.enum) ? ` (${(resolved.enum as string[]).join(" | ")})` : ""}
    </span>
  );
}

/** Shallow placeholder value per JSON-Schema type — enough for a curl skeleton
 *  the user edits, not a semantic mock. Objects/arrays stay empty at this
 *  depth so the example body doesn't balloon into a full recursive fixture. */
function exampleValue(prop: Record<string, unknown> | null): unknown {
  if (!prop) return null;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  switch (prop.type) {
    case "string": return prop.format === "date-time" ? "2026-01-01T00:00:00Z" : "string";
    case "integer":
    case "number": return 0;
    case "boolean": return true;
    case "array": return [];
    case "object": return {};
    default: return prop.properties ? {} : null;
  }
}

function exampleBody(schema: unknown, schemas: Record<string, unknown> | undefined): Record<string, unknown> {
  const resolved = resolveSchema(schema, schemas);
  const properties = resolved?.properties as Record<string, unknown> | undefined;
  if (!properties) return {};
  const required = new Set((resolved?.required as string[]) ?? []);
  const wanted = required.size > 0 ? Object.entries(properties).filter(([name]) => required.has(name)) : Object.entries(properties);
  const out: Record<string, unknown> = {};
  for (const [name, propSchema] of wanted) out[name] = exampleValue(resolveSchema(propSchema, schemas));
  return out;
}

function buildCurl(method: string, path: string, op: OpenApiOperation, schemas: Record<string, unknown> | undefined): string {
  const examplePath = path.replace(/\{([^}]+)\}/g, (_m, name: string) => `<${name}>`);
  const url = `${DOCS_API_BASE}${examplePath}`;
  const needsAuth = Boolean(op.security?.length);
  const bodySchema = op.requestBody?.content ? Object.values(op.requestBody.content)[0]?.schema : null;

  const lines = [`curl -X ${method.toUpperCase()} ${url}`];
  if (needsAuth) lines.push(`  -H "Authorization: Bearer axis_your_api_key"`);
  if (bodySchema) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(exampleBody(bodySchema, schemas))}'`);
  }
  return lines.map((l, i) => (i < lines.length - 1 ? `${l} \\` : l)).join("\n");
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function ApiSection() {
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [openEndpoint, setOpenEndpoint] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getOpenApiSpec()
      .then(setSpec)
      .catch((err) => setError({ message: err instanceof Error ? err.message : "Failed to load the API spec", details: apiErrorDetails(err) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="card" role="status" aria-live="polite"><Skeleton lines={8} /></div>;

  if (error || !spec) {
    return (
      <div className="card">
        <Callout tone="danger" title="Couldn't load the live API spec" details={error?.details ?? null}>
          {error?.message ?? "Unknown error"} <button type="button" className="btn" onClick={() => void load()}>Retry</button>
        </Callout>
      </div>
    );
  }

  const schemas = spec.components?.schemas;
  const byTag = new Map<string, EndpointEntry[]>();
  let totalEndpoints = 0;
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods as Record<string, OpenApiOperation>)) {
      if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
      totalEndpoints++;
      const tags = op.tags?.length ? op.tags : ["Other"];
      for (const tag of tags) {
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push({ method, path, op });
      }
    }
  }
  const tagNames = [...byTag.keys()].sort();

  return (
    <div className="stagger">
      <div className="card">
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>{spec.info.title}</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", margin: 0 }}>
              v{spec.info.version} · {totalEndpoints} endpoints · {tagNames.length} tags
            </p>
          </div>
          <span className="badge badge-green">Live · GET /openapi.json</span>
        </div>
        <div className="mono" style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "0.875rem", marginTop: 12 }}>
          {DOCS_API_BASE}
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 8 }}>
          Every endpoint below is read directly from the live spec — nothing here can drift
          from what the API actually serves. Authenticated endpoints (marked <Icon name="key" />)
          need a Bearer <code className="mono">axis_*</code> API key.
        </p>
      </div>

      {tagNames.map((tag) => {
        const endpoints = byTag.get(tag)!;
        const tagOpen = openTag === tag;
        return (
          <div key={tag} className="card">
            <button
              type="button"
              className="flex-between"
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }}
              onClick={() => setOpenTag(tagOpen ? null : tag)}
              aria-expanded={tagOpen}
            >
              <strong>{tag}</strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"} {tagOpen ? "▲" : "▼"}
              </span>
            </button>

            {tagOpen && (
              <div className="stagger" style={{ marginTop: 12 }}>
                {endpoints.map((e) => {
                  const key = `${e.method}-${e.path}`;
                  const expanded = openEndpoint === key;
                  const bodySchema = e.op.requestBody?.content ? Object.values(e.op.requestBody.content)[0]?.schema : null;
                  const needsAuth = Boolean(e.op.security?.length);
                  return (
                    <div key={key} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <button
                        type="button"
                        className="flex-between"
                        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0, textAlign: "left", gap: 8 }}
                        onClick={() => setOpenEndpoint(expanded ? null : key)}
                        aria-expanded={expanded}
                      >
                        <span className="flex" style={{ gap: 8, alignItems: "baseline" }}>
                          <span
                            className="badge"
                            style={{ fontSize: "0.6875rem", background: e.method === "get" ? "var(--green)" : "var(--accent)", color: "white", textTransform: "uppercase" }}
                          >
                            {e.method}
                          </span>
                          <span className="mono" style={{ fontSize: "0.8125rem" }}>{e.path}</span>
                          {needsAuth && <Icon name="key" />}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{expanded ? "▲" : "▼"}</span>
                      </button>

                      {!expanded && e.op.summary && (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", margin: "4px 0 0" }}>{e.op.summary}</p>
                      )}

                      {expanded && (
                        <div style={{ marginTop: 10, paddingLeft: 4 }} className="animate-fade-in">
                          {e.op.summary && <p style={{ fontSize: "0.8125rem", marginBottom: 10 }}>{e.op.summary}</p>}

                          {e.op.parameters && e.op.parameters.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                                Parameters
                              </div>
                              <TableWrap label={`${e.path} parameters`}>
                                <table>
                                  <thead><tr><th>Name</th><th>In</th><th>Required</th><th>Description</th></tr></thead>
                                  <tbody>
                                    {e.op.parameters.map((p) => (
                                      <tr key={p.name}>
                                        <td className="mono" style={{ fontSize: "0.75rem" }}>{p.name}</td>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{p.in}</td>
                                        <td style={{ fontSize: "0.75rem" }}>{p.required ? "Yes" : "—"}</td>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{p.description ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </TableWrap>
                            </div>
                          )}

                          {Boolean(bodySchema) && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                                Request body
                              </div>
                              <SchemaView schema={bodySchema} schemas={schemas} />
                            </div>
                          )}

                          {e.op.responses && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                                Responses
                              </div>
                              <div className="flex-wrap" style={{ gap: 6 }}>
                                {Object.entries(e.op.responses).map(([code, r]) => (
                                  <span key={code} className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }} title={r.description}>
                                    {code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <CodeBlock
                            label="curl"
                            code={buildCurl(e.method, e.path, e.op, schemas)}
                            copyLabel={`Copy curl for ${e.method.toUpperCase()} ${e.path}`}
                            wrap
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MCP Protocol — live manifest summary (WO-P13) ───────────────
// Deliberately NOT a second copy of McpPage's full tool registry (that would
// duplicate live-fetched UI two ways and drift-risk itself) — this is a
// concise summary plus a cross-link to the full, already-shipped MCP page.

function McpProtocolSection({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [manifest, setManifest] = useState<McpManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getMcpManifest()
      .then(setManifest)
      .catch((err) => setError({ message: err instanceof Error ? err.message : "Failed to load the MCP manifest", details: apiErrorDetails(err) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const meta = (manifest?._meta ?? {}) as Record<string, unknown>;
  const transport = typeof meta.transport === "string" ? meta.transport : "http";
  const protocol = typeof meta.protocol === "string" ? meta.protocol : null;
  const authentication = meta.authentication as { type?: string; description?: string } | undefined;

  return (
    <div className="stagger">
      <div className="card">
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Model Context Protocol</h3>
          <span className="badge badge-green">Live · GET /v1/mcp/server.json</span>
        </div>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Every program is also exposed as an MCP tool over JSON-RPC 2.0 — one endpoint,
          no per-tool integration work. This is a live summary; the full searchable tool
          registry (arguments, JSON schemas, examples) lives on the dedicated MCP page.
        </p>

        {loading ? (
          <div role="status" aria-live="polite"><Skeleton lines={4} /></div>
        ) : error || !manifest ? (
          <Callout tone="danger" title="Couldn't load the live MCP manifest" details={error?.details ?? null}>
            {error?.message ?? "Unknown error"} <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          </Callout>
        ) : (
          <>
            <div className="grid grid-4" style={{ marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div className="stat-value">{manifest.tools.length}</div>
                <div className="stat-label">Tools</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="stat-value" style={{ fontSize: "1.1rem" }}>{transport}</div>
                <div className="stat-label">Transport</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="stat-value" style={{ fontSize: "1.1rem" }}>{authentication?.type ?? "bearer"}</div>
                <div className="stat-label">Auth</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="stat-value" style={{ fontSize: "0.9rem" }}>{protocol ?? "mcp"}</div>
                <div className="stat-label">Protocol version</div>
              </div>
            </div>
            <div className="mono" style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "0.8125rem", marginBottom: 12 }}>
              {manifest.server.endpoint}
            </div>
            {authentication?.description && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12 }}>{authentication.description}</p>
            )}
          </>
        )}

        <button type="button" className="btn btn-primary" onClick={() => onNavigate("mcp")}>
          Open the full MCP tool registry →
        </button>
      </div>
    </div>
  );
}

// ─── Error Codes (H4.2) ───────────────────────────────────────────

function RetryBadge({ retryable }: { retryable: string }) {
  const cls = retryable === "yes" ? "badge badge-green" : retryable === "depends" ? "badge badge-yellow" : "badge";
  return <span className={cls} style={{ fontSize: "0.6875rem" }}>{retryable}</span>;
}

function ErrorCodesSection() {
  const [catalog, setCatalog] = useState<ErrorCodeCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getErrorCodes()
      .then(setCatalog)
      .catch((err) => setError({ message: err instanceof Error ? err.message : "Failed to load the error-code catalog", details: apiErrorDetails(err) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stagger">
      <div className="card">
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Error Codes</h3>
          <span className="badge badge-green">Live · GET /v1/error-codes</span>
        </div>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Every REST error response carries <code className="mono">error_code</code> alongside{" "}
          <code className="mono">error</code> (human message) and <code className="mono">request_id</code>. No
          response ships a literal <code className="mono">retryable</code> field — the column below is editorial
          guidance for deciding whether to retry, not a claim about the wire format.
        </p>

        {loading ? (
          <div role="status" aria-live="polite"><Skeleton lines={6} /></div>
        ) : error || !catalog ? (
          <Callout tone="danger" title="Couldn't load the live error-code catalog" details={error?.details ?? null}>
            {error?.message ?? "Unknown error"} <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          </Callout>
        ) : (
          <>
            <TableWrap label="REST error codes">
              <table>
                <thead><tr><th>Code</th><th>Status</th><th>Retry?</th><th>Description</th></tr></thead>
                <tbody>
                  {catalog.rest_error_codes.map((e) => (
                    <tr key={e.code}>
                      <td className="mono" style={{ fontSize: "0.75rem" }}>{e.code}</td>
                      <td style={{ fontSize: "0.75rem" }}>{e.statuses.length ? e.statuses.join(" / ") : "—"}</td>
                      <td><RetryBadge retryable={e.retryable} /></td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }} title={e.retry_guidance}>{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            <h4 style={{ marginTop: 20, marginBottom: 8 }}>MCP tool-call error categories</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
              {catalog.mcp_tool_error_categories.note}
            </p>
            <TableWrap label="MCP error categories">
              <table>
                <thead><tr><th>Code</th><th>Retry?</th><th>Description</th></tr></thead>
                <tbody>
                  {catalog.mcp_tool_error_categories.categories.map((c) => (
                    <tr key={c.code}>
                      <td className="mono" style={{ fontSize: "0.75rem" }}>{c.code}</td>
                      <td><RetryBadge retryable={c.retryable ? "yes" : "no"} /></td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Example Artifacts (WO-P13) ──────────────────────────────────
// WO-A7 (a public demo-project endpoint) hasn't landed, so these are static
// samples, labeled honestly as such — cross-linking to ExamplesPage's real
// case studies and to the Runner for generating real artifacts.

const ARTIFACT_SAMPLES: Array<{ file: string; program: string; format: string; excerpt: string }> = [
  {
    file: "AGENTS.md", program: "skills", format: "Markdown",
    excerpt: "# AGENTS.md — <project>\n\n## Project Context\nThis is a **web_application** built with **React, TypeScript**.\n\n## Key Conventions\n- Strict TypeScript, no `any`\n- Functional components only\n\n## Do NOT\n- Do not bypass the auth middleware\n- Do not add dependencies without discussion",
  },
  {
    file: "checkout-flow.md", program: "agentic-purchasing", format: "Markdown",
    excerpt: "## Flow Overview\n\nAgent discovers product → validates AP2 mandate → requests SCA exemption → submits payment → receives receipt\n\n## SCA / 3DS2 Handling\nLow-risk, low-value transactions may qualify for an exemption path — see the priority table below.",
  },
  {
    file: "theme.css", program: "theme", format: "CSS",
    excerpt: ":root {\n  --accent: #6366f1;\n  --bg: #0b0b0f;\n  --text: #e5e5ea;\n  --radius: 8px;\n}",
  },
  {
    file: "debug-playbook.md", program: "debug", format: "Markdown",
    excerpt: "## Common Failure: Provider timeout\n\n**Symptom:** 504 from `/v1/providers/:name/connect`\n**Root cause:** adapter retry budget exhausted\n**Fix:** check `provider_timeout_ms` in config, inspect the retry counter",
  },
];

function ExampleArtifactsSection({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>What generated files look like</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          The snippets below are illustrative samples, not live output from a real analysis —
          they show the shape and tone of what each program produces. For full, real case
          studies from actual repositories, see Examples; to generate real artifacts from
          your own project, run a program from the Runner.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate("examples")}>
            View real case studies →
          </button>
          <button type="button" className="btn" onClick={() => onNavigate("runner")}>
            Generate your own →
          </button>
        </div>
      </div>

      {ARTIFACT_SAMPLES.map((s) => (
        <div key={s.file} className="card">
          <div className="flex-between" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div>
              <strong className="mono" style={{ fontSize: "0.875rem" }}>{s.file}</strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginLeft: 8 }}>from the "{s.program}" program</span>
            </div>
            <span className="badge" style={{ fontSize: "0.6875rem", background: "var(--bg)" }}>{s.format}</span>
          </div>
          <CodeBlock code={s.excerpt} wrap copyLabel={`Copy ${s.file} sample`} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.6875rem", marginTop: 6, marginBottom: 0 }}>Sample — not from a live analysis.</p>
        </div>
      ))}
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
          <div>&nbsp; <span style={{ color: "var(--text-muted)" }}>... ({PROGRAM_COUNT - 4} more programs)</span></div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Output Files Per Program</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Output count varies by program (most produce 4–6 files; a few packaging-heavy programs produce more).
          Here is the full inventory across all {PROGRAM_COUNT} programs ({ARTIFACT_COUNT} generators total).
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
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Click "Copy content" in the Artifacts tab</td>
              <td className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>clipboard</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── CLI install gating ───────────────────────────────────────────
// npm publish of axis-iliad is owner-gated. Until it has actually run, the
// registry install lines stay dark and every example uses the locally
// installed binary. Flip to true ONLY after `npm publish` has succeeded —
// cli-docs-parity.test.ts (apps/cli) checks this stays honest.
const CLI_PUBLISHED = false;
const CLI = CLI_PUBLISHED ? "npx axis-iliad" : "axis-iliad";

function CliSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>CLI Overview</h3>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Axis' Iliad includes a fully-offline CLI for running analysis directly from your
          terminal. Point it at any directory to generate a snapshot and run programs.
          {CLI_PUBLISHED
            ? <> Install globally or run via <code className="mono">npx</code>.</>
            : <> The npm package is not published yet — install it from a repo checkout.</>}
        </p>
        {CLI_PUBLISHED ? (
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
            <div><span style={{ color: "var(--text-muted)" }}># Install globally</span></div>
            <div>npm install -g axis-iliad</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Or run without installing</span></div>
            <div>npx axis-iliad --help</div>
          </div>
        ) : (
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
            <div><span style={{ color: "var(--text-muted)" }}># From a checkout of the axis-iliad repo (npm publish pending):</span></div>
            <div>pnpm install</div>
            <div>pnpm --filter axis-iliad build</div>
            <div>npm install -g ./apps/cli</div>
            <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Then:</span></div>
            <div>axis-iliad --help</div>
          </div>
        )}
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
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Show all {PROGRAM_COUNT} programs with tier and category</td>
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
          <div>{CLI} analyze .</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Analyze and run specific programs</span></div>
          <div>{CLI} analyze ./my-project --programs search,skills,debug</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Run all free programs with verbose logging</span></div>
          <div>{CLI} analyze . --programs search,skills,debug --verbose</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Analyze a GitHub repo</span></div>
          <div>{CLI} github https://github.com/user/repo --programs search</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Export generated files to disk</span></div>
          <div>{CLI} export ./my-project --output ./output</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Export as ZIP</span></div>
          <div>{CLI} export ./my-project --format zip -o ./my-project-output.zip</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Check account status and usage</span></div>
          <div>{CLI} status</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># Store your API key locally</span></div>
          <div>{CLI} auth --key axis_your_key_here</div>
          <div style={{ marginTop: 8 }}><span style={{ color: "var(--text-muted)" }}># List all available programs</span></div>
          <div>{CLI} list-programs</div>
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
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Export format: dir (default) or zip</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--verbose</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Enable verbose logging with timing info (-v is version)</td>
            </tr>
            <tr>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>--quiet</td>
              <td className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>—</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Suppress progress output</td>
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
          {!CLI_PUBLISHED && <> <strong>(requires the npm package — publish is pending, so this example only works once <code className="mono">axis-iliad</code> is on the registry)</strong></>}
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
          <div><span style={{ color: "var(--accent)" }}>name:</span> Axis' Iliad</div>
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
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; npx axis-iliad analyze . \</div>
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
