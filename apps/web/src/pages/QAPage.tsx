import { useState } from "react";
import { Icon } from "../components/AxisIcons";

type QACategory = "all" | "general" | "programs" | "api" | "billing" | "technical" | "integration" | "security";

interface QAItem {
  question: string;
  answer: string;
  category: QACategory;
}

const QA_ITEMS: QAItem[] = [
  // General
  {
    category: "general",
    question: "What is Axis' Iliad?",
    answer: "Axis' Iliad is a codebase analysis platform with 18 specialized programs organized into 7 categories: Repo Intelligence, Governance, Engineering Delivery, Growth & Content, Knowledge & Context, Creative Generation, and Agentic Commerce. Upload your source code and it generates tailored documentation, rules, configurations, and other artifacts specific to your project's architecture, frameworks, and patterns. Each program has 4–5 generators that produce distinct output files.",
  },
  {
    category: "general",
    question: "What kind of projects does it work with?",
    answer: "Axis' Iliad works with any source code project — web apps, APIs, CLI tools, libraries, monorepos, and more. It supports TypeScript, JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin, and 10+ other languages. The snapshot engine detects 50+ frameworks and libraries automatically from your dependencies, imports, and code patterns.",
  },
  {
    category: "general",
    question: "Is my code stored on your servers?",
    answer: "Your source code is processed during the analysis session and stored only as a snapshot for as long as you need it. Snapshots can be deleted at any time from the Dashboard. No code is shared with third parties or used for training. All analysis runs locally between your browser and the API server — no external AI services are called.",
  },
  {
    category: "general",
    question: "How is this different from other analysis tools?",
    answer: "Unlike linters or static analyzers, Axis' Iliad generates actionable output files — AGENTS.md, .cursorrules, debug playbooks, brand guidelines, design tokens, and more. It's not just finding issues; it's creating ready-to-use artifacts for your workflow. The 86 generators across 18 programs produce files you can drop directly into your project.",
  },
  {
    category: "general",
    question: "What does 'snapshot' mean?",
    answer: "A snapshot is a frozen-in-time analysis of your codebase. When you upload files, the engine runs a 6-stage pipeline: Intake → Parse → Detect → Context → Generate → Export. The resulting snapshot contains your file tree, detected frameworks, dependency graph, language distribution, and generated output files. Snapshots are immutable — re-upload to create a new one.",
  },
  {
    category: "general",
    question: "Can I use Axis' Iliad for a monorepo?",
    answer: "Yes. Upload your monorepo root and Axis detects sub-packages, workspace configurations (pnpm, npm, yarn workspaces), and cross-package dependencies. The analysis covers all packages. For very large monorepos, consider uploading only the relevant subdirectory to improve speed.",
  },

  // Programs
  {
    category: "programs",
    question: "Which programs are free?",
    answer: "Three programs are always free: Axis Search for AI search context and repo mapping, Axis Skills for generating AGENTS.md, .cursorrules, and governance files, and Axis Debug for debugging playbooks and incident templates. These cover the most common needs. Free tier includes 10 snapshots/month and limited preview runs.",
  },
  {
    category: "programs",
    question: "What do the 15 Pro programs include?",
    answer: "Pro programs span 6 categories: Engineering Delivery (Frontend Audit, Superpowers, MCP, Artifacts), Growth & Content (SEO, Brand, Marketing), Knowledge & Context (Notebook, Obsidian), Design System (Theme), Creative Generation (Remotion, Canvas, Algorithmic), and Agentic Commerce (Agentic Purchasing). Plus Optimization from Repo Intelligence. Each produces 4–5 specialized files — design tokens, video scripts, marketing campaigns, commerce registries, and more.",
  },
  {
    category: "programs",
    question: "Can I run multiple programs at once?",
    answer: "In the web UI, run programs one at a time by clicking their cards — each takes 2–30 seconds. Via CLI, use the --programs flag with comma-separated names: `npx axis-iliad analyze . --programs search,skills,debug`. Via API, send separate POST requests per program endpoint.",
  },
  {
    category: "programs",
    question: "How long does a program take to run?",
    answer: "Most programs complete in 2–10 seconds depending on project size. Larger repos (1000+ files) may take 15–30 seconds. The UI shows a spinner while a program is generating. The free programs (Search, Skills, Debug) tend to be fastest since they focus on metadata extraction and pattern matching.",
  },
  {
    category: "programs",
    question: "What output files are generated?",
    answer: "Each program generates 4–5 files in formats appropriate to the output: Markdown (.md) for documentation and rules, JSON (.json) for configs and tokens, CSS (.css) for themes, TypeScript/JS (.tsx/.ts) for components and scripts, and YAML (.yaml) for pipelines and manifests. The Generated Files tab shows all outputs grouped by program, with preview, copy, and download options.",
  },
  {
    category: "programs",
    question: "Can I re-run a program to get updated output?",
    answer: "Yes. Re-running a program replaces the previously generated files for that program with fresh output based on the current snapshot. Other programs' files are not affected. This is useful after you've made changes to your codebase — re-upload, create a new snapshot, and re-run.",
  },
  {
    category: "programs",
    question: "What does the Axis Skills program generate?",
    answer: "Axis Skills produces AI governance files: AGENTS.md (agent capabilities and routing), CLAUDE.md (Anthropic-specific instructions), .cursorrules (Cursor IDE rules), workflow-pack.md (automation workflows), and policy-pack.md (governance policies). All files are framework-aware — TypeScript projects get different rules than Python projects.",
  },
  {
    category: "programs",
    question: "What are design tokens from Axis Theme?",
    answer: "Axis Theme generates a complete design token system: .ai/design-tokens.json (color palette, spacing, typography, shadows), theme.css (CSS custom properties), theme-guidelines.md (usage rules), component-theme-map.json (token-to-component mapping), and dark-mode-tokens.json. These files can be imported directly into your frontend build.",
  },

  // API
  {
    category: "api",
    question: "What is the API base URL?",
    answer: "The production API runs at https://axis-api-6c7z.onrender.com with all endpoints prefixed under /v1. For example: POST /v1/snapshots to create a snapshot, GET /v1/health for status checks. There are 107 endpoints covering snapshots, programs, generated files, search, accounts, API keys, team seats, billing, webhooks, and agentic commerce.",
  },
  {
    category: "api",
    question: "How do I authenticate API requests?",
    answer: "Include your API key as a Bearer token in the Authorization header: `Authorization: Bearer axis_your_key_here`. API keys always start with the axis_ prefix and are 37 characters long. Unauthenticated endpoints (health, plans, account creation) don't require a key.",
  },
  {
    category: "api",
    question: "What's the rate limit?",
    answer: "Free tier: 10 snapshots/month, 60 requests/minute. Pro tier: 200 snapshots/month, 120 requests/minute. Enterprise: unlimited with custom rate limits. Rate-limited requests receive a 429 response with a Retry-After header indicating when to retry.",
  },
  {
    category: "api",
    question: "Can I use the API without the web UI?",
    answer: "Absolutely. The API is fully independent — you can create snapshots, run programs, and download generated files using curl, Postman, or any HTTP client. The CLI is also a thin wrapper around the API. All request bodies are JSON and responses use a standard `{ ok, data }` envelope.",
  },
  {
    category: "api",
    question: "Is there an OpenAPI specification?",
    answer: "The API follows REST conventions with JSON request/response bodies. Check the Docs page (Ctrl+5) for the full endpoint reference including request formats, response shapes, error codes, and 5 annotated curl examples with request/response bodies.",
  },
  {
    category: "api",
    question: "How do I paginate API results?",
    answer: "List endpoints accept `limit` (default 50, max 200) and `offset` query parameters. Example: `GET /v1/projects/prj_abc/generated-files?limit=10&offset=20`. You can also filter by program: `?program=search`. Sort with `?sort=name` or `?sort=created_at`.",
  },
  {
    category: "api",
    question: "What error codes does the API return?",
    answer: "Standard HTTP codes: 400 (bad request — missing/invalid parameters), 401 (unauthorized — missing or invalid API key), 403 (forbidden — insufficient tier), 404 (not found), 429 (rate limit — retry after cooldown), 500 (server error — check logs). Error responses include an `error` string with a human-readable message.",
  },

  // Billing
  {
    category: "billing",
    question: "How much does Pro cost?",
    answer: "Pro is $29/month or $279/year (save 20% with annual billing). It includes all 18 programs, 200 snapshots/month, 20 projects, 5 team seats, and 120 requests/minute API rate limit. Each program can be purchased individually if you only need specific capabilities.",
  },
  {
    category: "billing",
    question: "Can I try Pro before committing?",
    answer: "Start with the Free tier to try the 3 core programs (Search, Skills, Debug). The output quality and format is identical to Pro — you just have access to fewer programs and lower limits (10 snapshots/month, 1 project, 1 seat). No credit card required for Free tier.",
  },
  {
    category: "billing",
    question: "What's included in Enterprise?",
    answer: "Enterprise includes unlimited snapshots, programs, projects, and team seats. Plus SSO integration, audit logs, dedicated support, custom rate limits, and SLA guarantees. Contact sales@lastmanup.com for pricing — plans are customized based on team size and usage patterns.",
  },
  {
    category: "billing",
    question: "How do team seats work?",
    answer: "Pro includes 5 seats and Enterprise is unlimited. Invite team members by email from the Account page. Each member gets their own API key with member-level permissions. Admins can manage seats, keys, and billing. Members can run programs, view results, and generate files but cannot manage billing or team settings.",
  },
  {
    category: "billing",
    question: "Can I cancel or downgrade?",
    answer: "Yes. Change your plan at any time from the Account page. Downgrading takes effect at the end of your current billing period — you keep Pro access until then. Your generated files and project history remain accessible on the new plan (within its project limits).",
  },
  {
    category: "billing",
    question: "Do programs have individual pricing?",
    answer: "Yes. Each of the 18 programs is separately billable — you can purchase only the programs you need instead of the full Pro plan. Visit the Plans page for individual program pricing. The Suite bundle (all 18) is discounted compared to purchasing programs individually.",
  },

  // Technical
  {
    category: "technical",
    question: "What's the maximum upload size?",
    answer: "Upload limits vary by tier: Free allows up to 5MB per file and 1,000 files per snapshot, Pro allows 50MB per file and 2,000 files, and Enterprise allows 100MB per file and 5,000 files. For very large repos, use the GitHub URL method which handles cloning more efficiently and respects .gitignore automatically.",
  },
  {
    category: "technical",
    question: "How does the full-text search work?",
    answer: "Search uses SQLite FTS5 — a high-performance full-text search engine. Click 'Index Snapshot' to build the index (1–5 seconds), then type any query. Results show file path, line number, matching content snippet, and relevance score. Supports boolean operators (AND, OR, NOT) and phrase matching with quotes.",
  },
  {
    category: "technical",
    question: "What frameworks does Axis detect?",
    answer: "Axis detects 50+ frameworks and libraries including React, Next.js, Vue, Svelte, Angular, Express, Fastify, Django, Flask, Rails, Spring Boot, ASP.NET, and many more. Detection uses three signals: dependency manifests (package.json, requirements.txt), import patterns in source code, and configuration files (next.config.js, vite.config.ts).",
  },
  {
    category: "technical",
    question: "Does Axis work offline?",
    answer: "The hosted web app and API run on Render and Cloudflare Pages — no local install needed. For self-hosted setups, the web UI and API server can run locally (API on port 4000 by default). GitHub URL analysis always requires internet access to clone the repository.",
  },
  {
    category: "technical",
    question: "Which browsers are supported?",
    answer: "Axis' Iliad works in all modern browsers — Chrome, Firefox, Safari, and Edge. The dark theme renders best with system-level dark mode enabled. The UI is built with React 19, uses CSS custom properties for theming, and requires JavaScript to be enabled.",
  },
  {
    category: "technical",
    question: "What database does Axis use?",
    answer: "Axis uses SQLite via the better-sqlite3 driver — a high-performance, zero-configuration embedded database. Project snapshots, generated files, accounts, API keys, and search indexes are all stored in a single SQLite file. FTS5 (Full-Text Search 5) is used for the search feature.",
  },
  {
    category: "technical",
    question: "Can I run the API server on a different port?",
    answer: "Yes. Set the PORT environment variable before starting: `PORT=8080 pnpm dev` or pass it in your .env file. The frontend expects the API at the URL configured in its environment — update VITE_API_URL if you change the port.",
  },

  // Integration
  {
    category: "integration",
    question: "Can I use Axis in a CI/CD pipeline?",
    answer: "Yes. Install the CLI (`npm install -g axis-iliad`) and run it in your pipeline. Set AXIS_API_KEY as a secret environment variable. Example GitHub Action: `npx axis-iliad analyze . --programs search,skills,debug --output ./axis-output`. Then upload the output as a build artifact.",
  },
  {
    category: "integration",
    question: "Does Axis support GitHub Actions?",
    answer: "Yes. Add a workflow step that runs `npx axis-iliad analyze .` with your desired programs. Use `actions/upload-artifact` to save the output. See the CLI tab in the Docs page for a complete .github/workflows/axis.yml example with environment variables and artifact uploads.",
  },
  {
    category: "integration",
    question: "Can I use Axis output with Cursor IDE?",
    answer: "Absolutely — that's a core use case. Run Axis Skills to generate .cursorrules and CURSOR.md. Copy these into your project root. Cursor will automatically pick them up and use them to guide AI completions and chat responses with project-specific context.",
  },
  {
    category: "integration",
    question: "Does Axis work with VS Code extensions?",
    answer: "Axis generates AGENTS.md and governance files that work with GitHub Copilot and other VS Code AI extensions. The .ai/ directory contains workflow definitions and policies that can be referenced from VS Code's .github/copilot-instructions.md or custom prompt files.",
  },
  {
    category: "integration",
    question: "Can I import Axis output into Obsidian?",
    answer: "Yes. Run Axis Obsidian to generate vault-aware files: obsidian-skill-pack.md, vault-rules.md, graph-prompt-map.json, linking-policy.md, and template-pack.md. Copy these into your Obsidian vault. They follow Obsidian's linking conventions and work with the graph view.",
  },
  {
    category: "integration",
    question: "How do I use Axis with MCP servers?",
    answer: "Run Axis MCP to generate mcp-config.json, mcp-registry-metadata.json, protocol-spec.md, spec.types.ts, mcp/README.md, mcp/project-setup.md, mcp/build-artifacts.md, mcp/package-json.root.template.json, mcp/package-json.package.template.json, mcp/tsconfig.root.template.json, mcp/tsconfig.package.template.json, connector-map.yaml, capability-registry.json, and server-manifest.yaml. These files define your private MCP endpoint configuration, protocol and type contracts, project setup/build guidance, root/per-package package.json templates, and root/per-package tsconfig templates, plus MCP Registry publishing metadata. Pro includes hosted private endpoints with persistent configs, auth management, and usage logs.",
  },

  // Security
  {
    category: "security",
    question: "How is my API key stored?",
    answer: "In the web UI, your API key is stored in the browser's localStorage. It's sent as a Bearer token over HTTPS to the API server. Keys are hashed (SHA-256) before storage in the database — the original key is never stored in plaintext on the server. Treat your key like a password.",
  },
  {
    category: "security",
    question: "Can I rotate my API key?",
    answer: "Yes. Go to the Account page and create a new API key. You can have multiple active keys simultaneously. Update your scripts, CI configs, and environment variables with the new key, then revoke the old one. Rotation doesn't affect existing sessions until the old key is revoked.",
  },
  {
    category: "security",
    question: "Is my source code sent to external AI services?",
    answer: "No. All analysis runs between your browser and the Axis API server — no code is forwarded to OpenAI, Anthropic, or any external AI service. The snapshot engine performs pattern detection, framework identification, and file generation entirely within the server process.",
  },
  {
    category: "security",
    question: "What happens when I delete a snapshot?",
    answer: "Deleting a snapshot permanently removes all associated data: the file tree, analysis results, generated files, and search index. This is irreversible. The SQLite database is compacted after deletion to reclaim disk space.",
  },
  {
    category: "security",
    question: "Are team member permissions enforced?",
    answer: "Yes. Team roles are enforced at the API level. Members can run programs, view results, and generate files. Only Admins can manage team seats, create/revoke API keys, change billing settings, and delete projects. Permissions are checked on every authenticated request.",
  },
];

