import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { findFiles, findEntryPoints, findConfigs, extractExports } from "./file-excerpt-utils.js";
import { mdText, mdInline, mdCode, mdCellCode, mdBlock, wikiLink, yamlFlowScalar } from "./md-sanitize.js";

/**
 * Canonical vault note BASENAME for a source-code file — ONE derivation shared by
 * every generator so the same file has a single note identity across all outputs.
 * KEEPS the extension (flattened to a dash) so `main.ts` and `main.tsx` are
 * DISTINCT notes (stripping it collapsed them to one node — data loss), and
 * flattens path separators + wikilink-special chars so the basename is a valid,
 * collision-free `[[link]]` target.
 */
export function codeFileNote(path: string): string {
  return wikiLink(path.replace(/[/\\.]+/g, "-"));
}

// ─── obsidian-skill-pack.md ─────────────────────────────────────

export function generateObsidianSkillPack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Obsidian Skill Pack — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Vault workflows, templates, and prompt snippets for a ${mdText(id.type.replace(/_/g, " "))} project`);
  lines.push("");

  // Project Overview
  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(mdBlock(ctx.ai_context.project_summary));
    lines.push("");
  }

  // Detected Stack
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${fw.version ? mdInline(fw.version) : "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

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
  lines.push(`## ${mdCode(id.name)} Changes`);
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
  lines.push(`- Project: [[${wikiLink(id.name)}]]`);
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
  lines.push(`I'm working on ${mdCode(id.name)}, a ${mdCode(id.type.replace(/_/g, " "))} built with ${mdCode(id.primary_language)}.`);
  if (frameworks.length > 0) {
    lines.push(`Stack: ${mdCode(frameworks.join(", "))}.`);
  }
  const conventions = ctx.ai_context.conventions;
  if (conventions.length > 0) {
    lines.push(`Conventions: ${mdCode(conventions.slice(0, 3).join("; "))}.`);
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
  lines.push(`In ${mdCode(id.name)} (${mdCode(id.primary_language)}), I'm seeing [describe bug].`);
  lines.push("Steps to reproduce: [steps]");
  lines.push("Expected: [expected behavior]");
  lines.push("Actual: [actual behavior]");
  lines.push("Help me trace this from the entry point to the failure.");
  lines.push("```");
  lines.push("");

  // Domain model quick-reference prompts
  const domainModels = ctx.domain_models;
  if (domainModels.length > 0) {
    lines.push("### Domain Model Prompt");
    lines.push("```");
    lines.push(`I'm working with the following domain models in ${mdCode(id.name)}:`);
    for (const m of domainModels.slice(0, 8)) {
      lines.push(`- ${mdCode(m.name)} (${mdCode(m.kind)}, ${m.field_count} fields) — defined in ${mdCode(m.source_file)}`);
    }
    if (domainModels.length > 8) lines.push(`  ... and ${domainModels.length - 8} more`);
    lines.push("");
    lines.push("When generating code that uses these types, import from their source files and");
    lines.push("do not redefine them.");
    lines.push("```");
    lines.push("");
  }

  // Vault Structure Recommendation
  lines.push("## Recommended Vault Structure");
  lines.push("");
  lines.push("```");
  lines.push(`vault/`);
  lines.push(`├── Projects/`);
  lines.push(`│   └── ${mdCode(id.name)}/`);
  lines.push(`│       ├── ${wikiLink(id.name)}.md    ← project hub (the [[${wikiLink(id.name)}]] note)`);
  lines.push(`│       ├── Architecture.md`);
  lines.push(`│       ├── Code/             ← one note per hotspot/entry-point file`);
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

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push("## Detected Config Files for Vault Import");
      lines.push("");
      for (const c of configs.slice(0, 6)) {
        lines.push(`- \`${mdCode(c.path)}\``);
      }
      if (configs.length > 6) lines.push(`- … and ${configs.length - 6} more`);
      lines.push("");
    }
  }

  return {
    path: "obsidian-skill-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Vault templates, prompt snippets, and structure recommendations for Obsidian",
  };
}

// ─── vault-rules.md ─────────────────────────────────────────────

