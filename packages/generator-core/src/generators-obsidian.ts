import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";

// ─── obsidian-skill-pack.md ─────────────────────────────────────

export function generateObsidianSkillPack(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Obsidian Skill Pack — ${id.name}`);
  lines.push("");
  lines.push(`> Vault workflows, templates, and prompt snippets for a ${id.type.replace(/_/g, " ")} project`);
  lines.push("");

  // Daily Note Template
  lines.push("## Daily Note Template");
  lines.push("");
  lines.push("```markdown");
  lines.push("# {{date:YYYY-MM-DD}} — Dev Log");
  lines.push("");
  lines.push("## Focus");
  lines.push("- [ ] Primary task:");
  lines.push("- [ ] Secondary task:");
  lines.push("");
  lines.push("## Decisions");
  lines.push("- ");
  lines.push("");
  lines.push("## Blockers");
  lines.push("- ");
  lines.push("");
  lines.push("## Notes");
  lines.push("- ");
  lines.push("");
  lines.push(`## ${id.name} Changes`);
  lines.push("- Files modified:");
  lines.push("- Tests added/changed:");
  lines.push("- Commit:");
  lines.push("```");
  lines.push("");

  // Architecture Decision Record Template
  lines.push("## ADR Template");
  lines.push("");
  lines.push("```markdown");
  lines.push("# ADR-NNN: [Title]");
  lines.push("");
  lines.push("## Status");
  lines.push("[Proposed | Accepted | Deprecated | Superseded]");
  lines.push("");
  lines.push("## Context");
  lines.push("[What is the issue that we're seeing that is motivating this decision?]");
  lines.push("");
  lines.push("## Decision");
  lines.push("[What is the change that we're proposing and/or doing?]");
  lines.push("");
  lines.push("## Consequences");
  lines.push("[What becomes easier or harder as a result?]");
  lines.push("");
  lines.push("## References");
  lines.push(`- Project: [[${id.name}]]`);
  lines.push("- Related ADRs:");
  lines.push("```");
  lines.push("");

  // Prompt Snippets
  lines.push("## Prompt Snippets");
  lines.push("");
  lines.push("Reusable AI prompt fragments for this project context:");
  lines.push("");

  lines.push("### Project Context Preamble");
  lines.push("```");
  lines.push(`I'm working on ${id.name}, a ${id.type.replace(/_/g, " ")} built with ${id.primary_language}.`);
  if (frameworks.length > 0) {
    lines.push(`Stack: ${frameworks.join(", ")}.`);
  }
  const conventions = ctx.ai_context.conventions;
  if (conventions.length > 0) {
    lines.push(`Conventions: ${conventions.slice(0, 3).join("; ")}.`);
  }
  lines.push("```");
  lines.push("");

  lines.push("### Code Review Prompt");
  lines.push("```");
  lines.push("Review this code change for:");
  lines.push("1. Correctness — does it do what it claims?");
  lines.push("2. Edge cases — what inputs would break it?");
  lines.push("3. Conventions — does it match the project style?");
  lines.push("4. Tests — what test cases are missing?");
  lines.push("```");
  lines.push("");

  lines.push("### Bug Investigation Prompt");
  lines.push("```");
  lines.push(`In ${id.name} (${id.primary_language}), I'm seeing [describe bug].`);
  lines.push("Steps to reproduce: [steps]");
  lines.push("Expected: [expected behavior]");
  lines.push("Actual: [actual behavior]");
  lines.push("Help me trace this from the entry point to the failure.");
  lines.push("```");
  lines.push("");

  // Vault Structure Recommendation
  lines.push("## Recommended Vault Structure");
  lines.push("");
  lines.push("```");
  lines.push(`vault/`);
  lines.push(`├── Projects/`);
  lines.push(`│   └── ${id.name}/`);
  lines.push(`│       ├── Overview.md`);
  lines.push(`│       ├── Architecture.md`);
  lines.push(`│       ├── ADRs/`);
  lines.push(`│       ├── Meeting Notes/`);
  lines.push(`│       └── Retrospectives/`);
  lines.push(`├── Daily Notes/`);
  lines.push(`├── Templates/`);
  lines.push(`│   ├── Daily Note.md`);
  lines.push(`│   ├── ADR.md`);
  lines.push(`│   └── Bug Report.md`);
  lines.push(`├── Prompts/`);
  lines.push(`│   ├── Context Preamble.md`);
  lines.push(`│   ├── Code Review.md`);
  lines.push(`│   └── Bug Investigation.md`);
  lines.push(`└── References/`);
  lines.push("```");
  lines.push("");

  return {
    path: "obsidian-skill-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Vault templates, prompt snippets, and structure recommendations for Obsidian",
  };
}

