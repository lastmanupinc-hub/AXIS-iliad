import { useState } from "react";
import { Icon } from "../components/AxisIcons";
import { useTabList } from "../useTabList.ts";
// Single-source counts (WO-F5) — never inline these numbers.
import { FREE_PROGRAM_COUNT, PROGRAM_COUNT, PRO_PROGRAM_COUNT } from "../config.ts";

type HelpSection = "getting-started" | "upload" | "programs" | "dashboard" | "account" | "troubleshooting";

interface Step {
  number: number;
  title: string;
  description: string;
  icon: string;
}

interface TroubleshootItem {
  problem: string;
  solution: string;
}

const GETTING_STARTED_STEPS: Step[] = [
  { number: 1, title: "Sign In", description: "Click Sign In and continue with GitHub or Google — one click, no password. Your session is a secure HttpOnly cookie; you never handle a key to log in.", icon: "user" },
  { number: 2, title: "Upload Your Project", description: "Head to the Analyze page. Drag and drop a folder, upload a ZIP file, or paste a GitHub repository URL. Axis will scan all source files.", icon: "upload" },
  { number: 3, title: "Review the Snapshot", description: "Once analysis completes, you'll land on the project page. Explore the Overview, Structure, Dependencies, and other tabs to understand your codebase.", icon: "dashboard" },
  { number: 4, title: "Run Programs", description: `Switch to the Programs tab and click any program card to generate tailored output files. Free-tier users get ${FREE_PROGRAM_COUNT} programs; upgrade for all ${PROGRAM_COUNT}.`, icon: "programs" },
  { number: 5, title: "Download or Search", description: "Use the Artifacts tab to search, preview, copy, and download output, or export everything as a ZIP. The Search tab lets you query your indexed snapshot.", icon: "download" },
];

const UPLOAD_TIPS = [
  { title: "Folder Upload", description: "Click 'Choose Folder' to select a project directory. Axis reads all source files recursively, ignoring common exclusions like node_modules and .git." },
  { title: "ZIP Upload", description: "Click the ZIP button or drag a .zip file onto the upload area. Axis extracts and analyzes all files inside." },
  { title: "GitHub URL", description: "Paste any public GitHub repository URL (e.g. https://github.com/user/repo). Axis clones and analyzes the default branch." },
  { title: "Project Settings", description: "Optionally name your project, select a project type, describe your goals, and choose which output categories to generate." },
];

const TROUBLESHOOTING: TroubleshootItem[] = [
  { problem: "API shows red dot in the status bar", solution: "The API server isn't running. Start it with `pnpm dev` in the apps/api directory. Make sure port 4000 is available." },
  { problem: "\"Unauthorized\" error on program run", solution: "Your API key may be missing or invalid. Go to Settings, check your key, or create a new one. Keys must start with axis_." },
  { problem: "Dashboard won't load after upload", solution: "The upload may have failed silently. Check the browser console for errors. Try re-uploading with a smaller project first." },
  { problem: "Programs show as locked", solution: `You're on the Free tier which includes ${FREE_PROGRAM_COUNT} programs. Upgrade to Starter, Pro, or Growth to unlock all ${PROGRAM_COUNT} programs.` },
  { problem: "ZIP upload fails", solution: "Ensure the ZIP file isn't corrupted and contains source files. Maximum recommended size is 50MB. Very large repos should use GitHub URL instead." },
  { problem: "Search returns no results", solution: "You need to build the search index first. Go to the Search tab and click 'Index Snapshot' before running queries." },
  { problem: "Slow analysis for large repo", solution: "Large repositories take longer to scan. Consider uploading only the relevant source directories instead of the entire project root." },
  { problem: "Generated files look generic", solution: "Make sure you're uploading actual source files, not just config. The more source code Axis can analyze, the more specific the output." },
  { problem: "GitHub URL returns 'Clone failed'", solution: "The repository may be private or the URL may be malformed. Ensure it's a valid public GitHub URL. Private repos require GitHub authentication." },
  { problem: "API key not accepted after copy-paste", solution: "Check for trailing whitespace or line breaks in the pasted key. Keys must start with 'axis_' and be exactly 64 characters. Try creating a fresh key." },
  { problem: "Export ZIP is empty", solution: "Programs must be run before exporting. Go to the Programs tab and generate files first. The ZIP only includes files from programs you've actually run." },
  { problem: "Command palette doesn't open", solution: "Press Ctrl+K (or Cmd+K on Mac). If nothing happens, click anywhere in the app first to ensure it has focus. The palette requires JavaScript to be enabled." },
  { problem: "Dashboard shows 0 files / 0 dependencies", solution: "Your upload may only contain config files or non-source files. Re-upload with actual source code (.ts, .js, .py, etc.) for meaningful analysis." },
];

