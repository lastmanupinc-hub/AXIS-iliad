// ─── Fleet Report — cross-project intelligence for multi-repo accounts ──
//
// Pillar 4 (breadth): once an account has ≥2 analyzed projects, each repo
// added makes every other repo's analysis sharper. Computed on demand from
// the latest ContextMap + a few memory decisions per project — nothing
// persisted, no migration. Account-level surface, NOT a counted generator.
//
// Pure + deterministic: f(latest context maps, memory decisions). Input
// order never matters — everything sorts by project_name before rendering.

import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile } from "./types.js";
import { mdInline } from "./md-sanitize.js";

const FLEET_PROGRAM = "fleet";
export const FLEET_MIN_PROJECTS = 2;
export const FLEET_MAX_PROJECTS = 25;

export interface FleetProjectInput {
  project_name: string;
  ctx: ContextMap;
  /** Newest-first decision contents (≤5), already loaded at the surface. May be empty. */
  memory_decisions: string[];
}

interface SharedEntry {
  name: string;
  projects: string[];
}

/** Frameworks/languages/warnings/conventions overlapping across >= minCount projects, by exact-string key. */
function computeShared(projects: FleetProjectInput[], extract: (p: FleetProjectInput) => string[], minCount = 2): SharedEntry[] {
  const map = new Map<string, Set<string>>();
  for (const p of projects) {
    for (const raw of extract(p)) {
      if (!raw) continue;
      if (!map.has(raw)) map.set(raw, new Set());
      map.get(raw)!.add(p.project_name);
    }
  }
  return [...map.entries()]
    .filter(([, projSet]) => projSet.size >= minCount)
    .map(([name, projSet]) => ({ name, projects: [...projSet].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function frameworkNames(p: FleetProjectInput): string[] {
  return (p.ctx.detection?.frameworks ?? []).map((f) => f?.name).filter((n): n is string => Boolean(n));
}

function languageNames(p: FleetProjectInput): string[] {
  return (p.ctx.detection?.languages ?? []).map((l) => l?.name).filter((n): n is string => Boolean(n));
}

function warningStrings(p: FleetProjectInput): string[] {
  return p.ctx.ai_context?.warnings ?? [];
}

function conventionStrings(p: FleetProjectInput): string[] {
  return p.ctx.ai_context?.conventions ?? [];
}

/** First 3 framework names joined, "+N" for the rest; "—" when there are none. */
function joinFrameworks(p: FleetProjectInput): string {
  const names = frameworkNames(p);
  if (!names.length) return "—";
  const shown = names.slice(0, 3);
  const overflow = names.length - shown.length;
  return shown.join(", ") + (overflow > 0 ? ` +${overflow}` : "");
}

function buildFleetReportMd(shown: FleetProjectInput[], overflowCount: number): string {
  const lines: string[] = [`# Fleet Report — ${shown.length} projects`, ""];
  if (overflowCount > 0) {
    lines.push(
      `_Showing the first ${shown.length} of ${shown.length + overflowCount} projects (alphabetical) — export analyses for the rest to include them._`,
      "",
    );
  }

  lines.push("## Projects", "", "| Project | Language | LOC | Frameworks | Warnings |", "| --- | --- | --- | --- | --- |");
  for (const p of shown) {
    const lang = p.ctx.project_identity?.primary_language ?? "—";
    const loc = p.ctx.structure?.total_loc ?? 0;
    const warnCount = warningStrings(p).length;
    lines.push(`| ${p.project_name} | ${lang} | ${loc} | ${joinFrameworks(p)} | ${warnCount} |`);
  }
  lines.push("");

  const sharedFrameworks = computeShared(shown, frameworkNames);
  const sharedLanguages = computeShared(shown, languageNames);
  if (sharedFrameworks.length || sharedLanguages.length) {
    lines.push("## Shared stack", "");
    if (sharedFrameworks.length) {
      lines.push("**Frameworks:**");
      for (const e of sharedFrameworks) lines.push(`- ${e.name} — ${e.projects.length} projects: ${e.projects.join(", ")}`);
      lines.push("");
    }
    if (sharedLanguages.length) {
      lines.push("**Languages:**");
      for (const e of sharedLanguages) lines.push(`- ${e.name} — ${e.projects.length} projects: ${e.projects.join(", ")}`);
      lines.push("");
    }
  }

  const sharedWarnings = computeShared(shown, warningStrings);
  if (sharedWarnings.length) {
    lines.push("## Org-wide warnings", "");
    for (const e of sharedWarnings) lines.push(`- "${e.name}" — ${e.projects.length} projects: ${e.projects.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function buildFleetClaudeMd(shown: FleetProjectInput[]): string {
  const n = shown.length;
  const lines: string[] = [
    `# CLAUDE.md — ${n}-project fleet`,
    "",
    "> How this organization builds — computed from the latest analysis of each project. Read your project's own CLAUDE.md first; this file adds the cross-repo context.",
    "",
  ];

  const threshold = Math.ceil(n / 2);
  const stack = new Map<string, number>();
  for (const e of computeShared(shown, frameworkNames, threshold)) stack.set(e.name, e.projects.length);
  for (const e of computeShared(shown, languageNames, threshold)) stack.set(e.name, e.projects.length);
  const stackEntries = [...stack.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (stackEntries.length) {
    lines.push("## Stack", "");
    for (const [name, count] of stackEntries) lines.push(`- ${name} — ${count}/${n} projects`);
    lines.push("");
  }

  const conventions = computeShared(shown, conventionStrings);
  if (conventions.length) {
    lines.push("## Conventions", "");
    for (const e of conventions) lines.push(`- "${e.name}" — ${e.projects.length} projects`);
    lines.push("");
  }

  const withDecisions = shown.filter((p) => p.memory_decisions.length > 0);
  if (withDecisions.length) {
    lines.push("## Decisions already made across this fleet", "");
    for (const p of withDecisions) {
      lines.push(`### ${p.project_name}`, "");
      for (const d of p.memory_decisions) lines.push(`- ${mdInline(d)}`);
      lines.push("");
    }
  }

  lines.push("---", "");
  lines.push(`_Computed from real analyses of ${n} projects — every line is a cross-repo fact, not an inference._`);
  return lines.join("\n").trimEnd();
}

/**
 * Pure. Exactly 2 files (fleet-report.md, fleet-CLAUDE.md), or null when
 * fewer than FLEET_MIN_PROJECTS were provided. Sorts by project_name before
 * rendering (deterministic regardless of caller order); uses at most
 * FLEET_MAX_PROJECTS (alphabetical), noting any overflow. Never calls Date.
 */
export function buildFleetReport(projects: FleetProjectInput[]): GeneratedFile[] | null {
  if (projects.length < FLEET_MIN_PROJECTS) return null;

  // Sanitize project_name once at the entry point (never at the store — it's a
  // uniqueness key there) so every downstream table row, heading, and
  // computeShared join is covered without touching each render site.
  const sorted = projects
    .map((p) => ({ ...p, project_name: mdInline(p.project_name) }))
    .sort((a, b) => a.project_name.localeCompare(b.project_name));
  const shown = sorted.slice(0, FLEET_MAX_PROJECTS);
  const overflow = sorted.length - shown.length;

  return [
    {
      path: "fleet-report.md",
      content: buildFleetReportMd(shown, overflow),
      content_type: "text/markdown",
      program: FLEET_PROGRAM,
      description: "Portfolio health across this account's projects — shared stack, org-wide warnings, per-project stats.",
    },
    {
      path: "fleet-CLAUDE.md",
      content: buildFleetClaudeMd(shown),
      content_type: "text/markdown",
      program: FLEET_PROGRAM,
      description: "How this organization builds — cross-repo conventions, shared stack, and recorded decisions.",
    },
  ];
}
