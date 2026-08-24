import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw } from "./fw-helpers.js";
import { findFiles, findFile, findConfigs } from "./file-excerpt-utils.js";
import { mdText, mdInline, mdCode, mdCellCode, mdBlock, yamlFlowScalar } from "./md-sanitize.js";
import { displayRoutes } from "./route-utils.js";

// ─── brand-guidelines.md ────────────────────────────────────────

export function generateBrandGuidelines(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Brand Guidelines — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Brand identity and communication standards for ${mdText(id.name)}`);
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

  // Brand Identity
  lines.push("## Brand Identity");
  lines.push("");
  lines.push(`**Product Name:** ${mdText(id.name)}`);
  lines.push(`**Category:** ${mdText(id.type.replace(/_/g, " "))}`);
  lines.push(`**Primary Technology:** ${mdText(id.primary_language)}`);
  if (id.description) {
    lines.push(`**Description:** ${mdText(id.description)}`);
  }
  lines.push("");

  // Positioning
  lines.push("## Positioning");
  lines.push("");
  const isWebApp = id.type.includes("web") || id.type.includes("application");
  const isCli = id.type.includes("cli") || id.type.includes("tool");
  const isLibrary = id.type.includes("library") || id.type.includes("package");
  if (isWebApp) {
    lines.push(`${mdBlock(id.name)} is a web application that delivers value through its user interface and API surface.`);
    lines.push("");
    lines.push("**Target Audience:** Developers, technical teams, and end users who interact with the web interface.");
  } else if (isCli) {
    lines.push(`${mdBlock(id.name)} is a command-line tool built for developer productivity.`);
    lines.push("");
    lines.push("**Target Audience:** Developers and DevOps engineers working in terminal environments.");
  } else if (isLibrary) {
    lines.push(`${mdBlock(id.name)} is a library/package consumed by other software projects.`);
    lines.push("");
    lines.push("**Target Audience:** Developers integrating this library into their applications.");
  } else {
    lines.push(`${mdBlock(id.name)} is a ${mdText(id.type.replace(/_/g, " "))} built with ${mdText(id.primary_language)}.`);
    lines.push("");
    lines.push("**Target Audience:** Technical users and developers.");
  }
  lines.push("");

  // Voice Attributes
  lines.push("## Voice Attributes");
  lines.push("");
  lines.push("| Attribute | Description | Do | Don't |");
  lines.push("|-----------|-------------|-----|-------|");
  lines.push("| Clear | Say exactly what you mean | Use plain language | Use jargon without context |");
  lines.push("| Confident | State facts directly | \"This does X\" | \"This might help with X\" |");
  lines.push("| Helpful | Anticipate the next question | Provide examples | Leave the user guessing |");
  lines.push("| Technical | Respect the audience's skill | Use correct terminology | Over-simplify for experts |");
  lines.push("| Concise | Respect the reader's time | Get to the point | Add filler paragraphs |");
  lines.push("");

  // Communication Standards per channel
  lines.push("## Communication Standards");
  lines.push("");
  lines.push("### Documentation");
  lines.push("");
  lines.push("- Lead with what the user can do, not how the code works internally");
  lines.push("- Every page should have a clear \"what\", \"why\", and \"how\" structure");
  lines.push("- Code examples must be copy-paste ready and tested");
  lines.push("- Use imperative mood for instructions: \"Run the command\" not \"You should run the command\"");
  lines.push("");
  lines.push("### Error Messages");
  lines.push("");
  lines.push("- State what happened, why, and what the user can do about it");
  lines.push("- Include the specific value that caused the error when safe to do so");
  lines.push("- Never show raw stack traces to end users");
  lines.push("- Format: `[What went wrong]. [Why]. [What to do next].`");
  lines.push("");
  lines.push("### UI Copy");
  lines.push("");
  lines.push("- Button labels: use verbs (\"Save\", \"Export\", \"Generate\") not nouns");
  lines.push("- Empty states: explain what will appear and how to get there");
  lines.push("- Loading states: describe what's happening (\"Analyzing repository...\")");
  lines.push("- Success states: confirm what happened (\"3 files generated\")");
  lines.push("");
  lines.push("### API Responses");
  lines.push("");
  lines.push("- Error responses include `error` (human-readable) and machine-parseable status codes");
  lines.push("- Success responses include the created/modified resource");
  lines.push("- Use consistent field naming (snake_case)");
  lines.push("- Include `timestamp` in all responses for debugging");
  lines.push("");

  // Stack-Specific Brand Application
  if (frameworks.length > 0) {
    lines.push("## Stack-Specific Application");
    lines.push("");
    lines.push(`This project uses: ${frameworks.map(mdText).join(", ")}`);
    lines.push("");
    if (hasFw(ctx, "Next.js", "React")) {
      lines.push("- Component names should be descriptive and PascalCase");
      lines.push("- User-facing strings should be extractable for i18n readiness");
      lines.push("- Use aria-labels that match the brand voice (clear, concise)");
    }
    lines.push("");
  }

  // Naming Conventions
  lines.push("## Naming Conventions");
  lines.push("");
  lines.push("| Element | Convention | Example |");
  lines.push("|---------|-----------|---------|");
  lines.push("| Product name | Capitalized | " + mdInline(id.name) + " |");
  lines.push("| Feature names | Sentence case | \"Context analysis\" |");
  lines.push("| CLI commands | kebab-case | `generate-report` |");
  lines.push("| API endpoints | kebab-case | `/v1/search/export` |");
  lines.push("| Config keys | snake_case | `max_file_size` |");
  lines.push("| Environment vars | SCREAMING_SNAKE | `DATABASE_URL` |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const readmes = findFiles(files, ["**/README*", "**/CONTRIBUTING*", "**/BRANDING*"]);
    if (readmes.length > 0) {
      lines.push("## Existing Brand Assets");
      lines.push("");
      for (const r of readmes.slice(0, 4)) {
        lines.push(`- \`${mdCode(r.path)}\` (${r.size} bytes)`);
      }
      if (readmes.length > 4) lines.push(`- … and ${readmes.length - 4} more`);
      lines.push("");
    }
  }

  return {
    path: "brand-guidelines.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "brand",
    description: "Brand identity, positioning, and communication standards",
  };
}