export function HelpPage() {
  const [section, setSection] = useState<HelpSection>("getting-started");

  const sections: { id: HelpSection; label: string; icon: string }[] = [
    { id: "getting-started", label: "Getting Started", icon: "rocket" },
    { id: "upload", label: "Upload Guide", icon: "upload" },
    { id: "programs", label: "Using Programs", icon: "programs" },
    { id: "dashboard", label: "Project Page Guide", icon: "dashboard" },
    { id: "account", label: "Account & Billing", icon: "credit-card" },
    { id: "troubleshooting", label: "Troubleshooting", icon: "wrench" },
  ];
  const sectionIds = sections.map((s) => s.id);
  const { tabListProps, getTabProps, getPanelProps } = useTabList(sectionIds, section, setSection);

  return (
    <div>
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>Help Center</h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 520, margin: "0 auto" }}>
          Step-by-step guides, tips, and troubleshooting for Axis' Iliad.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }} {...tabListProps} aria-label="Help topics">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`tab ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
            {...getTabProps(s.id)}
          >
            <Icon name={s.icon} /> {s.label}
          </button>
        ))}
      </div>

      <div {...getPanelProps(section)}>
        {section === "getting-started" && <GettingStartedSection />}
        {section === "upload" && <UploadGuideSection />}
        {section === "programs" && <ProgramsGuideSection />}
        {section === "dashboard" && <DashboardGuideSection />}
        {section === "account" && <AccountGuideSection />}
        {section === "troubleshooting" && <TroubleshootingSection />}
      </div>
    </div>
  );
}

function GettingStartedSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 16, fontSize: "1rem", fontWeight: 600 }}>Quick Start Guide</h2>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 20 }}>
          Get up and running with Axis' Iliad in 5 steps.
        </p>
        {GETTING_STARTED_STEPS.map((step) => (
          <div
            key={step.number}
            className="flex"
            style={{
              gap: 16,
              padding: "16px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {step.number}
            </div>
            <div>
              <div className="flex" style={{ gap: 8, marginBottom: 4 }}>
                <Icon name={step.icon} />
                <strong style={{ fontSize: "0.9375rem" }}>{step.title}</strong>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Keyboard Shortcuts</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Shortcut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><kbd>Ctrl+1</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Analyze page</td></tr>
            <tr><td><kbd>Ctrl+2</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Dashboard (sign in required)</td></tr>
            <tr><td><kbd>Ctrl+3</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Plans page</td></tr>
            <tr><td><kbd>Ctrl+4</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Settings page</td></tr>
            <tr><td><kbd>Ctrl+5</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Documentation page</td></tr>
            <tr><td><kbd>Ctrl+6</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Help Center</td></tr>
            <tr><td><kbd>Ctrl+7</kbd></td><td style={{ color: "var(--text-muted)" }}>Go to Q&amp;A page</td></tr>
            <tr><td><kbd>Ctrl+K</kbd></td><td style={{ color: "var(--text-muted)" }}>Open Command Palette</td></tr>
            <tr><td><kbd>Alt+1–6</kbd></td><td style={{ color: "var(--text-muted)" }}>Switch Dashboard tabs (Overview, Structure, Deps, Files, Programs, Search)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Navigation Overview</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Axis' Iliad has 7 main pages, each accessible via the header navigation or keyboard shortcuts.
        </p>
        <div className="grid grid-2" style={{ gap: 10 }}>
          {[
            { page: "Analyze", key: "Ctrl+1", desc: "Upload projects via folder, ZIP, or GitHub URL" },
            { page: "Dashboard", key: "Ctrl+2", desc: "Your projects, usage, and quick actions" },
            { page: "Plans", key: "Ctrl+3", desc: "Compare Free, Starter, Pro, and Growth tiers" },
            { page: "Settings", key: "Ctrl+4", desc: "Manage API keys, team seats, GitHub tokens, and webhooks" },
            { page: "Docs", key: "Ctrl+5", desc: "Full documentation, API reference, CLI guide" },
            { page: "Help", key: "Ctrl+6", desc: "Step-by-step guides and troubleshooting" },
            { page: "Q&A", key: "Ctrl+7", desc: "Searchable questions and answers" },
          ].map((p) => (
            <div
              key={p.page}
              className="flex"
              style={{
                gap: 10,
                padding: "8px 12px",
                background: "var(--bg)",
                borderRadius: "var(--radius)",
              }}
            >
              <kbd style={{ fontSize: "0.6875rem", flexShrink: 0 }}>{p.key}</kbd>
              <div>
                <strong style={{ fontSize: "0.8125rem" }}>{p.page}</strong>
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: 0 }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadGuideSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 16, fontSize: "1rem", fontWeight: 600 }}>Upload Methods</h2>
        <div className="grid grid-2">
          {UPLOAD_TIPS.map((tip) => (
            <div
              key={tip.title}
              className="card"
              style={{ padding: 16, marginBottom: 0 }}
            >
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 8 }}>{tip.title}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                {tip.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>What Gets Scanned</h2>
        <div className="grid grid-2">
          <div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--green)", marginBottom: 8 }}>✓ Included</h3>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>Source files (.ts, .js, .py, .go, .rs, etc.)</li>
              <li>Config files (package.json, tsconfig, etc.)</li>
              <li>Markdown documentation (.md)</li>
              <li>Stylesheets (.css, .scss)</li>
              <li>Templates (.html, .svelte, .vue)</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>✗ Excluded</h3>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>node_modules / vendor directories</li>
              <li>.git directory</li>
              <li>Binary files (images, PDFs, etc.)</li>
              <li>Build output (dist, build, .next)</li>
              <li>Lock files (package-lock, yarn.lock)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Supported Languages</h2>
        <div className="flex-wrap" style={{ gap: 8 }}>
          {["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "C#", "C/C++", "Ruby", "PHP", "Swift", "Kotlin", "Svelte", "Vue", "HTML", "CSS", "SCSS", "YAML", "JSON", "Markdown"].map((lang) => (
            <span key={lang} className="badge badge-accent" style={{ fontSize: "0.75rem" }}>
              {lang}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgramsGuideSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Running Programs</h2>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          After uploading and analyzing your project, switch to the <strong>Programs</strong> tab
          on the project page. Each card represents a program that generates specialized output files.
        </p>
        <div className="grid grid-3">
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}><Icon name="step-1" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>Select a Program</strong>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click any program card — free programs are green, pro are purple</p>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}><Icon name="step-2" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>Wait for Generation</strong>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>A spinner shows while generators produce 6–7 output files (2–30 seconds)</p>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}><Icon name="step-3" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>View Results</strong>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Switch to the Artifacts tab — search, preview, copy, or download output</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Program Tiers</h2>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Count</th>
              <th>Programs</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-green">Free</span></td>
              <td style={{ fontWeight: 600 }}>3</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                <Icon name="search" /> Axis Search &nbsp;·&nbsp; <Icon name="skills" /> Axis Skills &nbsp;·&nbsp; <Icon name="debug" /> Axis Debug
              </td>
            </tr>
            <tr>
              <td><span className="badge badge-accent">Pro</span></td>
              <td style={{ fontWeight: 600 }}>{PRO_PROGRAM_COUNT}</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                <Icon name="frontend" /> Frontend &nbsp;·&nbsp; <Icon name="seo" /> SEO &nbsp;·&nbsp; <Icon name="optimization" /> Optimization &nbsp;·&nbsp; <Icon name="theme" /> Theme &nbsp;·&nbsp;
                <Icon name="brand" /> Brand &nbsp;·&nbsp; <Icon name="superpowers" /> Superpowers &nbsp;·&nbsp; <Icon name="marketing" /> Marketing &nbsp;·&nbsp; <Icon name="notebook" /> Notebook &nbsp;·&nbsp;
                <Icon name="obsidian" /> Obsidian &nbsp;·&nbsp; <Icon name="mcp" /> MCP &nbsp;·&nbsp; <Icon name="artifacts" /> Artifacts &nbsp;·&nbsp; <Icon name="remotion" /> Remotion &nbsp;·&nbsp;
                <Icon name="canvas" /> Canvas &nbsp;·&nbsp; <Icon name="algorithmic" /> Algorithmic &nbsp;·&nbsp; Agentic Purchasing &nbsp;·&nbsp; Closer &nbsp;·&nbsp; <Icon name="rocket" /> Deploy
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Program Categories</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Programs are grouped into 8 categories. Each addresses a different part of the development lifecycle.
        </p>
        <div className="grid grid-2" style={{ gap: 10 }}>
          {[
            { cat: "Repo Intelligence", icon: "search", programs: "Search, Debug, Optimization" },
            { cat: "Governance", icon: "skills", programs: "Skills" },
            { cat: "Engineering Delivery", icon: "frontend", programs: "Frontend, Superpowers, MCP, Artifacts, Closer, Deploy" },
            { cat: "Growth & Content", icon: "seo", programs: "SEO, Brand, Marketing" },
            { cat: "Knowledge & Context", icon: "notebook", programs: "Notebook, Obsidian" },
            { cat: "Design System", icon: "theme", programs: "Theme" },
            { cat: "Creative Generation", icon: "remotion", programs: "Remotion, Canvas, Algorithmic" },
            { cat: "Agentic Commerce", icon: "credit-card", programs: "Agentic Purchasing" },
          ].map((c) => (
            <div key={c.cat} style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
              <div className="flex" style={{ gap: 6, marginBottom: 4 }}>
                <Icon name={c.icon} />
                <strong style={{ fontSize: "0.8125rem" }}>{c.cat}</strong>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: 0 }}>{c.programs}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Understanding Program Output</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Each program produces 4–5 files. Here's what to expect from each output format:
        </p>
        <div className="grid grid-2" style={{ gap: 10 }}>
          <div style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
            <strong style={{ fontSize: "0.8125rem", color: "var(--green)" }}>Markdown files (.md)</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              Human-readable docs, rules, playbooks, and guidelines. Copy into your repo root or .ai/ directory.
            </p>
          </div>
          <div style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
            <strong style={{ fontSize: "0.8125rem", color: "var(--accent)" }}>JSON files (.json)</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              Machine-readable configs, tokens, and maps. Used by design systems, MCP servers, and build tools.
            </p>
          </div>
          <div style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
            <strong style={{ fontSize: "0.8125rem", color: "var(--yellow)" }}>CSS / YAML files</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              Theme stylesheets and pipeline configs. Drop into your project and import directly.
            </p>
          </div>
          <div style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
            <strong style={{ fontSize: "0.8125rem", color: "var(--accent)" }}>TypeScript / JS files</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              Generated components, scripts, and sketches. Ready to import into your project build.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Tips for Better Output</h2>
        <ul style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Upload your <strong>source code</strong>, not just config files — more context means better output</li>
          <li>Include your <strong>package.json</strong> or equivalent — it helps detect frameworks and dependencies</li>
          <li>Add a <strong>README.md</strong> — it provides project context to the generators</li>
          <li>Set meaningful <strong>goals</strong> in the upload form — they guide the output focus</li>
          <li>Re-run programs after making changes to your codebase for updated output</li>
          <li>Use the <strong>GitHub URL</strong> method for large repos — it handles cloning more efficiently</li>
          <li>Check the <strong>Dashboard Overview</strong> tab first to verify Axis detected your frameworks correctly</li>
        </ul>
      </div>
    </div>
  );
}

function DashboardGuideSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Project Page Overview</h2>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          After uploading and analyzing a project, its page (addressable at its own URL —
          open it again anytime from a project card on the Dashboard) shows your analysis
          results across 7 tabs. Use <kbd>Alt+1</kbd> through <kbd>Alt+7</kbd> to switch between them.
        </p>
        <div className="grid grid-2" style={{ gap: 10 }}>
          {[
            { tab: "Overview", key: "Alt+1", icon: "clipboard", desc: "Project summary — languages, frameworks, file count, overall health score, and detected patterns. This is your starting point." },
            { tab: "Structure", key: "Alt+2", icon: "folder", desc: "File tree visualization showing directory layout, file sizes, and language distribution. Identifies large files and deep nesting." },
            { tab: "Dependencies", key: "Alt+3", icon: "api-link", desc: "Dependency graph with package counts, version ranges, and outdated/vulnerable package warnings from your manifest files." },
            { tab: "Artifacts", key: "Alt+4", icon: "file-doc", desc: "Search and filter every output file from programs you've run, by name, content, program, or file type. Preview (with rendered markdown), copy path/content, or download a file individually." },
            { tab: "Programs", key: "Alt+5", icon: "programs", desc: `Program launcher — ${PROGRAM_COUNT} cards organized by tier (Free / Pro). Click a card to generate output. Shows which programs have already been run.` },
            { tab: "Search", key: "Alt+6", icon: "search", desc: "Full-text search across your snapshot. Build the index first, then search by keyword, function name, or content pattern." },
            { tab: "Versions", key: "Alt+7", icon: "analyze", desc: "Snapshot history, generation-version diffs, project memory, and snapshot/project deletion." },
          ].map((t) => (
            <div key={t.tab} className="card" style={{ padding: 14, marginBottom: 0 }}>
              <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                <Icon name={t.icon} />
                <strong style={{ fontSize: "0.875rem" }}>{t.tab}</strong>
                <kbd style={{ fontSize: "0.625rem", marginLeft: "auto" }}>{t.key}</kbd>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.6 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Understanding Your Snapshot</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          When you upload a project, Axis creates a <strong>snapshot</strong> — a frozen analysis
          of your codebase at that moment. Here's what the snapshot engine detects:
        </p>
        <table>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Source</th>
              <th>Used By</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Languages &amp; extensions</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>File extensions, shebangs</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>All programs — determines analysis scope</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Frameworks &amp; libraries</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>package.json, imports, config files</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Frontend, Skills, Theme — framework-specific rules</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Project structure</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Directory tree, file naming</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Search, Debug — architecture mapping</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Dependencies</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Manifests, lock files, imports</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Optimization — cost/token analysis</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Project type</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Heuristics + user input</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Brand, Marketing — audience-aware output</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>README &amp; docs</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Markdown files at root</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Brand, Notebook — context extraction</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Working with Artifacts</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          The Artifacts tab (Alt+4) shows all generated output organized by program. Here's how to use it:
        </p>
        <ul style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.8, paddingLeft: 20 }}>
          <li><strong>Search:</strong> Type in the search box to match a filename or file content substring, live</li>
          <li><strong>Filter:</strong> Narrow by program or by file type with the two dropdowns</li>
          <li><strong>Tree / Grid:</strong> Toggle between a program-grouped list and a flat card grid</li>
          <li><strong>Preview:</strong> Click any file — Markdown files render with headings/lists/links; other types show as plain text (a "Raw" toggle is available for Markdown too)</li>
          <li><strong>Copy:</strong> "Copy path" or "Copy content" puts either on your clipboard — paste directly into your project</li>
          <li><strong>Download:</strong> "Download" saves just the selected file; the download button on each program group saves that program's files as a ZIP</li>
          <li><strong>Export everything:</strong> Use "Download All" at the top of the page for a full-project ZIP</li>
          <li><strong>Re-generate:</strong> Go back to the Programs tab and re-run — new files replace the old ones</li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Using Full-Text Search</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          The Search tab (Alt+6) uses Postgres full-text search across your entire snapshot.
        </p>
        <div className="grid grid-3" style={{ gap: 10, marginBottom: 12 }}>
          <div className="card" style={{ padding: 12, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 6 }}><Icon name="step-1" /></div>
            <strong style={{ fontSize: "0.75rem", display: "block", marginBottom: 4 }}>Build Index</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.6875rem" }}>Click "Index Snapshot" — runs once, takes 1–5 seconds</p>
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 6 }}><Icon name="step-2" /></div>
            <strong style={{ fontSize: "0.75rem", display: "block", marginBottom: 4 }}>Type Query</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.6875rem" }}>Search by function name, variable, class, or keyword</p>
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 6 }}><Icon name="step-3" /></div>
            <strong style={{ fontSize: "0.75rem", display: "block", marginBottom: 4 }}>Browse Results</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.6875rem" }}>Results show file path, line number, and matching snippet</p>
          </div>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.6 }}>
          <strong>Tip:</strong> Search supports boolean operators — try <code
            className="mono" style={{ fontSize: "0.6875rem" }}>handleSubmit AND form</code> or
          <code className="mono" style={{ fontSize: "0.6875rem" }}>"useEffect"</code> for exact match.
        </p>
      </div>
    </div>
  );
}

