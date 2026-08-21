import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw } from "./fw-helpers.js";
import { findFiles, findFile, findEntryPoints } from "./file-excerpt-utils.js";
import { mdText, mdInline, mdCode, mdCellCode, mdBlock } from "./md-sanitize.js";
import { displayRoutes, isApiRoute } from "./route-utils.js";

// ─── Route classification (shared by the CRO table + experiments) ───────────
// ONE classifier used by both the route table and the experiments, so a route's
// category, its CRO action, and whether an experiment fires can never disagree
// (an adversarial review found a `/signin`-only repo firing an Auth experiment
// whose route filter was empty → a dangling blank `- Route:` field). Matches by
// whole path SEGMENTS (so `/authors` isn't classified "auth").
export type RouteCategory = "signup" | "auth" | "dashboard" | "pricing" | "api" | "docs" | "other";

export function classifyRoute(path: string): RouteCategory {
  const segs = new Set(path.toLowerCase().split(/[/\-_.]/).filter(Boolean));
  const has = (...w: string[]) => w.some(x => segs.has(x));
  if (has("signup", "register")) return "signup";
  if (has("login", "signin", "auth")) return "auth";
  if (has("dashboard", "home")) return "dashboard";
  // api before pricing so `/api/plans` is an API endpoint, not a pricing page.
  if (has("api", "v1")) return "api";
  if (has("pricing", "plan", "plans")) return "pricing";
  if (has("docs", "documentation", "doc", "help", "guide", "guides")) return "docs";
  return "other";
}

const CRO_ACTIONS: Record<RouteCategory, string> = {
  signup: "A/B test form length and CTA copy",
  auth: "Reduce friction — minimize required fields",
  dashboard: "Optimize time-to-value — show key metrics immediately",
  pricing: "Highlight the recommended plan; A/B test tier framing",
  api: "Track API adoption rate per endpoint",
  docs: "Track documentation coverage and bounce rate",
  other: "Monitor usage metrics",
};

// Static/machine endpoints that are NOT conversion surfaces (favicon, robots,
// sitemap, humans/security/llms .txt, .well-known, and data/asset files). This is
// intentionally NARROWER than isApiRoute — /api and /docs DO carry CRO signal
// (API adoption, docs→signup) and must stay in the CRO table.
export function isStaticAssetRoute(path: string): boolean {
  const base = path.toLowerCase().split("/").pop() ?? "";
  return /^\/\.well-known\//i.test(path)
    || /^(robots\.txt|sitemap[\w-]*\.xml|favicon\.\w+|humans\.txt|security\.txt|llms\.txt|manifest\.webmanifest)$/i.test(base)
    || /\.(ico|png|jpe?g|gif|svg|webmanifest|map|xml|txt|json|ya?ml|rss|css|js)$/i.test(base);
}

// ─── campaign-brief.md ──────────────────────────────────────────