// ─── vault-rules.md ─────────────────────────────────────────────

export function generateVaultRules(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Vault Rules — ${id.name}`);
  lines.push("");
  lines.push("> Governance rules for maintaining a clean, linked knowledge vault");
  lines.push("");

  // Naming Conventions
  lines.push("## Naming Conventions");
  lines.push("");
  lines.push("| Element | Convention | Example |");
  lines.push("|---------|-----------|---------|");
  lines.push("| Notes | Title Case, descriptive | `API Authentication Design.md` |");
  lines.push("| Daily notes | ISO date | `2026-04-03.md` |");
  lines.push("| ADRs | Numbered prefix | `ADR-001 Database Choice.md` |");
  lines.push("| Templates | Prefixed | `Template - Daily Note.md` |");
  lines.push("| Tags | lowercase, hyphenated | `#code-review`, `#architecture` |");
  lines.push("| Folders | PascalCase | `MeetingNotes/`, `ADRs/` |");
  lines.push("");

  // Tagging System
  lines.push("## Tagging System");
  lines.push("");
  lines.push("### Required Tags");
  lines.push("");
  lines.push("Every note must have at least one of:");
  lines.push("");
  lines.push("| Tag | When to Use |");
  lines.push("|-----|-----------|");
  lines.push(`| \`#project/${id.name.toLowerCase().replace(/\s+/g, "-")}\` | Anything related to this project |`);
  lines.push("| `#decision` | Architecture or design decisions |");
  lines.push("| `#bug` | Bug reports and investigations |");
  lines.push("| `#feature` | Feature specifications |");
  lines.push("| `#meeting` | Meeting notes |");
  lines.push("| `#retrospective` | Retrospective notes |");
  lines.push("| `#reference` | External references and resources |");
  lines.push("| `#prompt` | AI prompt templates |");
  lines.push("");

  // Linking Rules
  lines.push("## Linking Rules");
  lines.push("");
  lines.push("1. **Always link to the project note** — Every project-related note must include `[[" + id.name + "]]`");
  lines.push("2. **Link decisions to context** — ADRs must link to the notes that prompted them");
  lines.push("3. **Link bugs to code areas** — Bug notes should reference the affected module or file");
  lines.push("4. **Cross-link related notes** — If two notes discuss the same topic, link them");
  lines.push("5. **Use aliases for common references** — Add YAML frontmatter aliases for frequently linked notes");
  lines.push("");

  // Frontmatter Standard
  lines.push("## Frontmatter Standard");
  lines.push("");
  lines.push("All notes should include YAML frontmatter:");
  lines.push("");
  lines.push("```yaml");
  lines.push("---");
  lines.push("created: {{date:YYYY-MM-DD}}");
  lines.push("updated: {{date:YYYY-MM-DD}}");
  lines.push("tags:");
  lines.push(`  - project/${id.name.toLowerCase().replace(/\s+/g, "-")}`);
  lines.push("  - [additional tags]");
  lines.push("status: [draft | active | archived]");
  lines.push("---");
  lines.push("```");
  lines.push("");

  // Maintenance Rules
  lines.push("## Maintenance Rules");
  lines.push("");
  lines.push("- **Weekly**: Review orphan notes (no incoming links) — link or archive them");
  lines.push("- **Weekly**: Review `#draft` notes — promote or delete");
  lines.push("- **Monthly**: Archive stale notes older than 90 days with no updates");
  lines.push("- **Monthly**: Review tag usage — merge redundant tags");
  lines.push("- **Per session**: Update daily note with changes made");
  lines.push("");

  return {
    path: "vault-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Governance rules for vault naming, tagging, linking, and maintenance",
  };
}