export function generateVaultRules(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Vault Rules — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Governance rules for maintaining a clean, linked knowledge vault");
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(mdBlock(ctx.ai_context.project_summary));
    lines.push("");
  }

  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${fw.version ? mdInline(fw.version) : "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

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
  lines.push(`| \`#project/${id.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\` | Anything related to this project |`);
  lines.push("| `#decision` | Architecture or design decisions |");
  lines.push("| `#bug` | Bug reports and investigations |");
  lines.push("| `#feature` | Feature specifications |");
  lines.push("| `#meeting` | Meeting notes |");
  lines.push("| `#retrospective` | Retrospective notes |");
  lines.push("| `#reference` | External references and resources |");
  lines.push("| `#prompt` | AI prompt templates |");
  lines.push("");

  // Stack-specific tags grounded in what THIS repo actually contains, so the tag
  // vocabulary matches the codebase instead of a generic template.
  const stackTags: string[] = [];
  for (const fw of ctx.detection.frameworks) {
    stackTags.push(`| \`#${fw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\` | Notes about ${mdInline(fw.name)}${fw.version ? ` (v${mdInline(fw.version)})` : ""} code |`);
  }
  if (ctx.routes.length > 0) stackTags.push(`| \`#api-endpoint\` | Route/endpoint notes (${ctx.routes.length} detected) |`);
  if (ctx.sql_schema.length > 0) stackTags.push(`| \`#database-schema\` | Schema notes (${ctx.sql_schema.length} table${ctx.sql_schema.length === 1 ? "" : "s"} detected) |`);
  if (ctx.domain_models.length > 0) stackTags.push(`| \`#domain-model\` | Domain model notes (${ctx.domain_models.length} detected) |`);
  if (stackTags.length > 0) {
    lines.push("### Stack-Specific Tags");
    lines.push("");
    lines.push("Tags matched to this codebase's detected stack:");
    lines.push("");
    lines.push("| Tag | When to Use |");
    lines.push("|-----|-----------|");
    lines.push(...stackTags);
    lines.push("");
  }

  // Linking Rules
  lines.push("## Linking Rules");
  lines.push("");
  lines.push("1. **Always link to the project note** — Every project-related note must include `[[" + wikiLink(id.name) + "]]`");
  lines.push("2. **Link decisions to context** — ADRs must link to the notes that prompted them");
  lines.push("3. **Link bugs to code areas** — Bug notes should reference the affected module or file");
  lines.push("4. **Cross-link related notes** — If two notes discuss the same topic, link them");
  lines.push("5. **Use aliases for common references** — Add YAML frontmatter aliases for frequently linked notes");
  if (ctx.entry_points.length > 0) {
    const eps = ctx.entry_points.slice(0, 3).map((e) => `\`${mdCode(e.path)}\``).join(", ");
    lines.push(`6. **Anchor to real entry points** — Link code and bug notes to this repo's entry points (${eps}) so navigation starts from actual code`);
  }
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
  lines.push(`  - project/${id.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
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

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const mdFiles = findFiles(files, ["**/*.md"]);
    if (mdFiles.length > 0) {
      lines.push("## Existing Markdown Files");
      lines.push("");
      lines.push(`Found ${mdFiles.length} markdown files in the project — candidates for vault import.`);
      lines.push("");
    }
  }

  return {
    path: "vault-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Governance rules for vault naming, tagging, linking, and maintenance",
  };
}

// ─── graph-prompt-map.json ──────────────────────────────────────

export function generateGraphPromptMap(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const abstractions = ctx.ai_context.key_abstractions;

  // Cap nodes per type so the vault graph stays usable — a repo with hundreds of
  // domain models otherwise produces a multi-MB graph-prompt-map.json. Counts and
  // a `truncated` field below stay honest about what was elided.
  const MAX_NODES = { abstractions: 30, entry_points: 40, domain_models: 60, sql_schema: 40 };
  const nEntries = Math.min(ctx.entry_points.length, MAX_NODES.entry_points);
  const nModels = Math.min(ctx.domain_models.length, MAX_NODES.domain_models);
  // Disambiguate note paths for same-named models (two `NotConfiguredResult`
  // interfaces would otherwise collide onto one vault note).
  const modelNoteNames = (() => {
    const seen = new Map<string, number>();
    return ctx.domain_models.map(m => {
      // Key on lowercase so `Foo` and `foo` also collide (a case-insensitive vault
      // filesystem would overwrite one otherwise) and both get a -N suffix.
      const key = m.name.toLowerCase();
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n === 1 ? m.name : `${m.name}-${n}`;
    });
  })();

  // Path-safe project folder — id.name is untrusted; a `/` in it would otherwise
  // create bogus subfolders in every note_path below.
  const projFolder = wikiLink(id.name);
  const nodes: Array<{ id: string; type: string; label: string; note_path: string }> = [];
  const edges: Array<{ from: string; to: string; relationship: string }> = [];

  // Project node
  nodes.push({
    id: "project",
    type: "project",
    label: id.name,
    note_path: `Projects/${projFolder}/${projFolder}.md`,
  });

  // Architecture node
  nodes.push({
    id: "architecture",
    type: "concept",
    label: "Architecture",
    note_path: `Projects/${projFolder}/Architecture.md`,
  });
  edges.push({ from: "project", to: "architecture", relationship: "has_architecture" });

  // Framework nodes
  for (let i = 0; i < frameworks.length; i++) {
    const fwId = `fw_${i}`;
    nodes.push({
      id: fwId,
      type: "technology",
      label: frameworks[i],
      note_path: `References/${wikiLink(frameworks[i])}.md`,
    });
    edges.push({ from: "project", to: fwId, relationship: "uses_technology" });
  }

  // Abstraction nodes
  for (let i = 0; i < Math.min(abstractions.length, MAX_NODES.abstractions); i++) {
    const aId = `abs_${i}`;
    nodes.push({
      id: aId,
      type: "concept",
      label: abstractions[i],
      // wikiLink (not just whitespace→dash): key_abstractions are `dir/ (purpose)`,
      // so they contain `/` and `()` that would spawn bogus subfolders + break the note.
      note_path: `Projects/${projFolder}/Concepts/${wikiLink(abstractions[i])}.md`,
    });
    edges.push({ from: "architecture", to: aId, relationship: "contains_concept" });
  }

  // Entry point nodes
  for (let i = 0; i < nEntries; i++) {
    const epId = `ep_${i}`;
    nodes.push({
      id: epId,
      type: "entry_point",
      label: ctx.entry_points[i].path,
      note_path: `Projects/${projFolder}/Code/${codeFileNote(ctx.entry_points[i].path)}.md`,
    });
    edges.push({ from: "architecture", to: epId, relationship: "has_entry_point" });
  }

  // Code nodes for dependency hotspots too — linking-policy.md links these
  // (`[[Projects/<proj>/Code/…]]`), so the graph must declare them or those links
  // are dead. Same first-8 selection as linking-policy; dedup against entry points.
  const codeNoteSeen = new Set<string>();
  for (let i = 0; i < nEntries; i++) codeNoteSeen.add(codeFileNote(ctx.entry_points[i].path));
  const hotspotNodes = ctx.dependency_graph.hotspots.slice(0, 8);
  for (let i = 0; i < hotspotNodes.length; i++) {
    const note = codeFileNote(hotspotNodes[i].path);
    if (codeNoteSeen.has(note)) continue;
    codeNoteSeen.add(note);
    const hId = `hotspot_${i}`;
    nodes.push({ id: hId, type: "code", label: hotspotNodes[i].path, note_path: `Projects/${projFolder}/Code/${note}.md` });
    edges.push({ from: "architecture", to: hId, relationship: "high_coupling" });
  }

  // Domain model nodes
  for (let i = 0; i < nModels; i++) {
    const dm = ctx.domain_models[i];
    const dmId = `model_${i}`;
    nodes.push({
      id: dmId,
      type: "domain_model",
      label: dm.name,
      note_path: `Projects/${projFolder}/Models/${wikiLink(modelNoteNames[i])}.md`,
    });
    edges.push({ from: "architecture", to: dmId, relationship: "has_model" });
    // Link model to its source entry point if one exists
    const epIdx = ctx.entry_points.findIndex(ep => ep.path === dm.source_file);
    if (epIdx !== -1 && epIdx < nEntries) {
      edges.push({ from: `ep_${epIdx}`, to: dmId, relationship: "defines_model" });
    }
  }

  // SQL table nodes
  for (let i = 0; i < Math.min(ctx.sql_schema.length, MAX_NODES.sql_schema); i++) {
    const tbl = ctx.sql_schema[i];
    const tblId = `table_${i}`;
    nodes.push({
      id: tblId,
      type: "database_table",
      label: tbl.name,
      note_path: `Projects/${projFolder}/Database/${wikiLink(tbl.name)}.md`,
    });
    edges.push({ from: "architecture", to: tblId, relationship: "has_table" });
    // Cross-link table to matching domain model by name similarity
    /* v8 ignore next 2 */
    const matchingModelIdx = ctx.domain_models.findIndex(
      m => m.name.toLowerCase() === tbl.name.toLowerCase() ||
           m.name.toLowerCase() === tbl.name.replace(/_/g, "").toLowerCase()
    );
    if (matchingModelIdx !== -1 && matchingModelIdx < nModels) {
      edges.push({ from: `model_${matchingModelIdx}`, to: tblId, relationship: "maps_to_table" });
    }
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
    generated_at: ctx.generated_at,
    project_summary: ctx.ai_context.project_summary || null,
    detected_stack: ctx.detection.frameworks.map(fw => ({
      name: fw.name,
      version: fw.version ?? null,
      confidence: fw.confidence,
    })),
    total_nodes: nodes.length,
    total_edges: edges.length,
    truncated: {
      ...(ctx.domain_models.length > MAX_NODES.domain_models ? { domain_models: { shown: MAX_NODES.domain_models, total: ctx.domain_models.length } } : {}),
      ...(ctx.entry_points.length > MAX_NODES.entry_points ? { entry_points: { shown: MAX_NODES.entry_points, total: ctx.entry_points.length } } : {}),
      ...(ctx.sql_schema.length > MAX_NODES.sql_schema ? { sql_schema: { shown: MAX_NODES.sql_schema, total: ctx.sql_schema.length } } : {}),
      ...(abstractions.length > MAX_NODES.abstractions ? { abstractions: { shown: MAX_NODES.abstractions, total: abstractions.length } } : {}),
    },
    nodes,
    edges,
    // ─── Source File Analysis ──────────────────────────────────
    source_file_count: files ? files.length : null,
    source_entry_points: files && files.length > 0 ? findEntryPoints(files).slice(0, 6).map(f => ({
      path: f.path,
      exports: extractExports(f.content),
    })) : null,
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

export function generateLinkingPolicy(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const lines: string[] = [];

  lines.push(`# Linking Policy — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Rules for how notes should be interconnected in the knowledge graph");
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(mdBlock(ctx.ai_context.project_summary));
    lines.push("");
  }

  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${fw.version ? mdInline(fw.version) : "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

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
  lines.push(`1. Every code note → \`[[${wikiLink(id.name)}]]\` (project hub)`);
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
  lines.push(`| \`[[${wikiLink(id.name)}]]\` | Project overview | 10+ |`);
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
    // Link to the SAME folder the graph declares code notes in
    // (Projects/<proj>/Code/…), not a vault-root Code/ — the two artifacts pointed
    // at different folders. The graph now also emits a code node per hotspot, so
    // these links resolve.
    const projFolder = wikiLink(id.name);
    for (const h of hotspots.slice(0, 8)) {
      const noteName = codeFileNote(h.path);
      lines.push(`| \`${mdCellCode(h.path)}\` | ${h.risk_score.toFixed(1)} | \`[[Projects/${projFolder}/Code/${noteName}]]\` |`);
    }
    if (hotspots.length > 8) lines.push(`| … | | +${hotspots.length - 8} more |`);
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

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Source Entry Points as Hub Note Candidates");
      lines.push("");
      for (const ep of entries.slice(0, 5)) {
        const exports = extractExports(ep.content);
        lines.push(`- \`${mdCode(ep.path)}\` → exports: ${mdText(exports.join(", ") || "default")}`);
      }
      lines.push("");
    }
  }

  return {
    path: "linking-policy.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Linking rules, hub notes, code-to-vault mapping, and graph health metrics",
  };
}