export function generateCampaignBrief(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const lines: string[] = [];

  lines.push(`# Campaign Brief — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`> Marketing campaign foundation for a ${mdText(id.type.replace(/_/g, " "))} built with ${mdText(id.primary_language)}`);
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

  // Product Overview
  lines.push("## Product Overview");
  lines.push("");
  lines.push(`**Product**: ${mdText(id.name)}`);
  lines.push(`**Type**: ${mdText(id.type.replace(/_/g, " "))}`);
  lines.push(`**Primary Language**: ${mdText(id.primary_language)}`);
  if (frameworks.length > 0) {
    lines.push(`**Framework Stack**: ${mdText(frameworks.join(", "))}`);
  }
  lines.push("");
  lines.push(`**Description**: ${mdText(id.description || `A ${id.type.replace(/_/g, " ")} that leverages ${id.primary_language} and modern tooling.`)}`);
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
    lines.push(`| Senior Developers | Experienced ${mdInline(id.primary_language)} engineers | Need to reduce boilerplate and repetitive work |`);
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
    lines.push(`| Technical Users | ${mdInline(id.primary_language)} developers | Need reliable, well-documented tools |`);
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
    lines.push(`${vpIdx++}. **${mdText(fwNames.join(" + "))} Stack** — Built on ${mdText(fwStr)} with stack-native patterns throughout`);
  } else {
    lines.push(`${vpIdx++}. **Built on ${mdText(id.primary_language)}** — Production-grade technology choice with strong ecosystem`);
  }
  const routes = displayRoutes(ctx.routes);
  if (routes.length > 0) {
    const methodCounts = new Map<string, number>();
    for (const r of routes) methodCounts.set(r.method, (methodCounts.get(r.method) ?? 0) + 1);
    const methodStr = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `${c} ${m}`).join(", ");
    lines.push(`${vpIdx++}. **${routes.length} Routes** — ${mdText(methodStr)} across ${[...new Set(routes.map(r => r.source_file))].length} source files`);
  }
  const models = ctx.domain_models;
  if (models.length > 0) {
    const topModels = models.slice(0, 5).map(m => m.name).join(", ");
    lines.push(`${vpIdx++}. **${models.length} Domain Entities** — ${mdText(topModels)}${models.length > 5 ? ` and ${models.length - 5} more` : ""}`);
  }
  const testFws = ctx.detection.test_frameworks;
  if (testFws.length > 0) {
    const testFileCount = ctx.structure.file_tree_summary.filter(f => f.role === "test").length;
    lines.push(`${vpIdx++}. **Test-Driven Quality** — Verified with ${mdText(testFws.join(", "))}${testFileCount > 0 ? ` across ${testFileCount} test files` : ""}`);
  }
  const archPatterns = ctx.architecture_signals.patterns_detected;
  if (archPatterns.length > 0) {
    lines.push(`${vpIdx++}. **${ctx.architecture_signals.separation_score > 0.6 ? "Clean Architecture" : "Defined Architecture"}** — ${mdText(archPatterns.join(", "))} (${ctx.architecture_signals.separation_score.toFixed(2)} separation score)`);
  } else if (ctx.ai_context.conventions.length > 0) {
    lines.push(`${vpIdx++}. **Developer Experience** — ${ctx.ai_context.conventions.length} enforced conventions: ${mdText(ctx.ai_context.conventions.slice(0, 2).join("; "))}`);
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
        if (desc) lines.push(`- **Package description**: ${mdText(desc[1])}`);
        const keywords = pkgJson.content.match(/"keywords"\s*:\s*\[([^\]]+)\]/);
        if (keywords) lines.push(`- **Keywords**: ${mdText(keywords[1].replace(/"/g, "").trim())}`);
      }
      for (const r of readmes.slice(0, 2)) {
        // Skip structural/badge lines (blockquote, list, table, code fence, image/
        // link/HTML) — not just ATX headings — so the "tagline" is real prose, and
        // add an ellipsis when truncating instead of cutting mid-word silently.
        const firstLine = r.content.split("\n")
          .map(l => l.trim())
          .find(l => l.length > 10 && !/^([#>\-*|]|`{3}|~{3}|!?\[|<)/.test(l));
        if (firstLine) {
          const tagline = firstLine.length > 120 ? firstLine.slice(0, 119).trimEnd() + "…" : firstLine;
          lines.push(`- **README tagline**: ${mdText(tagline)}`);
        }
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

  lines.push(`# Funnel Map — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> User acquisition funnel from awareness to advocacy");
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

  // Fall back to the file-based detector when ctx.entry_points is empty (it usually
  // is) so this bullet isn't dropped while the same doc's "Detected Product Entry
  // Points" section (findEntryPoints) lists several.
  const entryPaths = ctx.entry_points.length > 0
    ? ctx.entry_points.slice(0, 3).map(e => e.path)
    : (files ? findEntryPoints(files).slice(0, 3).map(f => f.path) : []);
  if (entryPaths.length > 0) {
    lines.push(`- Quickstart showing core entry points: ${entryPaths.map(p => `\`${mdCode(p)}\``).join(", ")}`);
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
      lines.push(`  - ${mdText(w)}`);
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
      lines.push(`- Works with **${mdText(m.name)}** (${mdText(m.kind)}) for the first time`);
    }
    lines.push("");
  } else if (activationAbstractions.length > 0) {
    lines.push("### Key Activation Moments");
    for (const a of activationAbstractions) {
      lines.push(`- Uses **${mdText(a)}** successfully for the first time`);
    }
    lines.push("");
  }

  const postRoutes = displayRoutes(ctx.routes).filter(r => r.method === "POST").slice(0, 5);
  if (postRoutes.length > 0) {
    lines.push("### Action Triggers (POST routes)");
    for (const r of postRoutes) {
      lines.push(`- \`POST ${mdCode(r.path)}\` — ${mdText(r.source_file)}`);
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
  lines.push("**Goal**: Turn satisfied users into advocates and contributors.");
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
        lines.push(`- \`${mdCode(ep.path)}\``);
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

  lines.push(`# Sequence Pack — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Email and outreach sequences for onboarding, retention, and re-engagement");
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

  // Welcome Sequence
  lines.push("## Welcome Sequence (Post-Install)");
  lines.push("");

  lines.push("### Email 1: Welcome (Day 0)");
  lines.push("");
  lines.push(`**Subject**: Welcome to ${mdText(id.name)} — here's your quickstart`);
  lines.push("");
  lines.push("**Body**:");
  lines.push(`- Brief welcome and what ${mdText(id.name)} does`);
  lines.push("- Link to quickstart guide");
  lines.push("- One concrete example they can try in 2 minutes");
  lines.push("- CTA: Try the quickstart");
  lines.push("");

  lines.push("### Email 2: Core Feature (Day 2)");
  lines.push("");
  lines.push(`**Subject**: Getting started with ${mdText(id.name)}'s core concepts`);
  lines.push("");

  const topModels = ctx.domain_models.slice(0, 3);
  const topAbstraction = ctx.ai_context.key_abstractions[0];
  lines.push("**Body**:");
  if (topModels.length > 0) {
    // Detected domain entities — NOT usage-ranked (the generator has no usage
    // data), so don't frame them as "the feature everyone uses first".
    lines.push(`- Detected domain entities to consider featuring: ${topModels.map(m => `**${mdText(m.name)}**`).join(", ")}`);
    lines.push(`- Pick the most user-facing one and show how to create/interact with it end-to-end`);
  } else if (topAbstraction) {
    lines.push(`- Highlight a detected key abstraction: **${mdText(topAbstraction)}**`);
  } else {
    lines.push("- Highlight the primary use case and core value proposition");
  }
  lines.push("- Step-by-step walkthrough with code/screenshots");
  lines.push("- CTA: Try this feature");
  lines.push("");

  lines.push("### Email 3: Power User Tip (Day 5)");
  lines.push("");
  lines.push(`**Subject**: Level up your ${mdText(id.name)} usage`);
  lines.push("");
  lines.push("**Body**:");
  const conventions = ctx.ai_context.conventions.slice(0, 3);
  lines.push("- Advanced tip or lesser-known feature");
  if (conventions.length > 0) {
    for (const c of conventions) {
      lines.push(`- Pro convention: ${mdText(c)}`);
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
  lines.push(`**Subject**: ${mdText(id.name)} updates you may have missed`);
  lines.push("");
  lines.push("**Body**:");
  lines.push("- Summary of recent updates / changelog highlights");
  lines.push("- One compelling new feature or improvement");
  lines.push("- CTA: Check out what's new");
  lines.push("");

  lines.push("### Email 2: Community Highlight (Day 21)");
  lines.push("");
  lines.push(`**Subject**: See what others are building with ${mdText(id.name)}`);
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
  lines.push(`**Subject**: Thanks for contributing to ${mdText(id.name)}!`);
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
        lines.push(`- \`${mdCode(c.path)}\` (${c.size} bytes)`);
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
  const routes = displayRoutes(ctx.routes);
  const lines: string[] = [];

  lines.push(`# CRO Playbook — ${mdText(id.name)}`);
  lines.push("");
  lines.push("> Conversion Rate Optimization playbook based on detected routes and architecture");
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

  // Route Analysis for CRO — drop only static/asset endpoints (favicon, robots,
  // sitemap, .well-known, *.json); /api + /docs DO carry CRO signal (API adoption,
  // docs→signup) and stay. Capped so a large route surface isn't unbounded.
  const croRoutes = routes.filter(r => !isStaticAssetRoute(r.path));
  if (croRoutes.length > 0) {
    lines.push("## Route Optimization Opportunities");
    lines.push("");
    lines.push("Detected page routes that are candidates for conversion optimization:");
    lines.push("");
    lines.push("| Route | Method | CRO Action |");
    lines.push("|-------|--------|-----------|");
    for (const r of croRoutes.slice(0, 25)) {
      lines.push(`| \`${mdCellCode(r.path)}\` | ${mdInline(r.method)} | ${CRO_ACTIONS[classifyRoute(r.path)]} |`);
    }
    if (croRoutes.length > 25) lines.push(`| … | | +${croRoutes.length - 25} more |`);
    lines.push("");
  }

  // Optimization Experiments — generated from detected routes and patterns
  lines.push("## Optimization Experiments");
  lines.push("");

  // Group routes by category ONCE — every experiment gates on and renders the
  // SAME list, so a fired experiment always has a non-empty route line.
  const byCat = new Map<RouteCategory, typeof routes>();
  for (const r of routes) {
    const c = classifyRoute(r.path);
    const arr = byCat.get(c);
    if (arr) arr.push(r); else byCat.set(c, [r]);
  }
  const catRoutes = (c: RouteCategory): typeof routes => byCat.get(c) ?? [];
  const routeList = (rs: typeof routes): string => rs.map(r => `\`${mdCode(r.method)} ${mdCode(r.path)}\``).join(", ");

  let expIdx = 1;

  if (catRoutes("signup").length > 0) {
    lines.push(`### Experiment ${expIdx++}: Sign Up Flow`);
    lines.push("");
    lines.push(`- **Route**: ${routeList(catRoutes("signup"))}`);
    lines.push("- **Hypothesis**: Reducing signup form fields will increase completion rate by 25%");
    lines.push("- **Metric**: Signup conversion rate, time to complete");
    lines.push("- **Variants**: A: Current form | B: Progressive disclosure (email first, rest later)");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (catRoutes("auth").length > 0 && catRoutes("signup").length === 0) {
    lines.push(`### Experiment ${expIdx++}: Authentication Flow`);
    lines.push("");
    lines.push(`- **Route**: ${routeList(catRoutes("auth"))}`);
    lines.push("- **Hypothesis**: Social OAuth login will increase conversion by 30%");
    lines.push("- **Metric**: Login success rate, abandonment rate");
    lines.push("- **Variants**: A: Email/password only | B: OAuth (GitHub, Google) as primary");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (catRoutes("dashboard").length > 0) {
    lines.push(`### Experiment ${expIdx++}: Dashboard First-Value`);
    lines.push("");
    lines.push(`- **Route**: ${routeList(catRoutes("dashboard"))}`);
    lines.push("- **Hypothesis**: Showing key metrics immediately will increase 7-day retention by 20%");
    lines.push("- **Metric**: Time to first meaningful action, 7-day return rate");
    lines.push("- **Variants**: A: Current dashboard | B: Pre-populated demo data on first login");
    lines.push("- **Duration**: 3 weeks");
    lines.push("");
  }

  if (catRoutes("pricing").length > 0) {
    lines.push(`### Experiment ${expIdx++}: Pricing Page`);
    lines.push("");
    lines.push(`- **Route**: ${routeList(catRoutes("pricing"))}`);
    lines.push("- **Hypothesis**: Highlighting the most popular plan will increase paid conversion by 15%");
    lines.push("- **Metric**: Plan selection rate, paid conversion");
    lines.push("- **Variants**: A: Equal weight pricing table | B: \"Most Popular\" badge on mid-tier");
    lines.push("- **Duration**: 2 weeks");
    lines.push("");
  }

  if (catRoutes("api").length > 0) {
    lines.push(`### Experiment ${expIdx++}: API First-Call Success`);
    lines.push("");
    lines.push(`- **Routes**: ${routeList(catRoutes("api").slice(0, 3))}`);
    lines.push("- **Hypothesis**: An interactive API playground will increase developer activation by 40%");
    lines.push("- **Metric**: Time to first successful API call, developer satisfaction");
    lines.push("- **Variants**: A: Static API docs | B: Live try-it-now console in docs");
    lines.push("- **Duration**: 4 weeks");
    lines.push("");
  }

  if (catRoutes("docs").length > 0) {
    lines.push(`### Experiment ${expIdx++}: Documentation Navigation`);
    lines.push("");
    lines.push(`- **Route**: ${routeList(catRoutes("docs"))}`);
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
  lines.push(`- **Context**: ${routes.length} routes — users need a path through the complexity`);
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
        lines.push(`- \`${mdCode(f.path)}\``);
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
  const routes = displayRoutes(ctx.routes);
  const frameworks = ctx.detection.frameworks;

  const pageRoutes = routes.filter(r => r.method === "GET" && !isApiRoute(r.path));

  const lines: string[] = [];
  lines.push(`# A/B Test Plan — ${mdText(id.name)}`);
  lines.push("");
  // No "Generated:" line — generated_at is zeroed for deterministic output (would
  // print 1970), and it made this one artifact's bytes depend on upload time.
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
  lines.push(`| Target page | ${mdInline(pageRoutes.find(r => r.path === "/")?.path ?? "/")} |`);
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
  lines.push(`| A | Feature-focused: \"${mdInline(id.name)} — [lead with your standout feature]\" |`);
  lines.push(`| B | Outcome-focused: \"[lead with the outcome your users get]\" |`);
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
  lines.push(`| A | \"[your primary action — e.g. Get Started]\" | Primary |`);
  lines.push(`| B | \"Try ${mdInline(id.name)} Free\" | Accent |`);
  lines.push("");

  // Test 3: Pricing
  lines.push("### Test 3: Pricing Page Layout");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|-----------|-------|");
  // Derive the pricing target from a real detected route; only fall back to the
  // /pricing placeholder (marked as such) when the repo has no pricing page.
  const pricingRoute = pageRoutes.find(r => /pric|plan|billing|subscri/i.test(r.path));
  lines.push(`| Target page | ${pricingRoute ? mdInline(pricingRoute.path) : "/pricing (no pricing route detected — placeholder)"} |`);
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

// ─── app_42: structured sequence data for the real send pipeline ──────────
//
// generateSequencePack above renders a human-readable content BRIEF (bullet
// outlines of what each email should say, not drafted prose) — deliberately
// left untouched here, same reasoning as app_23's artifacts-bundler.ts not
// touching generateDashboardWidget: it is a core, deterministic generator
// with its own tests and consumers, and widening its blast radius for an
// Apply-time concern (sending) is the wrong layer.
//
// This is a SEPARATE, additive extraction of the same content as real data
// (subject/delay/body), for apps/api's marketing send pipeline to consume
// without re-deriving it from parsed markdown. Because it does not share
// code with generateSequencePack, the two could in principle drift — closed
// by generators-marketing-sequences.test.ts's cross-check, which parses the
// REAL generateSequencePack markdown and asserts every subject line and day
// offset here actually appears in it. That test fails loudly on drift; nothing
// here asserts non-drift by construction.

export interface MarketingSequenceStep {
  /** e.g. "Email 1: Welcome" — matches the ### heading in sequence-pack.md, minus the day suffix. */
  label: string;
  delay_days: number;
  /** Extra heading context beyond "(Day N)", e.g. "After First PR". Rare — most steps have none. */
  heading_suffix?: string;
  subject: string;
  /** Raw bullet lines — a content brief for a human to draft real copy from, not send-ready prose. */
  body_bullets: string[];
}

export interface MarketingSequenceDefinition {
  sequence_name: string;
  steps: MarketingSequenceStep[];
}

/** Same data generateSequencePack renders as markdown, structured for the send pipeline. */
export function buildMarketingSequences(ctx: ContextMap): MarketingSequenceDefinition[] {
  const id = ctx.project_identity;
  const topModels = ctx.domain_models.slice(0, 3);
  const topAbstraction = ctx.ai_context.key_abstractions[0];
  const conventions = ctx.ai_context.conventions.slice(0, 3);

  const email2Bullets: string[] = [];
  if (topModels.length > 0) {
    email2Bullets.push(
      `Detected domain entities to consider featuring: ${topModels.map((m) => `**${mdText(m.name)}**`).join(", ")}`,
    );
    email2Bullets.push("Pick the most user-facing one and show how to create/interact with it end-to-end");
  } else if (topAbstraction) {
    email2Bullets.push(`Highlight a detected key abstraction: **${mdText(topAbstraction)}**`);
  } else {
    email2Bullets.push("Highlight the primary use case and core value proposition");
  }
  email2Bullets.push("Step-by-step walkthrough with code/screenshots");
  email2Bullets.push("CTA: Try this feature");

  const email3Bullets: string[] = ["Advanced tip or lesser-known feature"];
  for (const c of conventions) email3Bullets.push(`Pro convention: ${mdText(c)}`);
  email3Bullets.push("Link to documentation or example repo");
  email3Bullets.push("CTA: Explore advanced docs");

  return [
    {
      sequence_name: "Welcome Sequence (Post-Install)",
      steps: [
        {
          label: "Email 1: Welcome",
          delay_days: 0,
          subject: `Welcome to ${mdText(id.name)} — here's your quickstart`,
          body_bullets: [
            `Brief welcome and what ${mdText(id.name)} does`,
            "Link to quickstart guide",
            "One concrete example they can try in 2 minutes",
            "CTA: Try the quickstart",
          ],
        },
        {
          label: "Email 2: Core Feature",
          delay_days: 2,
          subject: `Getting started with ${mdText(id.name)}'s core concepts`,
          body_bullets: email2Bullets,
        },
        {
          label: "Email 3: Power User Tip",
          delay_days: 5,
          subject: `Level up your ${mdText(id.name)} usage`,
          body_bullets: email3Bullets,
        },
      ],
    },
    {
      sequence_name: "Re-engagement Sequence (Inactive 14+ days)",
      steps: [
        {
          label: "Email 1: What's New",
          delay_days: 14,
          subject: `${mdText(id.name)} updates you may have missed`,
          body_bullets: [
            "Summary of recent updates / changelog highlights",
            "One compelling new feature or improvement",
            "CTA: Check out what's new",
          ],
        },
        {
          label: "Email 2: Community Highlight",
          delay_days: 21,
          subject: `See what others are building with ${mdText(id.name)}`,
          body_bullets: [
            "Community showcase or case study",
            "User testimonial or success story",
            "CTA: Join the community",
          ],
        },
      ],
    },
    {
      sequence_name: "Contributor Outreach Sequence",
      steps: [
        {
          label: "Email 1: Thank You",
          delay_days: 0,
          heading_suffix: "After First PR",
          subject: `Thanks for contributing to ${mdText(id.name)}!`,
          body_bullets: [
            "Genuine thank you for their contribution",
            "Explain the impact of their change",
            "Link to contributor guide for next steps",
            "CTA: Pick up another issue",
          ],
        },
      ],
    },
  ];
}
