import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, findFile, findConfigs, extractExports } from "./file-excerpt-utils.js";

// ─── brand-guidelines.md ────────────────────────────────────────

export function generateBrandGuidelines(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Brand Guidelines — ${id.name}`);
  lines.push("");
  lines.push(`> Brand identity and communication standards for ${id.name}`);
  lines.push("");

  // Project Overview
  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  // Detected Stack
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${fw.name} | ${fw.version ?? "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  // Brand Identity
  lines.push("## Brand Identity");
  lines.push("");
  lines.push(`**Product Name:** ${id.name}`);
  lines.push(`**Category:** ${id.type.replace(/_/g, " ")}`);
  lines.push(`**Primary Technology:** ${id.primary_language}`);
  if (id.description) {
    lines.push(`**Description:** ${id.description}`);
  }
  lines.push("");

  // Positioning
  lines.push("## Positioning");
  lines.push("");
  const isWebApp = id.type.includes("web") || id.type.includes("application");
  const isCli = id.type.includes("cli") || id.type.includes("tool");
  const isLibrary = id.type.includes("library") || id.type.includes("package");
  if (isWebApp) {
    lines.push(`${id.name} is a web application that delivers value through its user interface and API surface.`);
    lines.push("");
    lines.push("**Target Audience:** Developers, technical teams, and end users who interact with the web interface.");
  } else if (isCli) {
    lines.push(`${id.name} is a command-line tool built for developer productivity.`);
    lines.push("");
    lines.push("**Target Audience:** Developers and DevOps engineers working in terminal environments.");
  } else if (isLibrary) {
    lines.push(`${id.name} is a library/package consumed by other software projects.`);
    lines.push("");
    lines.push("**Target Audience:** Developers integrating this library into their applications.");
  } else {
    lines.push(`${id.name} is a ${id.type.replace(/_/g, " ")} built with ${id.primary_language}.`);
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
    lines.push(`This project uses: ${frameworks.join(", ")}`);
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
  lines.push("| Product name | Capitalized | " + id.name + " |");
  lines.push("| Feature names | Sentence case | \"Context analysis\" |");
  lines.push("| CLI commands | kebab-case | `generate-report` |");
  lines.push("| API endpoints | kebab-case | `/v1/search/export` |");
  lines.push("| Config keys | snake_case | `max_file_size` |");
  lines.push("| Environment vars | SCREAMING_SNAKE | `AXIS_DB_PATH` |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const readmes = findFiles(files, ["**/README*", "**/CONTRIBUTING*", "**/BRANDING*"]);
    if (readmes.length > 0) {
      lines.push("## Existing Brand Assets");
      lines.push("");
      for (const r of readmes.slice(0, 4)) {
        lines.push(`- \`${r.path}\` (${r.size} bytes)`);
      }
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

export function generateVoiceAndTone(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Voice & Tone — ${id.name}`);
  lines.push("");
  lines.push("> Context-sensitive tone guidance for every communication surface");
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${fw.name} | ${fw.version ?? "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
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

  lines.push("### Celebration / Success");
  lines.push("");
  lines.push("- Tone: Warm, brief, affirming");
  lines.push("- Do: \"Done. 8 files generated.\"");
  lines.push("- Don't: \"Congratulations! Your amazing files have been successfully created!\"");
  lines.push("- Rule: Acknowledge without over-celebrating. The user's goal was the work, not the notification.");
  lines.push("");

  lines.push("### Error / Failure");
  lines.push("");
  lines.push("- Tone: Direct, calm, solution-oriented");
  lines.push("- Do: \"Upload failed — file exceeds 10MB limit. Reduce file size or exclude binary assets.\"");
  lines.push("- Don't: \"Oops! Something went wrong.\"");
  lines.push("- Rule: Name the problem, explain why, give the next step. Never blame the user.");
  lines.push("");

  lines.push("### Onboarding / First Use");
  lines.push("");
  lines.push("- Tone: Welcoming, clear, low-pressure");
  lines.push("- Do: \"Upload a project snapshot to get started. You'll receive a full context analysis.\"");
  lines.push("- Don't: \"Welcome to the most powerful analysis platform ever created!\"");
  lines.push("- Rule: Show the first action. Don't sell — let the product demonstrate value.");
  lines.push("");

  lines.push("### Technical Documentation");
  lines.push("");
  lines.push("- Tone: Precise, neutral, structured");
  lines.push("- Do: \"The `buildContextMap()` function accepts a `SnapshotRecord` and returns a `ContextMap`.\"");
  lines.push("- Don't: \"You can easily use buildContextMap to get cool context data.\"");
  lines.push("- Rule: Use exact types, function names, and parameter names. Skip adjectives.");
  lines.push("");

  lines.push("### Loading / In-Progress");
  lines.push("");
  lines.push("- Tone: Informative, patient");
  lines.push("- Do: \"Analyzing 237 files...\" → \"Detecting frameworks...\" → \"Generating outputs...\"");
  lines.push("- Don't: \"Please wait while we process your request.\"");
  lines.push("- Rule: Describe the current step. Give the user a mental model of progress.");
  lines.push("");

  lines.push("### Empty States");
  lines.push("");
  lines.push("- Tone: Oriented, actionable");
  lines.push("- Do: \"No snapshots yet. Upload a project to see analysis results here.\"");
  lines.push("- Don't: \"Nothing to display.\"");
  lines.push("- Rule: Explain what will appear and how to make it appear.");
  lines.push("");

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
        lines.push(`- \`${d.path}\``);
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

