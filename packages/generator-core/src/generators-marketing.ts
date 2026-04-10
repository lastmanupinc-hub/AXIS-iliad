import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { findFiles, findFile, findEntryPoints, extractExports } from "./file-excerpt-utils.js";

// ─── campaign-brief.md ──────────────────────────────────────────

export function generateCampaignBrief(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Campaign Brief — ${id.name}`);
  lines.push("");
  lines.push(`> Marketing campaign foundation for a ${id.type.replace(/_/g, " ")} built with ${id.primary_language}`);
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

  // Product Overview
  lines.push("## Product Overview");
  lines.push("");
  lines.push(`**Product**: ${id.name}`);
  lines.push(`**Type**: ${id.type.replace(/_/g, " ")}`);
  lines.push(`**Primary Language**: ${id.primary_language}`);
  if (frameworks.length > 0) {
    lines.push(`**Framework Stack**: ${frameworks.join(", ")}`);
  }
  lines.push("");
  lines.push(`**Description**: ${id.description || `A ${id.type.replace(/_/g, " ")} that leverages ${id.primary_language} and modern tooling.`}`);
  lines.push("");

  // Target Audience
  lines.push("## Target Audience");
  lines.push("");
  lines.push("### Primary Segments");
  lines.push("");

  const isDevTool = id.type === "cli_tool" || id.type === "library" || id.type === "monorepo";
  const isWebApp = id.type === "web_application" || id.type === "fullstack_application";

  if (isDevTool) {
    lines.push("| Segment | Description | Pain Point |");
    lines.push("|---------|------------|------------|");
    lines.push(`| Senior Developers | Experienced ${id.primary_language} engineers | Need to reduce boilerplate and repetitive work |`);
    lines.push("| Tech Leads | Team leads evaluating tools | Need to standardize team workflows |");
    lines.push("| DevOps Engineers | CI/CD and infrastructure | Need automation and consistency |");
  } else if (isWebApp) {
    lines.push("| Segment | Description | Pain Point |");
    lines.push("|---------|------------|------------|");
    lines.push("| End Users | Direct product users | Need efficient, intuitive interfaces |");
    lines.push("| Product Managers | Decision makers | Need measurable business outcomes |");
    lines.push("| Development Teams | Teams building on the platform | Need clear API and extension points |");
  } else {
    lines.push("| Segment | Description | Pain Point |");
    lines.push("|---------|------------|------------|");
    lines.push(`| Technical Users | ${id.primary_language} developers | Need reliable, well-documented tools |`);
    lines.push("| Team Leads | Engineering managers | Need maintainable, scalable solutions |");
  }
  lines.push("");

  // Key Messages
  lines.push("## Key Messages");
  lines.push("");
  lines.push("### Value Propositions");
  lines.push("");

  let vpIdx = 1;
  const fwNames = ctx.detection.frameworks.map(f => f.name);
  if (fwNames.length > 0) {
    const fwStr = ctx.detection.frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""}`).join(", ");
    lines.push(`${vpIdx++}. **${fwNames.join(" + ")} Stack** — Built on ${fwStr} with stack-native patterns throughout`);
  } else {
    lines.push(`${vpIdx++}. **Built on ${id.primary_language}** — Production-grade technology choice with strong ecosystem`);
  }
  const routes = ctx.routes;
  if (routes.length > 0) {
    const methodCounts = new Map<string, number>();
    for (const r of routes) methodCounts.set(r.method, (methodCounts.get(r.method) ?? 0) + 1);
    const methodStr = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `${c} ${m}`).join(", ");
    lines.push(`${vpIdx++}. **${routes.length} API Endpoints** — ${methodStr} across ${[...new Set(routes.map(r => r.source_file))].length} source files`);
  }
  const models = ctx.domain_models;
  if (models.length > 0) {
    const topModels = models.slice(0, 5).map(m => m.name).join(", ");
    lines.push(`${vpIdx++}. **${models.length} Domain Entities** — ${topModels}${models.length > 5 ? ` and ${models.length - 5} more` : ""}`);
  }
  const testFws = ctx.detection.test_frameworks;
  if (testFws.length > 0) {
    const testFileCount = ctx.structure.file_tree_summary.filter(f => f.role === "test").length;
    lines.push(`${vpIdx++}. **Test-Driven Quality** — Verified with ${testFws.join(", ")}${testFileCount > 0 ? ` across ${testFileCount} test files` : ""}`);
  }
  const archPatterns = ctx.architecture_signals.patterns_detected;
  if (archPatterns.length > 0) {
    lines.push(`${vpIdx++}. **Clean Architecture** — ${archPatterns.join(", ")} (${ctx.architecture_signals.separation_score.toFixed(2)} separation score)`);
  } else if (ctx.ai_context.conventions.length > 0) {
    lines.push(`${vpIdx++}. **Developer Experience** — ${ctx.ai_context.conventions.length} enforced conventions: ${ctx.ai_context.conventions.slice(0, 2).join("; ")}`);
  }
  lines.push("");

  // Channels
  lines.push("## Distribution Channels");
  lines.push("");
  lines.push("| Channel | Priority | Content Type |");
  lines.push("|---------|----------|-------------|");
  if (isDevTool) {
    lines.push("| GitHub / README | High | Documentation, badges, quickstart |");
    lines.push("| Dev.to / Hashnode | High | Technical tutorials, case studies |");
    lines.push("| Twitter/X | Medium | Release notes, tips, threads |");
    lines.push("| Discord / Slack | Medium | Community support, feedback |");
    lines.push("| npm / Package Registry | High | Package listing, keywords |");
  } else {
    lines.push("| Landing Page | High | Product overview, CTA |");
    lines.push("| Blog | High | Use cases, tutorials |");
    lines.push("| Social Media | Medium | Announcements, engagement |");
    lines.push("| Email | Medium | Onboarding sequences, updates |");
    lines.push("| Documentation | High | API docs, guides |");
  }
  lines.push("");

  // Campaign Timeline
  lines.push("## Campaign Timeline");
  lines.push("");
  lines.push("| Phase | Duration | Focus |");
  lines.push("|-------|----------|-------|");
  lines.push("| Pre-launch | 2 weeks | Build anticipation, early access list |");
  lines.push("| Launch | 1 week | Announcement, demo content, outreach |");
  lines.push("| Post-launch | 4 weeks | Feedback collection, iteration, case studies |");
  lines.push("| Growth | Ongoing | Community building, content marketing |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const readmes = findFiles(files, ["**/README*"]);
    const pkgJson = findFile(files, "package.json");
    if (readmes.length > 0 || pkgJson) {
      lines.push("## Source-Derived Messaging");
      lines.push("");
      if (pkgJson) {
        const desc = pkgJson.content.match(/"description"\s*:\s*"([^"]+)"/);
        if (desc) lines.push(`- **Package description**: ${desc[1]}`);
        const keywords = pkgJson.content.match(/"keywords"\s*:\s*\[([^\]]+)\]/);
        if (keywords) lines.push(`- **Keywords**: ${keywords[1].replace(/"/g, "").trim()}`);
      }
      for (const r of readmes.slice(0, 2)) {
        const firstLine = r.content.split("\n").find(l => l.trim().length > 10 && !l.startsWith("#"));
        if (firstLine) lines.push(`- **README tagline**: ${firstLine.trim().slice(0, 120)}`);
      }
      lines.push("");
    }
  }

  return {
    path: "campaign-brief.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "marketing",
    description: "Marketing campaign brief with audience segments, messaging, and channel strategy",
  };
}