// ─── graph-prompt-map.json ──────────────────────────────────────

export function generateGraphPromptMap(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const abstractions = ctx.ai_context.key_abstractions;

  const nodes: Array<{ id: string; type: string; label: string; note_path: string }> = [];
  const edges: Array<{ from: string; to: string; relationship: string }> = [];

  // Project node
  nodes.push({
    id: "project",
    type: "project",
    label: id.name,
    note_path: `Projects/${id.name}/Overview.md`,
  });

  // Architecture node
  nodes.push({
    id: "architecture",
    type: "concept",
    label: "Architecture",
    note_path: `Projects/${id.name}/Architecture.md`,
  });
  edges.push({ from: "project", to: "architecture", relationship: "has_architecture" });

  // Framework nodes
  for (let i = 0; i < frameworks.length; i++) {
    const fwId = `fw_${i}`;
    nodes.push({
      id: fwId,
      type: "technology",
      label: frameworks[i],
      note_path: `References/${frameworks[i]}.md`,
    });
    edges.push({ from: "project", to: fwId, relationship: "uses_technology" });
  }

  // Abstraction nodes
  for (let i = 0; i < abstractions.length; i++) {
    const aId = `abs_${i}`;
    nodes.push({
      id: aId,
      type: "concept",
      label: abstractions[i],
      note_path: `Projects/${id.name}/Concepts/${abstractions[i].replace(/\s+/g, "-")}.md`,
    });
    edges.push({ from: "architecture", to: aId, relationship: "contains_concept" });
  }

  // Entry point nodes
  for (let i = 0; i < ctx.entry_points.length; i++) {
    const epId = `ep_${i}`;
    nodes.push({
      id: epId,
      type: "entry_point",
      label: ctx.entry_points[i].path,
      note_path: `Projects/${id.name}/EntryPoints/${ctx.entry_points[i].path.replace(/\//g, "-")}.md`,
    });
    edges.push({ from: "architecture", to: epId, relationship: "has_entry_point" });
  }

  // Prompt template nodes
  const promptNodes = [
    { id: "prompt_context", label: "Context Preamble", path: "Prompts/Context Preamble.md" },
    { id: "prompt_review", label: "Code Review", path: "Prompts/Code Review.md" },
    { id: "prompt_debug", label: "Bug Investigation", path: "Prompts/Bug Investigation.md" },
  ];
  for (const p of promptNodes) {
    nodes.push({ id: p.id, type: "prompt", label: p.label, note_path: p.path });
    edges.push({ from: "project", to: p.id, relationship: "has_prompt" });
  }

  const graphMap = {
    project: id.name,
    generated_at: new Date().toISOString(),
    total_nodes: nodes.length,
    total_edges: edges.length,
    nodes,
    edges,
  };

  return {
    path: "graph-prompt-map.json",
    content: JSON.stringify(graphMap, null, 2),
    content_type: "application/json",
    program: "obsidian",
    description: "Knowledge graph structure mapping vault nodes, edges, and prompt relationships",
  };
}

// ─── linking-policy.md ──────────────────────────────────────────