export function generateContentConstraints(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const conventions = ctx.ai_context.conventions;
  const lines: string[] = [];

  lines.push(`# Content Constraints — ${id.name}`);
  lines.push("");
  lines.push("> Enforceable rules for AI-generated and human-written content");
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${fw.name} | ${fw.version ?? "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
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
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Terminology
  lines.push("## Controlled Terminology");
  lines.push("");
  lines.push("| Use This | Not This | Reason |");
  lines.push("|----------|----------|--------|");
  lines.push("| snapshot | upload, submission | Canonical term for project input |");
  lines.push("| context map | analysis, scan | Canonical term for parsed output |");
  lines.push("| generator | creator, builder | Canonical term for output producers |");
  lines.push("| program | feature, module, tool | Product-level unit |");
  lines.push("| project | repo, codebase | User's input concept |");
  lines.push("| output file | artifact, result | What generators produce |");
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
        lines.push(`- \`${c.path}\``);
      }
      lines.push("");
    }
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
  const routes = ctx.routes;
  const entryPoints = ctx.entry_points;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const models = ctx.domain_models;
  const abstractions = ctx.ai_context.key_abstractions;
  const signals = ctx.architecture_signals;
  const lines: string[] = [];

  lines.push("# Messaging System");
  lines.push(`# Project: ${id.name}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  if (ctx.ai_context.project_summary) {
    lines.push(`# Summary: ${ctx.ai_context.project_summary.split("\n")[0]}`);
  }
  lines.push("");
  lines.push("product:");
  lines.push(`  name: "${id.name}"`);
  lines.push(`  type: "${id.type}"`);
  lines.push(`  primary_language: "${id.primary_language}"`);
  if (frameworks.length > 0) {
    lines.push(`  stack: "${frameworks.map(f => f.name).join(", ")}"`);
  }
  lines.push("");

  // Project-specific taglines derived from actual data
  const primaryLang = id.primary_language;
  const fwNames = frameworks.map(f => f.name).join(" + ");
  const projectDesc = ctx.ai_context.project_summary?.split("\n")[0] ?? id.name;
  lines.push("taglines:");
  if (fwNames) {
    lines.push(`  primary: "${projectDesc}"`);
    lines.push(`  technical: "${fwNames} ${id.type} — ${ctx.structure.total_files} files, ${ctx.structure.total_loc.toLocaleString()} lines of ${primaryLang}"`);
  } else {
    lines.push(`  primary: "${projectDesc}"`);
    lines.push(`  technical: "${primaryLang} ${id.type} — ${ctx.structure.total_files} files, ${ctx.structure.total_loc.toLocaleString()} lines"`);
  }
  if (abstractions.length > 0) {
    lines.push(`  conceptual: "Built around ${abstractions.slice(0, 3).join(", ")}"`);
  }
  lines.push("");

  // Value propositions derived from project features
  lines.push("value_propositions:");
  if (frameworks.length > 0) {
    lines.push("  - id: stack");
    lines.push(`    headline: "${fwNames} Expertise"`);
    lines.push(`    detail: "Built with ${frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""}`).join(", ")} — stack-native patterns throughout."`);
  }
  if (routes.length > 0) {
    lines.push("  - id: api_surface");
    lines.push(`    headline: "${routes.length} API Endpoints"`);
    const methods = new Map<string, number>();
    for (const r of routes) methods.set(r.method, (methods.get(r.method) ?? 0) + 1);
    const methodStr = [...methods.entries()].map(([m, c]) => `${c} ${m}`).join(", ");
    lines.push(`    detail: "Complete API with ${methodStr} — ready for integration."`);
  }
  if (models.length > 0) {
    lines.push("  - id: domain_model");
    lines.push(`    headline: "${models.length} Domain Entities"`);
    lines.push(`    detail: "Rich domain model with ${models.slice(0, 5).map(m => m.name).join(", ")}${models.length > 5 ? ` and ${models.length - 5} more` : ""}."`);
  }
  if (signals.separation_score > 0.5) {
    lines.push("  - id: architecture");
    lines.push(`    headline: "Clean Architecture (${signals.separation_score.toFixed(2)} separation)"`);
    lines.push(`    detail: "${signals.patterns_detected.length > 0 ? signals.patterns_detected.join(", ") : "Well-structured"} with ${signals.layer_boundaries.length} layer boundaries."`);
  }
  if (ctx.detection.test_frameworks.length > 0) {
    lines.push("  - id: quality");
    lines.push(`    headline: "Test-Driven Quality"`);
    const testCount = ctx.structure.file_tree_summary?.filter(f => f.role === "test").length ?? 0;
    lines.push(`    detail: "Tested with ${ctx.detection.test_frameworks.join(", ")}${testCount > 0 ? ` across ${testCount} test files` : ""}."`);
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
      lines.push(`      - "${r.method} ${r.path}"`);
    }
  }
  if (entryPoints.length > 0) {
    lines.push("  entry_points:");
    lines.push(`    count: ${entryPoints.length}`);
    lines.push(`    message: "${entryPoints.length} detected entry points mapped for context"`);
    for (const ep of entryPoints) {
      lines.push(`      - "${ep.path} (${ep.type})"`);
    }
  }
  if (languages.length > 0) {
    lines.push("  language_support:");
    lines.push(`    count: ${languages.length}`);
    lines.push(`    message: "${languages.length} languages detected and analyzed"`);
    lines.push("    breakdown:");
    for (const lang of languages.slice(0, 5)) {
      lines.push(`      - "${lang.name}: ${(lang.loc ?? 0).toLocaleString()} lines (${lang.loc_percent}%)"`);
    }
  }
  if (frameworks.length > 0) {
    lines.push("  framework_detection:");
    lines.push(`    count: ${frameworks.length}`);
    lines.push(`    message: "${frameworks.length} frameworks detected with stack-aware output"`);
    lines.push("    detected:");
    for (const fw of frameworks) {
      lines.push(`      - name: "${fw.name}"`);
      lines.push(`        version: ${JSON.stringify(fw.version)}`);
      lines.push(`        confidence: ${fw.confidence}`);
    }
  }
  lines.push("");

  // CTA messaging
  lines.push("calls_to_action:");
  lines.push("  primary:");
  lines.push("    label: \"Upload Project\"");
  lines.push("    context: \"Main landing page, empty states\"");
  lines.push("  secondary:");
  lines.push("    label: \"View Results\"");
  lines.push("    context: \"After snapshot processing complete\"");
  lines.push("  api:");
  lines.push("    label: \"Send Snapshot via API\"");
  lines.push("    context: \"Developer documentation, API reference\"");
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
  const abstractions = ctx.ai_context.key_abstractions;

  const lines: string[] = [];
  lines.push(`# Channel Rulebook — ${id.name}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.ai_context.project_summary);
    lines.push("");
  }

  if (frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of frameworks) {
      lines.push(`| ${fw.name} | ${fw.version ?? "—"} | ${(fw.confidence * 100).toFixed(0)}% |`);
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
  lines.push(`| Key terms | ${keyTerms} |`);
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
  lines.push(`| Branded hashtags | #${id.name.replace(/[^a-zA-Z]/g, "")}, #BuiltWith${id.name.replace(/[^a-zA-Z]/g, "")} |`);
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
  if (ctx.routes.some(r => r.path.includes("support") || r.path.includes("contact") || r.path.includes("help"))) {
    const supportRoutes = ctx.routes.filter(r =>
      r.path.includes("support") || r.path.includes("contact") || r.path.includes("help"),
    );
    lines.push(`| Detected support routes | ${supportRoutes.slice(0, 3).map(r => `\`${r.path}\``).join(", ")} |`);
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
        lines.push(`- \`${r.path}\` (${r.size} bytes)`);
      }
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