// ─── voice-and-tone.md ──────────────────────────────────────────
//
// VOICE_EXAMPLES is exported so app_41's V-gate ("the guide's own examples
// pass their own rules") tests against the SAME Do/Don't pairs this file
// renders — not a second, drifting copy. `dont_reason_words` names the
// specific word(s) that make each Don't example off-voice, honestly, in the
// same spirit as app_33's "even split, not per-request precision": most
// pairs differ by a genuinely forbidden WORD (mechanically vale-checkable),
// but two (loading/empty-state) differ by INFORMATIVENESS, not vocabulary —
// no word list can catch that, so their `dont_reason_words` is empty and the
// V-gate excludes them explicitly rather than pretending to cover them.

export interface VoiceExample {
  context: string;
  tone: string;
  do: string;
  dont: string;
  rule: string;
  /** Word(s)/phrase(s) that make `dont` off-voice — empty means genuinely not vale-coverable (see header). */
  dont_reason_words: string[];
}

export const VOICE_EXAMPLES: VoiceExample[] = [
  {
    context: "Celebration / Success",
    tone: "Warm, brief, affirming",
    do: "Done. 8 files generated.",
    dont: "Congratulations! Your amazing files have been successfully created!",
    rule: "Acknowledge without over-celebrating. The user's goal was the work, not the notification.",
    dont_reason_words: ["congratulations", "amazing"],
  },
  {
    context: "Error / Failure",
    tone: "Direct, calm, solution-oriented",
    do: "Upload failed — file exceeds 10MB limit. Reduce file size or exclude binary assets.",
    dont: "Oops! Something went wrong.",
    rule: "Name the problem, explain why, give the next step. Never blame the user.",
    dont_reason_words: ["oops"],
  },
  {
    context: "Onboarding / First Use",
    tone: "Welcoming, clear, low-pressure",
    do: "Upload a project snapshot to get started. You'll receive a full context analysis.",
    dont: "Welcome to the most powerful analysis platform ever created!",
    rule: "Show the first action. Don't sell — let the product demonstrate value.",
    dont_reason_words: ["most powerful", "ever created"],
  },
  {
    context: "Technical Documentation",
    tone: "Precise, neutral, structured",
    do: "The `buildContextMap()` function accepts a `SnapshotRecord` and returns a `ContextMap`.",
    dont: "You can easily use buildContextMap to get cool context data.",
    rule: "Use exact types, function names, and parameter names. Skip adjectives.",
    dont_reason_words: ["easily", "cool"],
  },
  {
    context: "Loading / In-Progress",
    tone: "Informative, patient",
    do: "Analyzing 237 files...",
    dont: "Please wait while we process your request.",
    rule: "Describe the current step. Give the user a mental model of progress.",
    // Genuinely not vale-coverable: the Don't is generic/uninformative, not off-VOCABULARY.
    // Flagging "please" or "process" globally would be noise, not signal.
    dont_reason_words: [],
  },
  {
    context: "Empty States",
    tone: "Oriented, actionable",
    do: "No snapshots yet. Upload a project to see analysis results here.",
    dont: "Nothing to display.",
    rule: "Explain what will appear and how to make it appear.",
    // Same as above: differs by terseness/informativeness, not a forbidden word.
    dont_reason_words: [],
  },
];

