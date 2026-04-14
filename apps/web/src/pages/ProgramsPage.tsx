// ProgramsPage — keyword-rich landing for all 17 AXIS programs

interface ProgramDef {
  id: string;
  name: string;
  tier: "free" | "pro";
  tagline: string;
  keywords: string[];
  outputs: string[];
  cta: string;
}

const PROGRAMS: ProgramDef[] = [
  // ── Free tier ─────────────────────────────────────────────────
  {
    id: "search",
    name: "Search",
    tier: "free",

    tagline: "AI codebase analysis & context graph",
    keywords: ["AI codebase analyzer", "repo context map", "AGENTS.md generator", "CLAUDE.md generator", ".cursorrules generator", "architecture summary"],
    outputs: ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".ai/context-map.json", "architecture-summary.md", ".ai/repo-profile.yaml"],
    cta: "Generate your context graph",
  },
  {
    id: "skills",
    name: "Skills",
    tier: "free",

    tagline: "AI governance files for every coding assistant",
    keywords: ["GitHub Copilot instructions", "Cursor rules generator", "Claude Code context", "AI coding assistant setup", "developer AI skills file"],
    outputs: ["copilot-instructions.md", "cursor-rules.md", "windsurf-rules.md", "aider-conventions.md", "ai-onboarding.md"],
    cta: "Generate AI governance files",
  },
  {
    id: "debug",
    name: "Debug",
    tier: "free",

    tagline: "AI-powered debug playbooks from your dependency graph",
    keywords: ["AI debug playbook generator", "dependency hotspot analyzer", "incident template generator", "tracing rules", "code bug analyzer"],
    outputs: [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md", "dependency-hotspots.md"],
    cta: "Generate debug playbooks",
  },
  // ── Pro tier ──────────────────────────────────────────────────
  {
    id: "frontend",
    name: "Frontend",
    tier: "pro",

    tagline: "AI frontend rules, component guidelines & CSS scaffolding",
    keywords: ["AI frontend rules generator", "React component guidelines", "Vue component generator", "CSS architecture generator", "frontend AI context"],
    outputs: [".ai/frontend-rules.md", "component-guidelines.md", "state-management-guide.md", "accessibility-checklist.md"],
    cta: "Generate frontend rules",
  },
  {
    id: "seo",
    name: "SEO",
    tier: "pro",

    tagline: "Technical SEO rules, schema.org markup & sitemap strategy",
    keywords: ["technical SEO generator", "schema.org markup generator", "ContactPage schema", "SEO rules for Next.js", "structured data generator", "sitemap strategy"],
    outputs: [".ai/seo-rules.md", "schema-recommendations.md", "sitemap-strategy.md", "robots-config.md", "og-template.md"],
    cta: "Generate SEO rules",
  },
  {
    id: "optimization",
    name: "Optimization",
    tier: "pro",

    tagline: "AI token budget planner, prompt optimization & cost analysis",
    keywords: ["AI token budget planner", "prompt optimization tool", "context window optimizer", "reduce AI API costs", "prompt diff report"],
    outputs: [".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
    cta: "Optimize your prompts",
  },
  {
    id: "theme",
    name: "Theme",
    tier: "pro",

    tagline: "CSS design system, design tokens & dark mode theme generator",
    keywords: ["CSS design system generator", "design token generator", "dark mode theme", "AI-generated CSS variables", "component CSS stubs", "brand color system"],
    outputs: ["theme.css", "design-tokens.json", "color-palette.md", "typography-scale.md", "component-styles.md"],
    cta: "Generate your design system",
  },
  {
    id: "brand",
    name: "Brand",
    tier: "pro",

    tagline: "Brand guidelines, messaging system & channel rulebook",
    keywords: ["developer brand guidelines generator", "messaging system generator", "channel rulebook", "brand voice SaaS", "startup brand identity", "developer marketing copy"],
    outputs: ["brand-guidelines.md", "messaging-system.md", "channel-rulebook.md", "tone-of-voice.md", "brand-positioning.md"],
    cta: "Generate brand guidelines",
  },
  {
    id: "superpowers",
    name: "Superpowers",
    tier: "pro",

    tagline: "AI refactoring checklists, test generation rules & workflow registry",
    keywords: ["AI refactoring checklist", "test generation rules", "automation pipeline generator", "workflow registry AI", "developer superpowers AI"],
    outputs: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
    cta: "Unlock your superpowers",
  },
  {
    id: "marketing",
    name: "Marketing",
    tier: "pro",

    tagline: "Developer marketing automation — campaigns, funnels, CRO playbooks",
    keywords: ["developer marketing automation", "SaaS conversion funnel generator", "CRO playbook generator", "email sequence for developers", "startup marketing AI"],
    outputs: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "channel-strategy.md"],
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
    outputs: ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.md", "linking-policy.md", "template-pack.md"],
    cta: "Generate your Obsidian vault",
  },
  {
    id: "mcp",
    name: "MCP",
    tier: "pro",

    tagline: "Model Context Protocol config, connector map & tool manifest",
    keywords: ["Model Context Protocol generator", "MCP server setup", "MCP config generator", "AI tool connector map", "LLM resource map", "MCP tool manifest"],
    outputs: ["mcp-config.json", "connector-map.md", "tool-manifest.md", "context-bridge.md"],
    cta: "Generate your MCP config",
  },
  {
    id: "artifacts",
    name: "Artifacts",
    tier: "pro",

    tagline: "Component library, dashboard widgets & embeddable snippets",
    keywords: ["component library generator", "dashboard widget code generator", "embed snippet generator", "artifact spec from schema", "React component from model", "Vue SFC generator"],
    outputs: ["component.tsx", "dashboard-widget.tsx", "embed-snippet.js", "artifact-spec.md", "component-library.md"],
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
    outputs: ["canvas-pack.md", "architecture-canvas.md", "flow-diagram.md", "planning-board.md", "system-map.md"],
    cta: "Generate your canvas",
  },
  {
    id: "algorithmic",
    name: "Algorithmic",
    tier: "pro",

    tagline: "Generative art, parameter packs & variation matrices from code",
    keywords: ["generative code art", "parameter pack generator", "variation matrix AI", "algorithmic design system", "generative sketch from codebase", "export manifest generator"],
    outputs: ["generative-sketch.js", "parameter-pack.json", "collection-map.md", "export-manifest.json", "variation-matrix.md"],
    cta: "Generate algorithmic artifacts",
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
          <span className="badge badge-accent" style={{ marginBottom: 12, display: "inline-block" }}>18 Programs · 87 Artifacts</span>
          <h1 className="programs-hero-title">
            Every AI artifact your codebase needs. Generated in seconds.
          </h1>
          <p className="programs-hero-sub">
            AXIS Toolbox analyzes your repo across 60+ languages and generates structured governance files
            for every AI coding tool — GitHub Copilot, Claude Code, Cursor, Windsurf, Aider, and more.
            One scan. 87 outputs. Zero manual work.
          </p>
          <div className="programs-hero-stats">
            <div className="programs-stat">
              <span className="programs-stat-value">87</span>
              <span className="programs-stat-label">Generated Artifacts</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">18</span>
              <span className="programs-stat-label">Specialized Programs</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">60+</span>
              <span className="programs-stat-label">Languages Detected</span>
            </div>
            <div className="programs-stat">
              <span className="programs-stat-value">3</span>
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
          <p>15 additional programs unlocked with a Pro subscription.</p>
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
          Upload a ZIP, paste a GitHub URL, or use the CLI. AXIS Toolbox scans your entire
          codebase and generates structured artifacts that make every AI coding tool more
          accurate, consistent, and effective.
        </p>
        <div className="programs-cta-actions">
          <button className="btn btn-primary btn-lg" onClick={onAnalyze}>
            Analyze your repo — it&apos;s free
          </button>
          <a className="btn btn-lg" href="mailto:jonathan@jonathanarvay.com?subject=AXIS%20Toolbox%20Demo">
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
        {program.outputs.map((o) => (
          <code key={o} className="program-output-pill">{o}</code>
        ))}
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