// ─── funnel-map.md ──────────────────────────────────────────────

export function generateFunnelMap(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Funnel Map — ${id.name}`);
  lines.push("");
  lines.push("> User acquisition funnel from awareness to advocacy");
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

  // Awareness
  lines.push("## 1. Awareness");
  lines.push("");
  lines.push("**Goal**: Get the project in front of the target audience");
  lines.push("");
  lines.push("### Touchpoints");
  lines.push("- GitHub repository discovery (search, trending, explore)");
  lines.push("- Technical blog posts and tutorials");
  lines.push("- Social media mentions and threads");
  lines.push("- Conference talks and meetup presentations");
  lines.push("- Package registry listing (npm, PyPI, etc.)");
  lines.push("");
  lines.push("### Metrics");
  lines.push("- GitHub stars and forks");
  lines.push("- Website/README page views");
  lines.push("- Social media impressions");
  lines.push("");

  // Interest
  lines.push("## 2. Interest");
  lines.push("");
  lines.push("**Goal**: Convert awareness into active evaluation");
  lines.push("");
  lines.push("### Touchpoints");
  lines.push("- README quickstart section");
  lines.push("- Documentation site / API reference");
  lines.push("- Demo or playground environment");
  lines.push("- Getting started guide");
  lines.push("");
  lines.push("### Content Needs");

  const entryPoints = ctx.entry_points.slice(0, 3);
  if (entryPoints.length > 0) {
    lines.push(`- Quickstart showing core entry points: ${entryPoints.map(e => `\`${e.path}\``).join(", ")}`);
  }
  lines.push("- Architecture overview explaining design decisions");
  lines.push("- Comparison table vs alternatives");
  lines.push("");
  lines.push("### Metrics");
  lines.push("- README read-through rate");
  lines.push("- Documentation page views and time-on-page");
  lines.push("- Clones and installs");
  lines.push("");

  // Decision
  lines.push("## 3. Decision");
  lines.push("");
  lines.push("**Goal**: Move from evaluation to first real usage");
  lines.push("");
  lines.push("### Blockers to Address");
  lines.push("- Clear installation instructions");
  lines.push("- Minimum viable example that proves value in < 5 minutes");
  lines.push("- Known limitations documented honestly");

  const warnings = ctx.ai_context.warnings;
  if (warnings.length > 0) {
    lines.push("- Current known issues:");
    for (const w of warnings.slice(0, 3)) {
      lines.push(`  - ${w}`);
    }
  }
  lines.push("");
  lines.push("### Metrics");
  lines.push("- First install to first successful run time");
  lines.push("- Drop-off rate during onboarding");
  lines.push("- Issue creation rate (signal of engagement)");
  lines.push("");

  // Activation
  lines.push("## 4. Activation");
  lines.push("");
  lines.push("**Goal**: User completes a meaningful action and sees value");
  lines.push("");

  const activationModels = ctx.domain_models.slice(0, 5);
  const activationAbstractions = ctx.ai_context.key_abstractions.slice(0, 3);
  if (activationModels.length > 0) {
    lines.push("### Key Activation Moments (by domain entity)");
    for (const m of activationModels) {
      lines.push(`- Works with **${m.name}** (${m.kind}) for the first time`);
    }
    lines.push("");
  } else if (activationAbstractions.length > 0) {
    lines.push("### Key Activation Moments");
    for (const a of activationAbstractions) {
      lines.push(`- Uses **${a}** successfully for the first time`);
    }
    lines.push("");
  }

  const postRoutes = ctx.routes.filter(r => r.method === "POST").slice(0, 5);
  if (postRoutes.length > 0) {
    lines.push("### Action Triggers (POST routes)");
    for (const r of postRoutes) {
      lines.push(`- \`POST ${r.path}\` — ${r.source_file}`);
    }
    lines.push("");
  }

  lines.push("### Metrics");
  lines.push("- Feature usage depth (which features are used first)");
  lines.push("- Return usage within 7 days");
  lines.push("- Custom output generation (for generator tools)");
  lines.push("");

  // Advocacy
  lines.push("## 5. Advocacy");
  lines.push("");
  lines.push("");
  lines.push("### Triggers");
  lines.push("- User shares on social media");
  lines.push("- User opens a PR or contributes");
  lines.push("- User creates content (blog post, video, tutorial)");
  lines.push("- User recommends to team/peers");
  lines.push("");
  lines.push("### Metrics");
  lines.push("- Contributor count");
  lines.push("- User-generated content pieces");
  lines.push("- Referral installs");
  lines.push("- NPS score");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    if (entries.length > 0) {
      lines.push("## Detected Product Entry Points");
      lines.push("");
      lines.push("Map these to funnel stages — each is a potential conversion surface:");
      lines.push("");
      for (const ep of entries.slice(0, 5)) {
        lines.push(`- \`${ep.path}\``);
      }
      lines.push("");
    }
  }

  return {
    path: "funnel-map.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "marketing",
    description: "User acquisition funnel from awareness through advocacy",
  };
}