// ─── template-pack.md ───────────────────────────────────────────

export function generateTemplatePack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const abstractions = ctx.ai_context.key_abstractions;

  const lines: string[] = [];
  lines.push(`# Template Pack — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${mdText(ctx.generated_at)}`);
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(mdBlock(ctx.ai_context.project_summary));
    lines.push("");
  }

  if (frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${fw.version ? mdInline(fw.version) : "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  lines.push("Obsidian note templates for consistent knowledge capture.");
  lines.push("");

  lines.push("## Template: Decision Record");
  lines.push("");
  lines.push("```markdown");
  lines.push("---");
  lines.push("type: decision");
  lines.push(`project: ${yamlFlowScalar(id.name)}`);
  lines.push("date: {{date}}");
  lines.push("status: proposed | accepted | deprecated");
  lines.push("---");
  lines.push("# Decision: {{title}}");
  lines.push("");
  lines.push("## Context");
  lines.push("What is the issue we're deciding on?");
  lines.push("");
  lines.push("## Options Considered");
  lines.push("1. Option A — description, pros, cons");
  lines.push("2. Option B — description, pros, cons");
  lines.push("");
  lines.push("## Decision");
  lines.push("What we decided and why.");
  lines.push("");
  lines.push("## Consequences");
  lines.push("What changes as a result of this decision.");
  lines.push("");
  lines.push("## Related");
  lines.push("- [[architecture-summary]]");
  lines.push("- [[]]");
  lines.push("```");
  lines.push("");

  lines.push("## Template: Meeting Notes");
  lines.push("");
  lines.push("```markdown");
  lines.push("---");
  lines.push("type: meeting");
  lines.push(`project: ${yamlFlowScalar(id.name)}`);
  lines.push("date: {{date}}");
  lines.push("attendees: ");
  lines.push("---");
  lines.push("# Meeting: {{title}}");
  lines.push("");
  lines.push("## Agenda");
  lines.push("- ");
  lines.push("");
  lines.push("## Notes");
  lines.push("- ");
  lines.push("");
  lines.push("## Action Items");
  lines.push("- [ ] Item — @owner — due: ");
  lines.push("");
  lines.push("## Decisions Made");
  lines.push("- See [[decision-record-{{date}}]]");
  lines.push("```");
  lines.push("");

  lines.push("## Template: Bug Investigation");
  lines.push("");
  lines.push("```markdown");
  lines.push("---");
  lines.push("type: investigation");
  lines.push(`project: ${yamlFlowScalar(id.name)}`);
  lines.push("date: {{date}}");
  lines.push("severity: low | medium | high | critical");
  lines.push("status: investigating | root-caused | resolved");
  lines.push("---");
  lines.push("# Bug: {{title}}");
  lines.push("");
  lines.push("## Symptoms");
  lines.push("What was observed?");
  lines.push("");
  lines.push("## Reproduction Steps");
  lines.push("1. ");
  lines.push("");
  lines.push("## Root Cause");
  lines.push("See [[root-cause-checklist]] for systematic analysis.");
  lines.push("");
  lines.push("## Fix");
  lines.push("What was changed and why.");
  lines.push("");
  lines.push("## Prevention");
  lines.push("- [ ] Regression test added");
  lines.push("- [ ] Monitoring updated");
  lines.push("```");
  lines.push("");

  lines.push("## Template: Technical Concept");
  lines.push("");
  lines.push("```markdown");
  lines.push("---");
  lines.push("type: concept");
  lines.push(`project: ${yamlFlowScalar(id.name)}`);
  // Slugify abstractions to VALID Obsidian tags — they're directory descriptors
  // like "apps/ (monorepo_apps)"; spaces/parens/slashes aren't allowed in a tag
  // (`/` means nesting), so the raw value produced unusable tags. Drop empties.
  const abstractionTags = abstractions.slice(0, 3)
    .map(a => a.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  lines.push(`tags: [${abstractionTags.map(t => JSON.stringify(t)).join(", ")}]`);
  lines.push("---");
  lines.push("# {{title}}");
  lines.push("");
  lines.push("## Definition");
  lines.push("One-paragraph explanation of this concept.");
  lines.push("");
  lines.push("## In This Project");
  lines.push("How this concept applies specifically to " + mdCode(id.name) + ".");
  lines.push("");
  lines.push("## Related Concepts");
  lines.push("- [[]]");
  lines.push("");
  lines.push("## Code References");
  lines.push("- `path/to/file.ts` — description");
  lines.push("```");
  lines.push("");

  lines.push("## Template: Sprint Retrospective");
  lines.push("");
  lines.push("```markdown");
  lines.push("---");
  lines.push("type: retrospective");
  lines.push(`project: ${yamlFlowScalar(id.name)}`);
  lines.push("date: {{date}}");
  lines.push("sprint: ");
  lines.push("---");
  lines.push("# Retro: Sprint {{sprint}}");
  lines.push("");
  lines.push("## What Went Well");
  lines.push("- ");
  lines.push("");
  lines.push("## What Could Improve");
  lines.push("- ");
  lines.push("");
  lines.push("## Action Items");
  lines.push("- [ ] ");
  lines.push("");
  lines.push("## Metrics");
  lines.push("| Metric | Target | Actual |");
  lines.push("|--------|--------|--------|");
  lines.push("| Velocity | | |");
  lines.push("| Bugs Fixed | | |");
  lines.push("| Tests Added | | |");
  lines.push("```");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    lines.push("## Source File Summary");
    lines.push("");
    lines.push(`Total source files: ${files.length}`);
    const configs = findConfigs(files);
    if (configs.length > 0) {
      lines.push(`Config files: ${mdText(configs.map(c => c.path).join(", "))}`);
    }
    lines.push("");
  }

  return {
    path: "template-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "obsidian",
    description: "Obsidian note templates for decisions, meetings, bugs, concepts, and retrospectives",
  };
}
