// ProgramsPage — keyword-rich landing for all 21 AXIS programs
// Single-source counts (WO-F5) — never inline these numbers.
import { ARTIFACT_COUNT, FREE_PROGRAM_COUNT, PROGRAM_COUNT } from "../config.ts";

interface ProgramDef {
  id: string;
  name: string;
  tier: "free" | "pro";
  tagline: string;
  /** Search terms this program serves. Marketing copy — free to phrase for SEO. */
  keywords: string[];
  /**
   * The files this program ACTUALLY emits. A product claim, not copy: these are
   * generated from `packages/generator-core`'s program manifest and must never
   * be hand-edited. They were hand-typed once and drifted badly — 37 of the 97
   * listed filenames had no generator behind them, and the free `skills` list
   * was entirely fictional (Phase T finding, 2026-07-27). `programs-outputs`
   * in count-honesty.test.ts now fails CI if this list and the manifest diverge.
   */
  outputs: string[];
  cta: string;
}

/** Output pills shown per card before collapsing to "+N more" (mcp emits 19). */
const OUTPUT_PREVIEW = 5;

const PROGRAMS: ProgramDef[] = [
  // ── Free tier ─────────────────────────────────────────────────
  {
    id: "search",
    name: "Search",
    tier: "free",

    tagline: "AI codebase analysis & context graph",
    keywords: ["AI codebase analyzer", "repo context map", "AGENTS.md generator", "CLAUDE.md generator", ".cursorrules generator", "architecture summary"],
    outputs: ["context-map.json", "repo-profile.yaml", "architecture-summary.md", "dependency-hotspots.md", "symbol-index.json", "repo-run-stats.json"],
    cta: "Generate your context graph",
  },
  {
    id: "skills",
    name: "Skills",
    tier: "free",

    tagline: "AI governance files for every coding assistant",
    keywords: ["GitHub Copilot instructions", "Cursor rules generator", "Claude Code context", "AI coding assistant setup", "developer AI skills file"],
    outputs: ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md", "model-cascade.md"],
    cta: "Generate AI governance files",
  },
  {
    id: "debug",
    name: "Debug",
    tier: "free",

    tagline: "AI-powered debug playbooks from your dependency graph",
    keywords: ["AI debug playbook generator", "dependency hotspot analyzer", "incident template generator", "tracing rules", "code bug analyzer"],
    outputs: ["debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
    cta: "Generate debug playbooks",
  },
  // ── Pro tier ──────────────────────────────────────────────────
  {
    id: "frontend",
    name: "Frontend",
    tier: "pro",

    tagline: "AI frontend rules, component guidelines & CSS scaffolding",
    keywords: ["AI frontend rules generator", "React component guidelines", "Vue component generator", "CSS architecture generator", "frontend AI context"],
    outputs: ["frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
    cta: "Generate frontend rules",
  },
  {
    id: "seo",
    name: "SEO",
    tier: "pro",

    tagline: "Technical SEO rules, schema.org markup & sitemap strategy",
    keywords: ["technical SEO generator", "schema.org markup generator", "ContactPage schema", "SEO rules for Next.js", "structured data generator", "sitemap strategy"],
    outputs: ["seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json", "seo-head-tags.html"],
    cta: "Generate SEO rules",
  },
  {
    id: "pitch",
    name: "Pitch",
    tier: "pro",

    tagline: "Truth-first pitch deck from runtime evidence — docs claims audited, never repeated",
    keywords: ["pitch deck generator", "truth-first pitch deck", "investor deck from codebase", "claims audit", "evidence-based pitch"],
    outputs: ["pitch-deck.md", "pitch-deck.json", "slide-art-prompts.json"],
    cta: "Generate the deck",
  },
  {
    id: "optimization",
    name: "Optimization",
    tier: "pro",

    tagline: "AI token budget planner, prompt optimization & cost analysis",
    keywords: ["AI token budget planner", "prompt optimization tool", "context window optimizer", "reduce AI API costs", "prompt diff report"],
    outputs: ["optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
    cta: "Optimize your prompts",
  },
  {
    id: "theme",
    name: "Theme",
    tier: "pro",

    tagline: "CSS design system, design tokens & dark mode theme generator",
    keywords: ["CSS design system generator", "design token generator", "dark mode theme", "AI-generated CSS variables", "component CSS stubs", "brand color system"],
    outputs: ["design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
    cta: "Generate your design system",
  },
  {
    id: "brand",
    name: "Brand",
    tier: "pro",

    tagline: "Brand guidelines, messaging system & channel rulebook",
    keywords: ["developer brand guidelines generator", "messaging system generator", "channel rulebook", "brand voice SaaS", "startup brand identity", "developer marketing copy"],
    outputs: ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", ".vale.ini", "styles/AXIS/ForbiddenPatterns.yml", "styles/AXIS/PreferredTerms.yml", "channel-rulebook.md"],
    cta: "Generate brand guidelines",
  },
  {
    id: "superpowers",
    name: "Superpowers",
    tier: "pro",

    tagline: "AI refactoring checklists, test generation rules & workflow registry",
    keywords: ["AI refactoring checklist", "test generation rules", "automation pipeline generator", "workflow registry AI", "developer superpowers AI"],
    outputs: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml", "verify.sh", "verify-full.sh", ".githooks/pre-push", "redundancy-sweep.mjs", "redundancy-sweep-playbook.md"],
    cta: "Unlock your superpowers",
  },
  {
    id: "marketing",
    name: "Marketing",
    tier: "pro",

    tagline: "Developer marketing automation — campaigns, funnels, CRO playbooks",
    keywords: ["developer marketing automation", "SaaS conversion funnel generator", "CRO playbook generator", "email sequence for developers", "startup marketing AI"],
    outputs: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
    cta: "Generate marketing assets",
  },
  {
    id: "notebook",
    name: "Notebook",
    tier: "pro",

    tagline: "Developer research notebook, study brief & citation index",
    keywords: ["developer research notebook AI", "code study brief generator", "codebase citation index", "AI generates study guide", "developer knowledge notebook"],
    outputs: ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
    cta: "Generate your notebook",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    tier: "pro",

    tagline: "Obsidian vault generator for developer knowledge bases",
    keywords: ["Obsidian vault for developers", "PKM for coding", "developer knowledge graph", "dev research notebook Obsidian", "vault rules generator", "graph prompt map"],
    outputs: ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
    cta: "Generate your Obsidian vault",
  },
  {
    id: "mcp",
    name: "MCP",
    tier: "pro",

    tagline: "Model Context Protocol config, connector map & tool manifest",
    keywords: ["Model Context Protocol generator", "MCP server setup", "MCP config generator", "AI tool connector map", "LLM resource map", "MCP tool manifest"],
    outputs: ["mcp-config.json", "mcp-registry-metadata.json", "protocol-spec.md", "spec.types.ts", "mcp/README.md", "mcp/project-setup.md", "mcp/build-artifacts.md", "mcp/package-json.root.template.json", "mcp/package-json.package.template.json", "mcp/tsconfig.root.template.json", "mcp/tsconfig.package.template.json", "mcp/monorepo-structure.md", "mcp/core-implementation-artifacts.md", "mcp/testing-documentation-polish-artifacts.md", "connector-map.yaml", "capability-registry.json", "mcp/fintech-mcp-surface-package.md", "mcp/fintech-domain-schema.yaml", "server-manifest.yaml"],
    cta: "Generate your MCP config",
  },
  {
    id: "artifacts",
    name: "Artifacts",
    tier: "pro",

    tagline: "Component library, dashboard widgets & embeddable snippets",
    keywords: ["component library generator", "dashboard widget code generator", "embed snippet generator", "artifact spec from schema", "React component from model", "Vue SFC generator"],
    outputs: ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json", "prd.md", "design.md", "tasks.md", "context.md", "index.html", "capability-map.yaml"],
    cta: "Generate artifacts",
  },
  {
    id: "remotion",
    name: "Remotion",
    tier: "pro",

    tagline: "Code visualization video scripts & Remotion templates from your repo",
    keywords: ["code visualization video generator", "dev demo video generator", "Remotion template from codebase", "AI video for product launch", "developer demo automation"],
    outputs: ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
    cta: "Generate your video script",
  },
  {
    id: "canvas",
    name: "Canvas",
    tier: "pro",

    tagline: "Visual architecture canvas, planning board & dev workflow maps",
    keywords: ["developer planning canvas", "visual architecture canvas", "AI canvas for engineers", "codebase visual map", "architecture diagram generator"],
    outputs: ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "architecture-diagram.d2", "brand-board.md"],
    cta: "Generate your canvas",
  },
  {
    id: "algorithmic",
    name: "Algorithmic",
    tier: "pro",

    tagline: "Generative art, parameter packs & variation matrices from code",
    keywords: ["generative code art", "parameter pack generator", "variation matrix AI", "algorithmic design system", "generative sketch from codebase", "export manifest generator"],
    outputs: ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
    cta: "Generate algorithmic artifacts",
  },
  {
    id: "agentic-purchasing",
    name: "Agentic Purchasing",
    tier: "pro",

    tagline: "Autonomous checkout hardening with AP2, dispute evidence, and policy controls",
    keywords: ["agentic purchasing readiness", "autonomous checkout", "AP2 compliance", "Visa Intelligent Commerce", "negotiation rules", "commerce registry"],
    outputs: ["agent-purchasing-playbook.md", "product-schema.json", "checkout-flow.md", "negotiation-rules.md", "commerce-registry.json", "ap2-interop-samples.json"],
    cta: "Generate purchasing controls",
  },
  {
    id: "closer",
    name: "Closer",
    tier: "pro",

    tagline: "Ship-ready packaging artifacts for distribution, launch, and marketplace readiness",
    keywords: ["product packaging", "launch checklist", "distribution manifest", "marketplace readiness", "go to market artifacts"],
    outputs: ["packaging/README.md", "packaging/LICENSE", "Dockerfile", "docker-compose.yml", ".github/workflows/ci.yml", ".github/workflows/release.yml", "packaging/manifests/npm-package.json", "packaging/manifests/unreal.uplugin", "packaging/manifests/vscode-extension.json", "packaging/manifests/dockerhub-repository.md", "packaging/manifests/github-marketplace-listing.md", "packaging/trust-fabric/attestation.json", "packaging/trust-fabric/merkle-proof.json", "packaging-report.md", "DISTRIBUTABLE.md", "Makefile"],
    cta: "Generate ship-ready package",
  },
  {
    id: "deploy",
    name: "Deploy",
    tier: "pro",

    tagline: "Production deploy scaffolding for Docker, Render, and Cloudflare — one command to ship",
    keywords: ["deployment config generator", "Dockerfile generator", "render.yaml", "Cloudflare Workers deploy", "CI deploy pipeline"],
    outputs: ["deploy/Dockerfile", "deploy/Dockerfile.dockerignore", "deploy/docker-compose.dev.yml", "deploy/render.yaml", "deploy/deploy.sh", "deploy/deploy.ps1", "deploy/vscode-launch.json.template", "deploy/wrangler.pages.toml", "deploy/wrangler.containers.toml", "deploy/worker.ts", "deploy/deploy-cloudflare.sh", "deploy/deploy-cloudflare.ps1", "deploy/deploy-qualification-report.md"],
    cta: "Generate deploy config",
  },
];

interface Props {
  onAnalyze: () => void;
}

export function ProgramsPage({ onAnalyze }: Props) {
  const free = PROGRAMS.filter((p) => p.tier === "free");
  const pro = PROGRAMS.filter((p) => p.tier === "pro");

  return (
    <div className="programs-page">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="programs-hero">
        <div className="programs-hero-inner">
          <span className="badge badge-accent" style={{ marginBottom: 12, display: "inline-block" }}>{PROGRAM_COUNT} Programs · {ARTIFACT_COUNT} Artifacts</span>
          <h1 className="programs-hero-title">
            Every AI artifact your codebase needs. Generated in seconds.
          </h1>
          <p className="programs-hero-sub">
            Axis' Iliad analyzes your repo across 60+ languages and generates structured governance files
            for every AI coding tool — GitHub Copilot, Claude Code, Cursor, Windsurf, Aider, and more.
            One scan. {ARTIFACT_COUNT} outputs. Zero manual work.
          </p>
          <div className="programs-hero-stats">
            <div className="programs-stat">
              <span className="programs-stat-value">{ARTIFACT_COUNT}</span>
              <span className="programs-stat-label">Generated Artifacts</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">{PROGRAM_COUNT}</span>
              <span className="programs-stat-label">Specialized Programs</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">60+</span>
              <span className="programs-stat-label">Languages Detected</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">{FREE_PROGRAM_COUNT}</span>
              <span className="programs-stat-label">Free Programs</span>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo for free
          </button>
        </div>
      </section>

      {/* ── Free programs ────────────────────────────────────── */}
      <section className="programs-section">
        <div className="programs-section-header">
          <h2>Free Programs</h2>
          <p>Start here. No credit card. Instant results.</p>
        </div>
        <div className="programs-grid programs-grid-free">
          {free.map((p) => (
            <ProgramCard key={p.id} program={p} onAnalyze={onAnalyze} />
          ))}
        </div>
      </section>

      {/* ── Pro programs ─────────────────────────────────────── */}
      <section className="programs-section">
        <div className="programs-section-header">
          <h2>Pro Programs</h2>
          <p>{pro.length} additional programs unlocked with a Pro subscription.</p>
        </div>
        <div className="programs-grid">
          {pro.map((p) => (
            <ProgramCard key={p.id} program={p} onAnalyze={onAnalyze} />
          ))}
        </div>
      </section>

      {/* ── Conversion CTA ───────────────────────────────────── */}
      <section className="programs-cta">
        <h2>Ready to monopolize your AI development workflow?</h2>
        <p>
          Upload a ZIP, paste a GitHub URL, or use the CLI. Axis' Iliad scans your entire
          codebase and generates structured artifacts that make every AI coding tool more
          accurate, consistent, and effective.
        </p>
        <div className="programs-cta-actions">
          <button className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo — it&apos;s free
          </button>
          <a className="btn btn-lg" href="mailto:jonathan@jonathanarvay.com?subject=Axis%27%20Iliad%20Demo">
            Request a demo
          </a>
        </div>
        <p className="programs-cta-note">
          Free forever for Search, Skills &amp; Debug programs. No credit card required.
        </p>
      </section>
    </div>
  );
}

function ProgramCard({ program, onAnalyze }: { program: ProgramDef; onAnalyze: () => void }) {
  return (
    <article className={`program-card program-card-${program.tier}`}>
      <div className="program-card-header">
        <div>
          <h3 className="program-card-name">{program.name}</h3>
          <span className={`badge ${program.tier === "free" ? "badge-success" : "badge-accent"}`}>
            {program.tier === "free" ? "FREE" : "PRO"}
          </span>
        </div>
      </div>
      <p className="program-card-tagline">{program.tagline}</p>
      <div className="program-card-outputs">
        {program.outputs.slice(0, OUTPUT_PREVIEW).map((o) => (
          <code key={o} className="program-output-pill">{o}</code>
        ))}
        {program.outputs.length > OUTPUT_PREVIEW && (
          <span className="program-output-pill text-muted">
            +{program.outputs.length - OUTPUT_PREVIEW} more
          </span>
        )}
      </div>
      <div className="program-card-keywords">
        {program.keywords.slice(0, 3).map((k) => (
          <span key={k} className="program-keyword">{k}</span>
        ))}
      </div>
      <button className="btn btn-sm btn-primary program-card-cta" onClick={onAnalyze}>
        {program.cta}
      </button>
    </article>
  );
}