function AccountGuideSection() {
  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Account Management</h2>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          You sign in to the web app with GitHub or Google — there are no passwords. API keys are
          a separate, optional credential for programmatic access (CLI, MCP, CI).
        </p>
        <div className="grid grid-2">
          <div className="card" style={{ padding: 16, marginBottom: 0 }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 8 }}>Signing In</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
              Click Sign In and continue with GitHub or Google — no separate signup step. Your
              session rides a secure HttpOnly cookie; there's nothing to store or lose.
            </p>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 0 }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 8 }}>Web login vs. API keys</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
              Web login (GitHub/Google) is for using the app in a browser. API keys are for
              programmatic use: create one from the Settings page and pass it as a Bearer token
              from your CLI, MCP client, or CI.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Team Management</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Starter, Pro, and Growth plans include team seats. Invite team members by email from the
          Settings page and assign roles (admin or member). Revoke access at any time.
        </p>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-accent">Admin</span></td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Full access — manage seats, keys, billing, all programs</td>
            </tr>
            <tr>
              <td><span className="badge badge-green">Member</span></td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Run programs, view results, generate files</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Upgrading Your Plan</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7 }}>
          Visit the Plans page to compare tiers. The Free plan includes {FREE_PROGRAM_COUNT} core programs and 10
          snapshots per month. Starter unlocks all {PROGRAM_COUNT} programs with 75,000 monthly credits,
          Pro includes 300,000 credits, and Growth includes 1,200,000 credits.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Starter ($29/mo)</th>
              <th>Pro ($99/mo)</th>
              <th>Growth ($299/mo)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Programs</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>3</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>20</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>20</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>20</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Monthly credits</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>10,000</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>75,000</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>300,000</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>1,200,000</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Annual billing</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Available</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Save 20%</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Save 20%</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Save 20%</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Overage rate</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>$0.0018 / credit</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>$0.0018 / credit</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>$0.0018 / credit</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>$0.0018 / credit</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Team seats</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>1</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>5</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>10</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Unlimited</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>API Key Lifecycle</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          API keys authenticate programmatic access. Manage them from the Settings page's API Keys section:
        </p>
        <div className="grid grid-2" style={{ gap: 10 }}>
          {[
            { action: "Create", desc: "Sign in (GitHub/Google), then create a key from Settings. It's shown once — copy and store it safely. Keys always start with axis_." },
            { action: "Use", desc: "For API/CLI/MCP, pass as a Bearer token or set the AXIS_API_KEY env var. (Web login uses GitHub/Google — no key needed.)" },
            { action: "Rotate", desc: "Create a new key from Settings. Update all scripts and CI configs. Old key continues working until revoked." },
            { action: "Revoke", desc: "Click Revoke next to a key in Settings. It becomes invalid immediately. Create a new one before revoking the last active key." },
          ].map((k) => (
            <div key={k.action} style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: "var(--radius)" }}>
              <strong style={{ fontSize: "0.8125rem", color: "var(--accent)" }}>{k.action}</strong>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "4px 0 0", lineHeight: 1.5 }}>{k.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Usage Meters</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Track your usage on the Usage page. Each meter resets at the start of each calendar month.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 12 }}>
          Referral rewards lower your effective dollars per call as referrals grow (up to 0.02% benefit),
          and this reward state resets at the start of each calendar month.
        </p>
        <table>
          <thead>
            <tr>
              <th>Meter</th>
              <th>What It Tracks</th>
              <th>Visible On</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Snapshots</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Number of analysis runs this month</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Usage page, API /account/usage</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Programs run</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Individual program executions</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Usage page, API /account/usage</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>Files generated</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Total output files produced</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Usage page</td>
            </tr>
            <tr>
              <td style={{ fontSize: "0.8125rem" }}>API calls</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Total HTTP requests this period</td>
              <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>API /account/usage</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TroubleshootingSection() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="stagger">
      <div className="card">
        <h2 style={{ marginBottom: 16, fontSize: "1rem", fontWeight: 600 }}>Common Issues</h2>
        {TROUBLESHOOTING.map((item, i) => (
          <div
            key={i}
            style={{
              borderBottom: i < TROUBLESHOOTING.length - 1 ? "1px solid var(--border)" : undefined,
              padding: "12px 0",
            }}
          >
            <button
              type="button"
              className="flex-between"
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0, textAlign: "left" }}
              aria-expanded={expanded === i}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex" style={{ gap: 8 }}>
                <span style={{ color: "var(--yellow)" }}><Icon name="warning" /></span>
                <strong style={{ fontSize: "0.875rem" }}>{item.problem}</strong>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                {expanded === i ? "▲" : "▼"}
              </span>
            </button>
            {expanded === i && (
              <div
                className="animate-fade-in"
                style={{
                  marginTop: 8,
                  paddingLeft: 32,
                  color: "var(--text-muted)",
                  fontSize: "0.8125rem",
                  lineHeight: 1.6,
                }}
              >
                {item.solution}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>Still Need Help?</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7, marginBottom: 16 }}>
          If you can't find an answer here, try these resources:
        </p>
        <div className="grid grid-3">
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 8 }}><Icon name="docs-overview" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>Docs</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Full documentation and API reference</p>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 8 }}><Icon name="question" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>Q&A</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Community questions and answers</p>
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: 8 }}><Icon name="email" /></div>
            <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: 4 }}>Contact</strong>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>support@jonathanarvay.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