export function generateVoiceAndTone(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Voice & Tone — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Context-sensitive tone guidance for every communication surface");
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

  // Tone Spectrum
  lines.push("## Tone Spectrum");
  lines.push("");
  lines.push("The voice stays constant (clear, confident, helpful). The **tone** adapts to context:");
  lines.push("");
  lines.push("```");
  lines.push("Casual ──────────────────────────────────────── Formal");
  lines.push("         Blog    Docs    UI    API    Error");
  lines.push("         posts   guides  copy  docs   messages");
  lines.push("```");
  lines.push("");

  // Tone per context
  lines.push("## Tone by Context");
  lines.push("");

  for (const ex of VOICE_EXAMPLES) {
    lines.push(`### ${ex.context}`);
    lines.push("");
    lines.push(`- Tone: ${ex.tone}`);
    lines.push(`- Do: "${ex.do}"`);
    lines.push(`- Don't: "${ex.dont}"`);
    lines.push(`- Rule: ${ex.rule}`);
    lines.push("");
  }

  // Writing Checklist
  lines.push("## Writing Checklist");
  lines.push("");
  lines.push("Before publishing any user-facing text:");
  lines.push("");
  lines.push("- [ ] Is it clear on first read?");
  lines.push("- [ ] Can any words be removed without losing meaning?");
  lines.push("- [ ] Does it tell the user what to do next?");
  lines.push("- [ ] Is the tone appropriate for the context (error, success, docs, UI)?");
  lines.push("- [ ] Are technical terms used correctly and consistently?");
  lines.push("- [ ] Would a new user understand this without prior context?");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const docFiles = findFiles(files, ["**/docs/**", "**/*.md", "**/CHANGELOG*"]);
    if (docFiles.length > 0) {
      lines.push("## Documentation Tone Samples");
      lines.push("");
      lines.push(`Found ${docFiles.length} documentation files to audit for tone consistency.`);
      lines.push("");
      for (const d of docFiles.slice(0, 6)) {
        lines.push(`- \`${mdCode(d.path)}\``);
      }
      lines.push("");
    }
  }

  return {
    path: "voice-and-tone.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "brand",
    description: "Context-sensitive tone guidance for all communication surfaces",
  };
}

// ─── content-constraints.md ─────────────────────────────────────
//
// TERMINOLOGY_TABLE is exported so app_41's vale-rule synthesizer
// (generateValePreferredTermsStyle below) reuses this SAME data as its
// substitution rules' source, rather than hand-copying the table a second
// time — the LLM_MODEL_PRICING lesson (app_33) applied here too.

export interface TerminologyRule {
  use: string;
  not: string[];
  reason: string;
}

export const TERMINOLOGY_TABLE: TerminologyRule[] = [
  { use: "snapshot", not: ["upload", "submission"], reason: "Canonical term for project input" },
  { use: "context map", not: ["analysis", "scan"], reason: "Canonical term for parsed output" },
  { use: "generator", not: ["creator", "builder"], reason: "Canonical term for output producers" },
  { use: "program", not: ["feature", "module", "tool"], reason: "Product-level unit" },
  { use: "project", not: ["repo", "codebase"], reason: "User's input concept" },
  { use: "output file", not: ["artifact", "result"], reason: "What generators produce" },
];

export function generateContentConstraints(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const conventions = ctx.ai_context.conventions;
  const lines: string[] = [];

  lines.push(`# Content Constraints — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Enforceable rules for AI-generated and human-written content");
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

  // Hard Constraints
  lines.push("## Hard Constraints (Never Violate)");
  lines.push("");
  lines.push("1. **No hallucinated features.** Only reference capabilities that exist in the codebase.");
  lines.push("2. **No version mismatches.** When referencing a dependency, use the version from package.json.");
  lines.push("3. **No broken code examples.** Every code snippet must compile/run against the current project.");
  lines.push("4. **No external URLs** unless verified reachable. Link to docs, not blog posts.");
  lines.push("5. **No placeholder text** in shipped content. \"Lorem ipsum\", \"TODO\", and \"TBD\" are defects.");
  lines.push("6. **Snake_case for data, kebab-case for URLs, PascalCase for components.**");
  lines.push("");

  // Soft Constraints
  lines.push("## Soft Constraints (Prefer Unless Explicitly Overridden)");
  lines.push("");
  lines.push("1. Prefer active voice over passive");
  lines.push("2. Prefer present tense (\"generates\" not \"will generate\")");
  lines.push("3. Prefer specific numbers over vague quantities (\"8 files\" not \"several files\")");
  lines.push("4. Prefer short sentences (under 25 words)");
  lines.push("5. Prefer bullet lists over dense paragraphs for multi-point content");
  lines.push("6. One idea per paragraph");
  lines.push("");

  // AI Prompt Constraints
  lines.push("## AI Content Generation Constraints");
  lines.push("");
  lines.push("When using AI to generate content for this project:");
  lines.push("");
  lines.push("1. Always include project name and type in the system prompt");
  lines.push("2. Reference the detected tech stack to prevent framework confusion");
  lines.push("3. Include these constraints as system-level rules in every generation prompt");
  lines.push("4. Validate generated code against the project's TypeScript/lint config");
  lines.push("5. Strip marketing language (\"revolutionary\", \"cutting-edge\", \"game-changing\")");
  lines.push("6. Never generate content that implies features the project doesn't have");
  lines.push("");

  // Project conventions as constraints
  if (conventions.length > 0) {
    lines.push("## Project-Specific Conventions");
    lines.push("");
    lines.push("Detected from codebase analysis — enforce in all generated content:");
    lines.push("");
    for (const c of conventions) {
      lines.push(`- ${mdText(c)}`);
    }
    lines.push("");
  }

  // Terminology
  lines.push("## Controlled Terminology");
  lines.push("");
  lines.push("| Use This | Not This | Reason |");
  lines.push("|----------|----------|--------|");
  for (const t of TERMINOLOGY_TABLE) {
    lines.push(`| ${mdInline(t.use)} | ${t.not.map(mdInline).join(", ")} | ${mdInline(t.reason)} |`);
  }
  lines.push("");

  // Formatting Standards
  lines.push("## Formatting Standards");
  lines.push("");
  lines.push("- Markdown: ATX headings (`#`), fenced code blocks with language tags");
  lines.push("- JSON: 2-space indent, trailing newline");
  lines.push("- YAML: 2-space indent, no trailing spaces");
  lines.push("- Code: Follow project's ESLint/Prettier config");
  lines.push("- File names: kebab-case for outputs, PascalCase for components");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const configFiles = findConfigs(files);
    if (configFiles.length > 0) {
      lines.push("## Detected Formatting Configs");
      lines.push("");
      for (const c of configFiles.slice(0, 5)) {
        lines.push(`- \`${mdCode(c.path)}\``);
      }
      if (configFiles.length > 5) lines.push(`- … and ${configFiles.length - 5} more`);
      lines.push("");
    }
    // Turn the rules above into a REAL audit: scan the repo's docs for actual
    // violations (deterministic grep, no AI).
    lines.push(...renderContentViolations(analyzeContentViolations(files)));
  }

  return {
    path: "content-constraints.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "brand",
    description: "Enforceable content rules for AI-generated and human-written content",
  };
}