export function generateLinkingPolicy(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const lines: string[] = [];

  lines.push(`# Linking Policy — ${id.name}`);
  lines.push("");
  lines.push("> Rules for how notes should be interconnected in the knowledge graph");
  lines.push("");

  // Link Types
  lines.push("## Link Types");
  lines.push("");
  lines.push("| Link Type | Syntax | When to Use |");
  lines.push("|----------|--------|-------------|");
  lines.push("| Direct link | `[[Note Name]]` | Referencing a specific note |");
  lines.push("| Aliased link | `[[Note Name\\|display text]]` | When note name is long or context differs |");
  lines.push("| Header link | `[[Note Name#Section]]` | Linking to a specific section |");
  lines.push("| Embedded | `![[Note Name]]` | Including note content inline |");
  lines.push("| External | `[text](url)` | Linking to external resources |");
  lines.push("");

  // Mandatory Links
  lines.push("## Mandatory Links");
  lines.push("");
  lines.push("These links are required to maintain graph integrity:");
  lines.push("");
  lines.push(`1. Every code note → \`[[${id.name}]]\` (project hub)`);
  lines.push("2. Every ADR → the triggering note or issue");
  lines.push("3. Every daily note → notes created or modified that day");
  lines.push("4. Every bug report → the affected module or file note");
  lines.push("5. Every meeting note → action items as linked notes");
  lines.push("");

  // Hub Notes
  lines.push("## Hub Notes");
  lines.push("");
  lines.push("Maintain these high-connectivity notes as navigation anchors:");
  lines.push("");
  lines.push(`| Hub | Purpose | Minimum Links |`);
  lines.push(`|-----|---------|--------------|`);
  lines.push(`| \`[[${id.name}]]\` | Project overview | 10+ |`);
  lines.push(`| \`[[Architecture]]\` | System design | 5+ |`);
  lines.push(`| \`[[ADR Index]]\` | Decision log | All ADRs |`);
  lines.push(`| \`[[Tech Stack]]\` | Technology choices | All framework notes |`);
  lines.push("");

  // Code-to-Vault Mapping
  lines.push("## Code-to-Vault Mapping");
  lines.push("");
  lines.push("Map high-importance code files to vault notes for traceability:");
  lines.push("");

  if (hotspots.length > 0) {
    lines.push("| Code File | Risk | Vault Note |");
    lines.push("|-----------|------|-----------|");
    for (const h of hotspots.slice(0, 8)) {
      const noteName = h.path.replace(/\//g, "-").replace(/\.[^.]+$/, "");
      lines.push(`| \`${h.path}\` | ${h.risk_score.toFixed(1)} | \`[[Code/${noteName}]]\` |`);
    }
    lines.push("");
  }

  // Anti-Patterns
  lines.push("## Anti-Patterns");
  lines.push("");
  lines.push("Avoid these linking mistakes:");
  lines.push("");
  lines.push("- **Orphan notes** — Notes with zero incoming links are invisible in the graph");
  lines.push("- **Over-linking** — Don't link every word; link concepts, decisions, and references");
  lines.push("- **Dead links** — Regularly check for `[[broken links]]` and fix or create them");
  lines.push("- **Circular-only links** — Two notes linking only to each other with no broader connections");
  lines.push("- **Flat structure** — Relying only on folders instead of links for organization");
  lines.push("");

  // Graph Health Metrics
  lines.push("## Graph Health Metrics");
  lines.push("");
  lines.push("Track these metrics to ensure vault health:");
  lines.push("");
  lines.push("| Metric | Target | Check Frequency |");
  lines.push("|--------|--------|----------------|");
  lines.push("| Orphan notes | < 10% of total | Weekly |");
  lines.push("| Average links per note | > 3 | Monthly |");
  lines.push("| Hub note connectivity | > 10 links | Monthly |");
  lines.push("| Dead links | 0 | Weekly |");
  lines.push("| Notes without tags | 0 | Weekly |");
  lines.push("");

  return {
    path: "linking-policy.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Linking rules, hub notes, code-to-vault mapping, and graph health metrics",
  };
}