const CATEGORY_LABELS: Record<QACategory, { label: string; icon: string }> = {
  all: { label: "All", icon: "clipboard" },
  general: { label: "General", icon: "lightbulb" },
  programs: { label: "Programs", icon: "programs" },
  api: { label: "API", icon: "api-link" },
  billing: { label: "Billing", icon: "credit-card" },
  technical: { label: "Technical", icon: "gear" },
  integration: { label: "Integration", icon: "plug-connect" },
  security: { label: "Security", icon: "shield-lock" },
};

export function QAPage() {
  const [category, setCategory] = useState<QACategory>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = QA_ITEMS.filter((item) => {
    const matchesCategory = category === "all" || item.category === category;
    const matchesSearch =
      !search ||
      item.question.toLowerCase().includes(search.toLowerCase()) ||
      item.answer.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryCounts = new Map<QACategory, number>();
  for (const item of QA_ITEMS) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  }

  return (
    <div>
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Questions & Answers</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto 16px" }}>
          Find answers to common questions about Axis' Iliad.
        </p>
        <div style={{ maxWidth: 400, margin: "0 auto" }}>
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", textAlign: "center" }}
          />
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {(Object.keys(CATEGORY_LABELS) as QACategory[]).map((cat) => (
          <button
            key={cat}
            className={`tab ${category === cat ? "active" : ""}`}
            onClick={() => { setCategory(cat); setExpanded(null); }}
          >
            <Icon name={CATEGORY_LABELS[cat].icon} /> {CATEGORY_LABELS[cat].label}
            {cat !== "all" && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                }}
              >
                ({categoryCounts.get(cat) ?? 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}><Icon name="search" /></span>
          No questions match your search.
        </div>
      ) : (
        <div className="card stagger">
          {filtered.map((item, i) => {
            const globalIndex = QA_ITEMS.indexOf(item);
            return (
              <div
                key={globalIndex}
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : undefined,
                  padding: "14px 0",
                }}
              >
                <div
                  className="flex-between"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === globalIndex ? null : globalIndex)}
                >
                  <div className="flex" style={{ gap: 10 }}>
                    <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.875rem" }}>Q</span>
                    <strong style={{ fontSize: "0.875rem" }}>{item.question}</strong>
                  </div>
                  <div className="flex" style={{ gap: 8 }}>
                    <span
                      className={`badge ${item.category === "general" ? "badge-green" : item.category === "programs" ? "badge-accent" : item.category === "api" ? "badge-blue" : item.category === "billing" ? "badge-yellow" : ""}`}
                      style={{ fontSize: "0.625rem" }}
                    >
                      {CATEGORY_LABELS[item.category].label}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {expanded === globalIndex ? "▲" : "▼"}
                    </span>
                  </div>
                </div>
                {expanded === globalIndex && (
                  <div
                    className="animate-fade-in"
                    style={{
                      marginTop: 10,
                      paddingLeft: 24,
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.7,
                    }}
                  >
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ textAlign: "center", marginTop: 24 }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          Don't see your question? Check the{" "}
          <strong style={{ color: "var(--accent)", cursor: "pointer" }}>Help Center</strong> or reach out to{" "}
          <strong style={{ color: "var(--accent)" }}>support@jonathanarvay.com</strong>
        </p>
      </div>
    </div>
  );
}