// ─── messaging-system.yaml ──────────────────────────────────────

export function generateMessagingSystem(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  // Dedupe by (method, path) + drop test/README noise so counts reflect the real
  // API surface, not the parser's per-mention rows (dogfood: 537 raw → ~163).
  const routes = displayRoutes(ctx.routes);
  const entryPoints = ctx.entry_points;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const models = ctx.domain_models;
  const abstractions = ctx.ai_context.key_abstractions;
  const signals = ctx.architecture_signals;
  const lines: string[] = [];

  lines.push("# Messaging System");
  lines.push(`# Project: ${yamlFlowScalar(id.name)}`);
  // No `# Generated:` line — generated_at is zeroed for deterministic output, so it
  // would print a false "1970-01-01" in a customer-facing brand artifact.
  if (ctx.ai_context.project_summary) {
    lines.push(`# Summary: ${yamlFlowScalar(ctx.ai_context.project_summary.split("\n")[0])}`);
  }
  lines.push("");
  lines.push("product:");
  lines.push(`  name: ${yamlFlowScalar(id.name)}`);
  lines.push(`  type: ${yamlFlowScalar(id.type)}`);
  lines.push(`  primary_language: ${yamlFlowScalar(id.primary_language)}`);
  if (frameworks.length > 0) {
    lines.push(`  stack: ${yamlFlowScalar(frameworks.map(f => f.name).join(", "))}`);
  }
  lines.push("");

  // Project-specific taglines derived from actual data
  const primaryLang = id.primary_language;
  const fwNames = frameworks.map(f => f.name).join(" + ");
  const shortType = id.type.replace(/_/g, " ");
  // A SHORT tagline built from name + stack — not the first line of project_summary,
  // which is a multi-sentence stats blob ("… is a monorepo … 500 files … 242 models"),
  // wrong under a `primary:` tagline field.
  const primaryTagline = `${id.name} — ${fwNames || primaryLang} ${shortType}`;
  lines.push("taglines:");
  lines.push(`  primary: ${yamlFlowScalar(primaryTagline)}`);
  if (fwNames) {
    lines.push(`  technical: ${yamlFlowScalar(`${fwNames} ${id.type} — ${ctx.structure.total_files} files, ${ctx.structure.total_loc.toLocaleString("en-US")} lines`)}`);
  } else {
    lines.push(`  technical: ${yamlFlowScalar(`${primaryLang} ${id.type} — ${ctx.structure.total_files} files, ${ctx.structure.total_loc.toLocaleString("en-US")} lines`)}`);
  }
  if (abstractions.length > 0) {
    lines.push(`  conceptual: ${yamlFlowScalar(`Built around ${abstractions.slice(0, 3).join(", ")}`)}`);
  }
  lines.push("");

  // Value propositions derived from project features
  lines.push("value_propositions:");
  if (frameworks.length > 0) {
    lines.push("  - id: stack");
    lines.push(`    headline: ${yamlFlowScalar(`${fwNames} Expertise`)}`);
    lines.push(`    detail: ${yamlFlowScalar(`Built with ${frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""}`).join(", ")} — stack-native patterns throughout.`)}`);
  }
  if (routes.length > 0) {
    lines.push("  - id: api_surface");
    lines.push(`    headline: "${routes.length} API Endpoints"`);
    const methods = new Map<string, number>();
    for (const r of routes) methods.set(r.method, (methods.get(r.method) ?? 0) + 1);
    const methodStr = [...methods.entries()].map(([m, c]) => `${c} ${m}`).join(", ");
    lines.push(`    detail: ${yamlFlowScalar(`Complete API with ${methodStr} — ready for integration.`)}`);
  }
  if (models.length > 0) {
    lines.push("  - id: domain_model");
    lines.push(`    headline: "${models.length} Domain Entities"`);
    lines.push(`    detail: ${yamlFlowScalar(`Rich domain model with ${models.slice(0, 5).map(m => m.name).join(", ")}${models.length > 5 ? ` and ${models.length - 5} more` : ""}.`)}`);
  }
  // Require a genuinely strong signal before making an architecture value-prop —
  // a 0.51 score with ONE boundary is too thin to brand a repo "Clean Architecture".
  if (signals.separation_score >= 0.7 && signals.layer_boundaries.length >= 2) {
    const boundaries = signals.layer_boundaries.length;
    lines.push("  - id: architecture");
    lines.push(`    headline: ${yamlFlowScalar(`Well-separated architecture (${signals.separation_score.toFixed(2)} separation score)`)}`);
    lines.push(`    detail: ${yamlFlowScalar(`${signals.patterns_detected.length > 0 ? signals.patterns_detected.join(", ") : "Layered"} with ${boundaries} layer boundar${boundaries === 1 ? "y" : "ies"}.`)}`);
  }
  // Count real test files by PATH (the `role` field isn't reliably populated).
  // Only claim "tested" when tests actually exist, not merely because a test
  // framework is in devDependencies.
  const testCount = ctx.structure.file_tree_summary?.filter(
    f => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path) || /(^|\/)__tests__\//.test(f.path),
  ).length ?? 0;
  if (ctx.detection.test_frameworks.length > 0 && testCount > 0) {
    lines.push("  - id: quality");
    lines.push(`    headline: "Test-Driven Quality"`);
    lines.push(`    detail: ${yamlFlowScalar(`Tested with ${ctx.detection.test_frameworks.join(", ")} across ${testCount} test files.`)}`);
  }
  lines.push("");

  // Feature messaging with real data
  lines.push("feature_messages:");
  if (routes.length > 0) {
    lines.push("  api_surface:");
    lines.push(`    count: ${routes.length}`);
    lines.push(`    message: "${routes.length} API endpoints ready for integration"`);
    lines.push("    routes:");
    for (const r of routes.slice(0, 10)) {
      lines.push(`      - ${yamlFlowScalar(`${r.method} ${r.path}`)}`);
    }
  }
  if (entryPoints.length > 0) {
    lines.push("  entry_points:");
    lines.push(`    count: ${entryPoints.length}`);
    lines.push(`    message: "${entryPoints.length} detected entry points mapped for context"`);
    lines.push("    list:");
    for (const ep of entryPoints) {
      lines.push(`      - ${yamlFlowScalar(`${ep.path} (${ep.type})`)}`);
    }
  }
  if (languages.length > 0) {
    lines.push("  language_support:");
    lines.push(`    count: ${languages.length}`);
    lines.push(`    message: "${languages.length} languages detected and analyzed"`);
    lines.push("    breakdown:");
    for (const lang of languages.slice(0, 5)) {
      lines.push(`      - ${yamlFlowScalar(`${lang.name}: ${(lang.loc ?? 0).toLocaleString("en-US")} lines (${lang.loc_percent}%)`)}`);
    }
    if (languages.length > 5) {
      lines.push(`      - ${yamlFlowScalar(`(+${languages.length - 5} more languages)`)}`);
    }
  }
  if (frameworks.length > 0) {
    lines.push("  framework_detection:");
    lines.push(`    count: ${frameworks.length}`);
    lines.push(`    message: "${frameworks.length} frameworks detected with stack-aware output"`);
    lines.push("    detected:");
    for (const fw of frameworks) {
      lines.push(`      - name: ${yamlFlowScalar(fw.name)}`);
      lines.push(`        version: ${fw.version ? JSON.stringify(fw.version) : "null"}`);
      lines.push(`        confidence: ${fw.confidence}`);
    }
  }
  lines.push("");

  // CTA messaging. STARTER TEMPLATES — these are generic placeholders to replace
  // with the product's real calls-to-action, NOT values derived from the repo.
  // (Previously hardcoded AXIS's own "Upload Project"/"Send Snapshot via API",
  // which were false brand facts for any other analyzed project.)
  lines.push("# calls_to_action are starter placeholders — replace with your product's real CTAs.");
  lines.push("calls_to_action:");
  lines.push("  primary:");
  lines.push("    label: \"Get Started\"");
  lines.push("    context: \"Main landing page, empty states\"");
  lines.push("  secondary:");
  lines.push("    label: \"See How It Works\"");
  lines.push("    context: \"Feature sections, docs\"");
  if (displayRoutes(ctx.routes).length > 0) {
    lines.push("  api:");
    lines.push("    label: \"Read the API Docs\"");
    lines.push("    context: \"Developer documentation, API reference\"");
  }
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const pkgJson = findFile(files, "package.json");
    if (pkgJson) {
      const descMatch = pkgJson.content.match(/"description"\s*:\s*"([^"]+)"/);
      if (descMatch) {
        lines.push("# Source-derived messaging");
        lines.push("package_description:");
        lines.push(`  value: ${JSON.stringify(descMatch[1])}`);
        lines.push("");
      }
    }
  }

  return {
    path: "messaging-system.yaml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "brand",
    description: "Structured messaging system with taglines, value props, and CTAs",
  };
}

// ─── channel-rulebook.md ────────────────────────────────────────

export function generateChannelRulebook(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;

  const lines: string[] = [];
  lines.push(`# Channel Rulebook — ${mdText(id.name)}`);
  lines.push("");
  // No "Generated:" line — generated_at is zeroed for determinism (would show 1970).
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
  lines.push("Channel-specific brand and content rules for consistent communication.");
  lines.push("");

  // Key terms: prefer domain model names, fall back to conventions, then project name
  const keyTerms = ctx.domain_models.length > 0
    ? ctx.domain_models.slice(0, 5).map(m => m.name).join(", ")
    : ctx.ai_context.conventions.length > 0
      ? ctx.ai_context.conventions.slice(0, 4).join(", ")
      : id.name;

  lines.push("## Channel: Documentation");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Technical, precise, helpful |");
  lines.push("| Person | Second person (\"you\") |");
  lines.push("| Code examples | Required for every concept |");
  lines.push("| Max paragraph length | 3 sentences |");
  lines.push(`| Key terms | ${mdInline(keyTerms)} |`);
  lines.push("| Emoji | None |");
  lines.push("| CTA style | Inline links, \"Learn more\" |");
  lines.push("");

  lines.push("## Channel: GitHub (README, Issues, PRs)");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Professional, direct, action-oriented |");
  lines.push("| Format | Markdown with headers and code blocks |");
  lines.push("| Issue templates | Use structured templates with sections |");
  lines.push("| PR descriptions | What, Why, How, Testing |");
  lines.push("| Labels | Use consistent label taxonomy |");
  lines.push("| Response time target | < 24 hours |");
  lines.push("");

  lines.push("## Channel: Social Media (Twitter/X)");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Confident, concise, technical-but-approachable |");
  lines.push("| Max length | 280 chars (aim for < 200) |");
  lines.push("| Hashtags | Max 2 per post |");
  // PascalCase the alpha-stripped name, and fall back to a slug when the strip is
  // empty (a non-ASCII-alpha or all-digit name) so we never emit a bare `#`.
  const hashtagBase = id.name.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || "Project";
  lines.push(`| Branded hashtags | #${mdInline(hashtagBase)}, #BuiltWith${mdInline(hashtagBase)} |`);
  lines.push("| Thread style | Numbered, each tweet self-contained |");
  lines.push("| Media | Screenshot or GIF with every thread |");
  lines.push("");

  lines.push("## Channel: LinkedIn");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Professional, thought-leadership, use cases |");
  lines.push("| Format | Hook → Context → Insight → CTA |");
  lines.push("| Max length | 1300 chars (pre-fold: 140 chars) |");
  lines.push("| Media | Carousel or single image |");
  lines.push("| Frequency | 2–3 posts per week |");
  lines.push("");

  lines.push("## Channel: Email (Product Updates)");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Friendly, informative, value-first |");
  lines.push("| Subject line | < 50 chars, benefit-driven |");
  lines.push("| Preview text | < 90 chars, complements subject |");
  lines.push("| CTA | Single primary CTA per email |");
  lines.push("| Unsubscribe | Always visible, one-click |");
  lines.push("");

  lines.push("## Channel: Contact & Support");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Empathetic, direct, solution-first |");
  lines.push("| Auto-reply SLA | Acknowledge within 5 minutes |");
  lines.push("| Resolution target | Define tiered SLAs (critical/high/normal) |");
  lines.push(`| Escalation path | In-app help → GitHub Issues → Email → Direct |`);
  lines.push("| Error messages | State what failed, why, and next step |");
  lines.push("| Bug reports | Always acknowledge, provide issue tracker link |");
  lines.push("| Feature requests | Thank + route to roadmap or GitHub Discussions |");
  lines.push("| Billing issues | High priority SLA — respond within 2 business hours |");
  const supportRoutes = displayRoutes(ctx.routes).filter(r =>
    r.path.includes("support") || r.path.includes("contact") || r.path.includes("help"),
  );
  if (supportRoutes.length > 0) {
    lines.push(`| Detected support routes | ${supportRoutes.slice(0, 3).map(r => `\`${mdCellCode(r.path)}\``).join(", ")} |`);
  }
  lines.push("");

  lines.push("## Channel: In-App (UI Copy)");
  lines.push("");
  lines.push("| Rule | Value |");
  lines.push("|------|-------|");
  lines.push("| Tone | Clear, scannable, action-oriented |");
  lines.push("| Buttons | Verb + Object (\"Create Snapshot\", \"Export Files\") |");
  lines.push("| Errors | What happened + What to do (never blame user) |");
  lines.push("| Empty states | Explain value + CTA to get started |");
  lines.push("| Loading | Skeleton screens over spinners |");
  lines.push("| Confirmation | Always confirm destructive actions |");
  lines.push("");

  lines.push("## Forbidden Patterns (All Channels)");
  lines.push("");
  lines.push("- Never use \"simple\" or \"easy\" (dismisses complexity)");
  lines.push("- Never use \"just\" before instructions (implies triviality)");
  lines.push("- Never promise specific timelines for features");
  lines.push("- Never use jargon without explanation on public channels");
  lines.push("- Never use competitor names negatively");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const readmes = findFiles(files, ["**/README*"]);
    if (readmes.length > 0) {
      lines.push("## Detected Public-Facing Files");
      lines.push("");
      lines.push("These files should comply with channel rules:");
      lines.push("");
      for (const r of readmes.slice(0, 4)) {
        lines.push(`- \`${mdCode(r.path)}\` (${r.size} bytes)`);
      }
      if (readmes.length > 4) lines.push(`- … and ${readmes.length - 4} more`);
      lines.push("");
    }
  }

  return {
    path: "channel-rulebook.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "brand",
    description: "Channel-specific brand rules for docs, GitHub, social, email, and in-app copy",
  };
}