// ─── sequence-pack.md ───────────────────────────────────────────

export function generateSequencePack(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Sequence Pack — ${id.name}`);
  lines.push("");
  lines.push("> Email and outreach sequences for onboarding, retention, and re-engagement");
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

  // Welcome Sequence
  lines.push("## Welcome Sequence (Post-Install)");
  lines.push("");

  lines.push("### Email 1: Welcome (Day 0)");
  lines.push("");
  lines.push(`**Subject**: Welcome to ${id.name} — here's your quickstart`);
  lines.push("");
  lines.push("**Body**:");
  lines.push(`- Brief welcome and what ${id.name} does`);
  lines.push("- Link to quickstart guide");
  lines.push("- One concrete example they can try in 2 minutes");
  lines.push("- CTA: Try the quickstart");
  lines.push("");

  lines.push("### Email 2: Core Feature (Day 2)");
  lines.push("");
  lines.push(`**Subject**: The one ${id.name} feature everyone uses first`);
  lines.push("");

  const topModels = ctx.domain_models.slice(0, 3);
  const topAbstraction = ctx.ai_context.key_abstractions[0];
  lines.push("**Body**:");
  if (topModels.length > 0) {
    lines.push(`- Highlight the core entities: ${topModels.map(m => `**${m.name}**`).join(", ")}`);
    lines.push(`- Show how to create and interact with a \`${topModels[0].name}\` end-to-end`);
  } else if (topAbstraction) {
    lines.push(`- Highlight the core feature: **${topAbstraction}**`);
  } else {
    lines.push("- Highlight the primary use case and core value proposition");
  }
  lines.push("- Step-by-step walkthrough with code/screenshots");
  lines.push("- CTA: Try this feature");
  lines.push("");

  lines.push("### Email 3: Power User Tip (Day 5)");
  lines.push("");
  lines.push(`**Subject**: Level up your ${id.name} usage`);
  lines.push("");
  lines.push("**Body**:");
  const conventions = ctx.ai_context.conventions.slice(0, 3);
  lines.push("- Advanced tip or lesser-known feature");
  if (conventions.length > 0) {
    for (const c of conventions) {
      lines.push(`- Pro convention: ${c}`);
    }
  }
  lines.push("- Link to documentation or example repo");
  lines.push("- CTA: Explore advanced docs");
  lines.push("");

  // Re-engagement Sequence
  lines.push("## Re-engagement Sequence (Inactive 14+ days)");
  lines.push("");

  lines.push("### Email 1: What's New (Day 14)");
  lines.push("");
  lines.push(`**Subject**: ${id.name} updates you may have missed`);
  lines.push("");
  lines.push("**Body**:");
  lines.push("- Summary of recent updates / changelog highlights");
  lines.push("- One compelling new feature or improvement");
  lines.push("- CTA: Check out what's new");
  lines.push("");

  lines.push("### Email 2: Community Highlight (Day 21)");
  lines.push("");
  lines.push(`**Subject**: See what others are building with ${id.name}`);
  lines.push("");
  lines.push("**Body**:");
  lines.push("- Community showcase or case study");
  lines.push("- User testimonial or success story");
  lines.push("- CTA: Join the community");
  lines.push("");

  // Contributor Sequence
  lines.push("## Contributor Outreach Sequence");
  lines.push("");

  lines.push("### Email 1: Thank You (Day 0 — After First PR)");
  lines.push("");
  lines.push(`**Subject**: Thanks for contributing to ${id.name}!`);
  lines.push("");
  lines.push("**Body**:");
  lines.push("- Genuine thank you for their contribution");
  lines.push("- Explain the impact of their change");
  lines.push("- Link to contributor guide for next steps");
  lines.push("- CTA: Pick up another issue");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const contributing = findFiles(files, ["**/CONTRIBUTING*", "**/CODE_OF_CONDUCT*"]);
    if (contributing.length > 0) {
      lines.push("## Detected Contributor Assets");
      lines.push("");
      for (const c of contributing) {
        lines.push(`- \`${c.path}\` (${c.size} bytes)`);
      }
      lines.push("");
    }
  }

  return {
    path: "sequence-pack.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "marketing",
    description: "Email and outreach sequences for onboarding, retention, and contributor engagement",
  };
}