// ═══ Deterministic content-violation scan ═════════════════════════════════════
// A grep + fixed-rule-table scan of the repo's DOCS (no LLM, no injection — fully
// reproducible) that turns content-constraints.md's forbidden-pattern LIST into
// REAL findings: shipped placeholders/markers, marketing fluff to strip, and the
// "simple/easy/just" dismissive language the pack's Forbidden Patterns ban. Only
// human-facing docs are scanned (a `// TODO` in source code isn't a content
// defect), and fenced code blocks are skipped (a marker inside a code EXAMPLE is
// legitimate).

export type ContentIssueClass = "PLACEHOLDER" | "MARKETING" | "DISMISSIVE";

export interface ContentFinding {
  file: string;
  line: number;
  term: string;
  klass: ContentIssueClass;
}

const CONTENT_RULES: Array<{ klass: ContentIssueClass; re: RegExp }> = [
  // Placeholders/markers — case-sensitive so prose "todo list" doesn't match.
  { klass: "PLACEHOLDER", re: /\b(TODO|TBD|FIXME|XXX|PLACEHOLDER)\b/ },
  { klass: "PLACEHOLDER", re: /lorem ipsum/i },
  // Marketing fluff the constraints tell writers to strip.
  { klass: "MARKETING", re: /\b(revolutionary|cutting[ -]edge|game[ -]chang(?:ing|er)|world[ -]class|best[ -]in[ -]class|blazing(?:ly)?[ -]fast|seamless(?:ly)?|next[ -]generation|state[ -]of[ -]the[ -]art|bleeding[ -]edge|turnkey)\b/i },
  // Dismissive words the Forbidden Patterns ban outright.
  { klass: "DISMISSIVE", re: /\b(simply|simple|effortless(?:ly)?)\b/i },
  { klass: "DISMISSIVE", re: /\bjust\s+(?:run|use|call|add|do|set|click|type|install|import|drop|paste|open)\b/i },
];