// ─── cro-playbook.md ────────────────────────────────────────────

export function generateCroPlaybook(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const routes = ctx.routes;
  const lines: string[] = [];

  lines.push(`# CRO Playbook — ${id.name}`);
  lines.push("");
  lines.push("> Conversion Rate Optimization playbook based on detected routes and architecture");
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

  // Core Conversions
  lines.push("## Core Conversion Events");
  lines.push("");
  lines.push("| Event | Description | Priority |");
  lines.push("|-------|------------|----------|");
  lines.push("| First Install | User installs/clones for the first time | Critical |");
  lines.push("| First Run | User runs the tool successfully | Critical |");
  lines.push("| First Value | User generates useful output | High |");
  lines.push("| Return Usage | User comes back within 7 days | High |");
  lines.push("| Share/Recommend | User shares or recommends | Medium |");
  lines.push("| Contribute | User opens issue or PR | Medium |");
  lines.push("");

  // Route Analysis for CRO
  if (routes.length > 0) {
    lines.push("## Route Optimization Opportunities");
    lines.push("");
    lines.push("Detected routes that are candidates for conversion optimization:");
    lines.push("");
    lines.push("| Route | Method | CRO Action |");
    lines.push("|-------|--------|-----------|");
    for (const r of routes) {
      let action = "Monitor usage metrics";
      if (r.path.includes("login") || r.path.includes("auth")) {
        action = "Reduce friction — minimize required fields";
      } else if (r.path.includes("signup") || r.path.includes("register")) {
        action = "A/B test form length and CTA copy";
      } else if (r.path.includes("dashboard") || r.path.includes("home")) {
        action = "Optimize time-to-value — show key metrics immediately";
      } else if (r.path.includes("api") || r.path.includes("v1")) {
        action = "Track API adoption rate per endpoint";
      } else if (r.path.includes("docs") || r.path.includes("help")) {
        action = "Track documentation coverage and bounce rate";
      }
      lines.push(`| \`${r.path}\` | ${r.method} | ${action} |`);
    }
    lines.push("");
  }

  // Optimization Experiments — generated from detected routes and patterns
  lines.push("## Optimization Experiments");
  lines.push("");

  const experimentRoutes = {
    hasAuth: routes.some(r => r.path.includes("login") || r.path.includes("auth") || r.path.includes("signin")),
    hasSignup: routes.some(r => r.path.includes("signup") || r.path.includes("register")),
    hasDashboard: routes.some(r => r.path.includes("dashboard") || r.path.includes("home")),
    hasApi: routes.some(r => r.path.includes("/api/") || r.path.includes("/v1/")),
    hasDocs: routes.some(r => r.path.includes("doc") || r.path.includes("help") || r.path.includes("guide")),
    hasPricing: routes.some(r => r.path.includes("pricing") || r.path.includes("plan")),
  };

  let expIdx = 1;

  if (experimentRoutes.hasSignup) {
    lines.push(`### Experiment ${expIdx++}: Sign Up Flow`);
    lines.push("");
    lines.push("- **Route**: " + routes.filter(r => r.path.includes("signup") || r.path.includes("register")).map(r => `\`${r.method} ${r.path}\``).join(", "));
    lines.push("- **Hypothesis**: Reducing signup form fields will increase completion rate by 25%");
    lines.push("- **Metric**: Signup conversion rate, time to complete");
    lines.push("- **Variants**: A: Current form | B: Progressive disclosure (email first, rest later)");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (experimentRoutes.hasAuth && !experimentRoutes.hasSignup) {
    lines.push(`### Experiment ${expIdx++}: Authentication Flow`);
    lines.push("");
    lines.push("- **Route**: " + routes.filter(r => r.path.includes("login") || r.path.includes("auth")).map(r => `\`${r.method} ${r.path}\``).join(", "));
    lines.push("- **Hypothesis**: Social OAuth login will increase conversion by 30%");
    lines.push("- **Metric**: Login success rate, abandonment rate");
    lines.push("- **Variants**: A: Email/password only | B: OAuth (GitHub, Google) as primary");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (experimentRoutes.hasDashboard) {
    lines.push(`### Experiment ${expIdx++}: Dashboard First-Value`);
    lines.push("");
    lines.push("- **Route**: " + routes.filter(r => r.path.includes("dashboard") || r.path.includes("home")).map(r => `\`${r.method} ${r.path}\``).join(", "));
    lines.push("- **Hypothesis**: Showing key metrics immediately will increase 7-day retention by 20%");
    lines.push("- **Metric**: Time to first meaningful action, 7-day return rate");
    lines.push("- **Variants**: A: Current dashboard | B: Pre-populated demo data on first login");
    lines.push("- **Duration**: 3 weeks");
    lines.push("");
  }

  if (experimentRoutes.hasPricing) {
    lines.push(`### Experiment ${expIdx++}: Pricing Page`);
    lines.push("");
    lines.push("- **Route**: " + routes.filter(r => r.path.includes("pricing") || r.path.includes("plan")).map(r => `\`${r.method} ${r.path}\``).join(", "));
    lines.push("- **Hypothesis**: Highlighting the most popular plan will increase paid conversion by 15%");
    lines.push("- **Metric**: Plan selection rate, paid conversion");
    lines.push("- **Variants**: A: Equal weight pricing table | B: \"Most Popular\" badge on mid-tier");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (experimentRoutes.hasApi) {
    lines.push(`### Experiment ${expIdx++}: API First-Call Success`);
    lines.push("");
    lines.push(`- **Routes**: ${routes.filter(r => r.path.includes("/api/") || r.path.includes("/v1/")).slice(0, 3).map(r => `\`${r.method} ${r.path}\``).join(", ")}`);
    lines.push("- **Hypothesis**: An interactive API playground will increase developer activation by 40%");
    lines.push("- **Metric**: Time to first successful API call, developer satisfaction");
    lines.push("- **Variants**: A: Static API docs | B: Live try-it-now console in docs");
    lines.push("- **Duration**: 4 weeks");
    lines.push("");
  }

  if (experimentRoutes.hasDocs) {
    lines.push(`### Experiment ${expIdx++}: Documentation Navigation`);
    lines.push("");
    lines.push("- **Route**: " + routes.filter(r => r.path.includes("doc") || r.path.includes("help")).map(r => `\`${r.method} ${r.path}\``).join(", "));
    lines.push("- **Hypothesis**: Task-oriented docs will reduce support issues by 30%");
    lines.push("- **Metric**: Issue creation rate for how-to questions, docs bounce rate");
    lines.push("- **Variants**: A: Current structure | B: Task-oriented guides (\"How to X\" pattern)");
    lines.push("- **Duration**: 4 weeks");
    lines.push("");
  }

  // Always add a baseline experiment
  lines.push(`### Experiment ${expIdx++}: Onboarding Flow`);
  lines.push("");
  lines.push("- **Hypothesis**: A guided first-run wizard will increase first-value moment by 35%");
  lines.push("- **Metric**: Features used in first session, time to first successful output");
  lines.push(`- **Context**: ${routes.length} API endpoints — users need a path through the complexity`);
  lines.push("- **Variants**: A: Self-discovery | B: Step-by-step first-run guide with progress indicator");
  lines.push("- **Duration**: 3 weeks");
  lines.push("");

  // Metrics Dashboard
  lines.push("## Metrics to Track");
  lines.push("");
  lines.push("| Metric | Source | Target |");
  lines.push("|--------|--------|--------|");
  lines.push("| Install rate | npm/registry analytics | +20% MoM |");
  lines.push("| First-run success rate | Telemetry (opt-in) | > 90% |");
  lines.push("| Time to first value | Telemetry (opt-in) | < 5 minutes |");
  lines.push("| 7-day retention | Telemetry (opt-in) | > 40% |");
  lines.push("| GitHub star rate | GitHub API | +10% MoM |");
  lines.push("| Issue response time | GitHub API | < 24 hours |");
  lines.push("| Documentation bounce rate | Analytics | < 40% |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const landingFiles = findFiles(files, ["**/landing*", "**/home*", "**/index.html", "**/page.*"]);
    if (landingFiles.length > 0) {
      lines.push("## Detected Landing/Conversion Pages");
      lines.push("");
      for (const f of landingFiles.slice(0, 6)) {
        lines.push(`- \`${f.path}\``);
      }
      lines.push("");
    }
  }

  return {
    path: "cro-playbook.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "marketing",
    description: "Conversion Rate Optimization playbook with experiments and metrics",
  };
}

// ─── ab-test-plan.md ────────────────────────────────────────────

export function generateAbTestPlan(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const routes = ctx.routes;
  const frameworks = ctx.detection.frameworks;

  const pageRoutes = routes.filter(r => !r.path.startsWith("/api") && r.method === "GET");

  const lines: string[] = [];
  lines.push(`# A/B Test Plan — ${id.name}`);
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

  lines.push("## Test Framework Setup");
  lines.push("");
  const hasNext = hasFw(ctx, "Next.js", "next");
  if (hasNext) {
    lines.push("**Recommended**: Next.js Edge Middleware + feature flags");
    lines.push("- Use `NextResponse.rewrite()` for server-side variant routing");
    lines.push("- Cookie-based sticky sessions for consistent user experience");
  } else {
    lines.push("**Recommended**: Client-side feature flag with cookie persistence");
    lines.push("- Set variant on first visit, persist in cookie");
    lines.push("- Read variant cookie before rendering");
  }
  lines.push("");

  lines.push("## Priority Tests");
  lines.push("");

  // Test 1: Landing page
  lines.push("### Test 1: Landing Page Hero");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|-----------|-------|");
  lines.push(`| Target page | ${pageRoutes.find(r => r.path === "/")?.path ?? "/"} |`);
  lines.push("| Hypothesis | A benefit-driven headline increases signup rate |");
  lines.push("| Primary metric | Signup conversion rate |");
  lines.push("| Secondary metric | Time on page, scroll depth |");
  lines.push("| Sample size | Min. 1,000 visitors per variant |");
  lines.push("| Duration | 14 days minimum |");
  lines.push("| Confidence | 95% statistical significance |");
  lines.push("");
  lines.push("| Variant | Description |");
  lines.push("|---------|-------------|");
  lines.push(`| Control | Current hero copy |`);
  lines.push(`| A | Feature-focused: \"${id.name} analyzes your codebase in seconds\" |`);
  lines.push(`| B | Outcome-focused: \"Ship faster with AI that understands your code\" |`);
  lines.push("");

  // Test 2: CTA
  lines.push("### Test 2: Primary CTA");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|-----------|-------|");
  lines.push("| Target | All pages with CTA |");
  lines.push("| Hypothesis | Action-specific CTA text outperforms generic |");
  lines.push("| Primary metric | Click-through rate |");
  lines.push("| Sample size | Min. 500 exposures per variant |");
  lines.push("| Duration | 7 days |");
  lines.push("");
  lines.push("| Variant | CTA Text | Color |");
  lines.push("|---------|----------|-------|");
  lines.push("| Control | \"Get Started\" | Primary |");
  lines.push(`| A | \"Analyze My Repo\" | Primary |`);
  lines.push(`| B | \"Try ${id.name} Free\" | Accent |`);
  lines.push("");

  // Test 3: Pricing
  lines.push("### Test 3: Pricing Page Layout");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|-----------|-------|");
  lines.push(`| Target page | /pricing |`);
  lines.push("| Hypothesis | Highlighting popular plan increases conversions |");
  lines.push("| Primary metric | Plan selection rate |");
  lines.push("| Secondary metric | Revenue per visitor |");
  lines.push("");
  lines.push("| Variant | Description |");
  lines.push("|---------|-------------|");
  lines.push("| Control | Equal-weight plan cards |");
  lines.push("| A | \"Most Popular\" badge on mid-tier plan |");
  lines.push("| B | Feature comparison table below cards |");
  lines.push("");

  lines.push("## Experiment Guardrails");
  lines.push("");
  lines.push("- **Never test on authenticated flows** without rollback plan");
  lines.push("- **Minimum sample size**: 500 per variant before reading results");
  lines.push("- **Kill criteria**: If error rate increases >1% in any variant, stop test");
  lines.push("- **One test per page**: Never run overlapping experiments on same surface");
  lines.push("- **Document everything**: Record hypothesis, variants, results, and learnings");
  lines.push("");

  lines.push("## Metrics Collection");
  lines.push("");
  lines.push("| Event | Trigger | Properties |");
  lines.push("|-------|---------|------------|");
  lines.push("| `experiment_viewed` | Page load with active test | variant_id, test_id |");
  lines.push("| `experiment_converted` | Primary action completed | variant_id, test_id, value |");
  lines.push("| `experiment_bounced` | Left without action | variant_id, test_id, time_on_page |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const testFiles = findFiles(files, ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]);
    if (testFiles.length > 0) {
      lines.push("## Existing Test Infrastructure");
      lines.push("");
      lines.push(`Found ${testFiles.length} test files — leverage this infrastructure for experiment validation.`);
      lines.push("");
    }
  }

  return {
    path: "ab-test-plan.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "marketing",
    description: "A/B test plans with hypotheses, variants, metrics, and guardrails",
  };
}