function isDocFile(p: string): boolean {
  const lower = p.toLowerCase();
  if (/(^|\/)(dist|build|node_modules|vendor|\.next|coverage)\//.test(lower)) return false;
  return /\.(md|mdx|markdown)$/.test(lower) ||
    /(^|\/)(readme|contributing|changelog|code_of_conduct)(\.(txt|rst|adoc))?$/i.test(p);
}

/** Static content-rule scan of the repo's docs. Deterministic (code-unit order). */
export function analyzeContentViolations(files: SourceFile[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const docs = files
    .filter(f => isDocFile(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const f of docs) {
    const lines = f.content.split("\n");
    // Track the OPEN fence's marker (char + length) so a nested/mismatched fence
    // (e.g. ``` inside a ```` block, or ~~~ inside ```) can't mistoggle and leak
    // a code example into the scan. Reset per file — unbalanced fences don't leak.
    let fence = "";
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const run = ln.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (run) {
        if (!fence) fence = run;
        else if (run[0] === fence[0] && run.length >= fence.length) fence = "";
        continue; // skip the fence line itself
      }
      if (fence) continue; // code examples aren't "content"
      for (const rule of CONTENT_RULES) {
        const m = ln.match(rule.re);
        if (m) out.push({ file: f.path, line: i + 1, term: m[0], klass: rule.klass });
      }
    }
  }
  return out;
}

const CONTENT_ORDER: ContentIssueClass[] = ["PLACEHOLDER", "MARKETING", "DISMISSIVE"];

/** Render the deterministic content-violation findings as markdown lines. */
export function renderContentViolations(findings: ContentFinding[]): string[] {
  const lines: string[] = [];
  lines.push("## Detected Content Violations (deterministic)");
  lines.push("");
  lines.push("> Static scan of the repo's docs (`*.md`, README/CONTRIBUTING/CHANGELOG) against the rules above — grep + a fixed table, **no AI**. Fenced code blocks are skipped. `PLACEHOLDER` = a shipped placeholder/marker (a hard-constraint defect); `MARKETING` = fluff to strip; `DISMISSIVE` = \"simple/effortless/just …\" (a Forbidden Pattern).");
  lines.push("");
  if (findings.length === 0) {
    lines.push("_No placeholders, marketing fluff, or dismissive language detected in the scanned docs._");
    lines.push("");
    return lines;
  }
  const tally = new Map<ContentIssueClass, number>();
  for (const x of findings) tally.set(x.klass, (tally.get(x.klass) ?? 0) + 1);
  lines.push("| Class | Count |");
  lines.push("|-------|-------|");
  for (const k of CONTENT_ORDER) { const c = tally.get(k); if (c) lines.push(`| ${k} | ${c} |`); }
  lines.push("");
  const sorted = [...findings].sort((a, b) =>
    CONTENT_ORDER.indexOf(a.klass) - CONTENT_ORDER.indexOf(b.klass) ||
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
  lines.push("| File | Line | Term | Class |");
  lines.push("|------|------|------|-------|");
  for (const x of sorted.slice(0, 40)) {
    lines.push(`| \`${mdCellCode(x.file)}\` | ${x.line} | ${mdInline(x.term)} | ${x.klass} |`);
  }
  if (sorted.length > 40) lines.push(`| … | | | +${sorted.length - 40} more |`);
  lines.push("");
  return lines;
}

// ═══ app_41: vale rule synthesis (.vale.ini + styles/AXIS/*.yml) ═════════════
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #14 — "A: enforce
// voice-and-tone on user-facing strings in PRs via vale rules the program
// synthesizes from its own guide." These three generators emit a REAL,
// runnable vale (MIT, github.com/errata-ai/vale) configuration — not
// prose ABOUT voice, rules a linter can actually execute. Every token comes
// from data this file already owns (CONTENT_RULES, TERMINOLOGY_TABLE,
// VOICE_EXAMPLES) — synthesized, never hand-duplicated (the LLM_MODEL_PRICING
// lesson, app_33).
//
// V ("the guide's own examples pass their own rules") is NOT proven here —
// these three functions are pure, deterministic, no external process. The
// self-consistency check that actually RUNS vale against VOICE_EXAMPLES lives
// in apps/api/src/brand-voice-lint-watcher.ts (the Watch mechanic's own
// runtime, where every other watcher's external-tool calls already live —
// canvas-diagram-watcher.ts's D2 render is the precedent), proven again by a
// dedicated test using the real vale binary.

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Literal phrase -> a word-bounded regex token vale's existence check can use. */
function literalToToken(phrase: string): string {
  return `\\b${phrase.split(/\s+/).map(escapeRegexToken).join("[ -]")}\\b`;
}

/** All off-voice tokens this program can synthesize a rule for — CONTENT_RULES' regex sources (marketing fluff + dismissive language; PLACEHOLDER is a doc-hygiene concern, not a voice one) plus every VOICE_EXAMPLES word/phrase named as the reason its Don't example is off-voice. Exported so the watcher's runtime self-check and this generator can never drift apart. */
export function valeForbiddenTokens(): string[] {
  const fromContentRules = CONTENT_RULES.filter((r) => r.klass !== "PLACEHOLDER").map((r) => r.re.source);
  const fromVoiceExamples = VOICE_EXAMPLES.flatMap((ex) => ex.dont_reason_words).map(literalToToken);
  // Dedupe (a word could plausibly appear in both sources) while preserving
  // stable, deterministic order — Set preserves insertion order in JS.
  return [...new Set([...fromContentRules, ...fromVoiceExamples])];
}

// ─── .vale.ini ────────────────────────────────────────────────────

export function generateValeConfig(_ctx: ContextMap): GeneratedFile {
  const lines: string[] = [
    "# AXIS Brand — vale configuration (synthesized from this repo's own voice guide)",
    "# Run: vale --config .vale.ini <file>",
    "StylesPath = styles",
    "MinAlertLevel = suggestion",
    "",
    "[*]",
    "BasedOnStyles = AXIS",
    "",
  ];
  return {
    path: ".vale.ini",
    content: lines.join("\n"),
    content_type: "text/plain",
    program: "brand",
    description: "vale configuration pointing at the synthesized AXIS voice style",
  };
}

// ─── styles/AXIS/ForbiddenPatterns.yml ───────────────────────────

export function generateValeForbiddenTermsStyle(_ctx: ContextMap): GeneratedFile {
  const tokens = valeForbiddenTokens();
  const lines: string[] = [
    "# Synthesized from content-constraints.md's marketing/dismissive-language rules",
    "# and voice-and-tone.md's own Don't examples — see generators-brand.ts's",
    "# valeForbiddenTokens(). Do not hand-edit; regenerate instead.",
    "extends: existence",
    `message: ${yamlFlowScalar("Off-voice language: '%s'. See voice-and-tone.md and content-constraints.md.")}`,
    "level: error",
    "ignorecase: true",
    "tokens:",
    ...tokens.map((t) => `  - ${yamlFlowScalar(t)}`),
    "",
  ];
  return {
    path: "styles/AXIS/ForbiddenPatterns.yml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "brand",
    description: "vale existence rule synthesized from this repo's own forbidden voice patterns",
  };
}

// ─── styles/AXIS/PreferredTerms.yml ──────────────────────────────

export function generateValePreferredTermsStyle(_ctx: ContextMap): GeneratedFile {
  const swap: Array<[string, string]> = [];
  for (const t of TERMINOLOGY_TABLE) {
    for (const bad of t.not) swap.push([bad, t.use]);
  }
  const lines: string[] = [
    "# Synthesized from content-constraints.md's Controlled Terminology table —",
    "# see generators-brand.ts's TERMINOLOGY_TABLE. Do not hand-edit; regenerate instead.",
    "extends: substitution",
    `message: ${yamlFlowScalar("Use '%s' instead of '%s'. See content-constraints.md's Controlled Terminology.")}`,
    "level: warning",
    "ignorecase: true",
    "swap:",
    ...swap.map(([bad, good]) => `  ${yamlFlowScalar(bad)}: ${yamlFlowScalar(good)}`),
    "",
  ];
  return {
    path: "styles/AXIS/PreferredTerms.yml",
    content: lines.join("\n"),
    content_type: "text/yaml",
    program: "brand",
    description: "vale substitution rule synthesized from this repo's own controlled terminology",
  };
}
