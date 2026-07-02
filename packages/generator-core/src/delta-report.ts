// ─── Delta Report — the first compounding surface ───────────────
//
// The second analysis of a repo ships a deterministic narrative of what
// changed since the previous snapshot: computed diffs only, never inference.
// It only exists because history exists — appended at the surface like
// appendProgramFunnel / appendAutonomyLoop, before either of them so the
// funnel + loop sequence picks it up.
//
// Pure + deterministic: same prev/curr ContextMap ⇒ byte-identical output.

import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";
import { mdInline } from "./md-sanitize.js";

const DELTA_PROGRAM = "skills";
const ROUTE_TRUNCATE_AT = 15;

export interface DeltaSummary {
  changed: boolean;
  sections: number;
}

interface Section {
  markdown: string;
  fragments: string[];
}

/** N-and-noun with basic pluralization, e.g. frag(1, "warning resolved") → "1 warning resolved". */
function frag(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** Added/removed by a string key, each side sorted for deterministic output order. */
function diffByKey<T>(prev: T[], curr: T[], keyFn: (item: T) => string): { added: T[]; removed: T[] } {
  const prevKeys = new Set(prev.map(keyFn));
  const currKeys = new Set(curr.map(keyFn));
  const byKey = (a: T, b: T) => keyFn(a).localeCompare(keyFn(b));
  return {
    added: curr.filter((item) => !prevKeys.has(keyFn(item))).sort(byKey),
    removed: prev.filter((item) => !currKeys.has(keyFn(item))).sort(byKey),
  };
}

function stackSection(prev: ContextMap, curr: ContextMap): Section | null {
  const prevFw = prev.detection?.frameworks ?? [];
  const currFw = curr.detection?.frameworks ?? [];
  const { added, removed } = diffByKey(prevFw, currFw, (f) => f.name);
  const prevByName = new Map(prevFw.map((f) => [f.name, f]));
  const currByName = new Map(currFw.map((f) => [f.name, f]));
  const changed = [...currByName.keys()]
    .filter((n) => prevByName.has(n) && (prevByName.get(n)!.version ?? null) !== (currByName.get(n)!.version ?? null))
    .sort((a, b) => a.localeCompare(b));

  if (!added.length && !removed.length && !changed.length) return null;

  const lines = ["## Stack", ""];
  const fragments: string[] = [];
  if (added.length) {
    fragments.push(frag(added.length, "framework added", "frameworks added"));
    lines.push("**Added:**", ...added.map((f) => `- ${f.name}`), "");
  }
  if (removed.length) {
    fragments.push(frag(removed.length, "framework removed", "frameworks removed"));
    lines.push("**Removed:**", ...removed.map((f) => `- ${f.name}`), "");
  }
  if (changed.length) {
    fragments.push(frag(changed.length, "framework version changed", "framework versions changed"));
    lines.push(
      "**Version changed:**",
      ...changed.map((n) => `- ${n}: ${prevByName.get(n)!.version ?? "none"} → ${currByName.get(n)!.version ?? "none"}`),
      "",
    );
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

function routesSection(prev: ContextMap, curr: ContextMap): Section | null {
  const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;
  const { added, removed } = diffByKey(prev.routes ?? [], curr.routes ?? [], key);
  if (!added.length && !removed.length) return null;

  const lines = ["## Routes", ""];
  const fragments: string[] = [];
  const renderList = (label: string, items: Array<{ method: string; path: string }>) => {
    lines.push(`**${label}:**`);
    lines.push(...items.slice(0, ROUTE_TRUNCATE_AT).map((r) => `- ${key(r)}`));
    if (items.length > ROUTE_TRUNCATE_AT) lines.push(`… +${items.length - ROUTE_TRUNCATE_AT} more`);
    lines.push("");
  };
  if (added.length) {
    fragments.push(frag(added.length, "route added", "routes added"));
    renderList("Added", added);
  }
  if (removed.length) {
    fragments.push(frag(removed.length, "route removed", "routes removed"));
    renderList("Removed", removed);
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

function domainModelsSection(prev: ContextMap, curr: ContextMap): Section | null {
  const prevModels = prev.domain_models ?? [];
  const currModels = curr.domain_models ?? [];
  const { added, removed } = diffByKey(prevModels, currModels, (m) => m.name);
  const prevByName = new Map(prevModels.map((m) => [m.name, m]));
  const currByName = new Map(currModels.map((m) => [m.name, m]));
  const changed = [...currByName.keys()]
    .filter((n) => prevByName.has(n) && prevByName.get(n)!.field_count !== currByName.get(n)!.field_count)
    .sort((a, b) => a.localeCompare(b));

  if (!added.length && !removed.length && !changed.length) return null;

  const lines = ["## Domain Models", ""];
  const fragments: string[] = [];
  if (added.length) {
    fragments.push(frag(added.length, "model added", "models added"));
    lines.push("**Added:**", ...added.map((m) => `- ${m.name}`), "");
  }
  if (removed.length) {
    fragments.push(frag(removed.length, "model removed", "models removed"));
    lines.push("**Removed:**", ...removed.map((m) => `- ${m.name}`), "");
  }
  if (changed.length) {
    fragments.push(frag(changed.length, "model changed", "models changed"));
    lines.push(
      "**Field count changed:**",
      ...changed.map((n) => `- ${n}: ${prevByName.get(n)!.field_count} → ${currByName.get(n)!.field_count} fields`),
      "",
    );
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

function hotspotsSection(prev: ContextMap, curr: ContextMap): Section | null {
  const key = (h: { path: string }) => h.path;
  const { added: entered, removed: left } = diffByKey(
    prev.dependency_graph?.hotspots ?? [],
    curr.dependency_graph?.hotspots ?? [],
    key,
  );
  if (!entered.length && !left.length) return null;

  const lines = ["## Hotspots", ""];
  if (entered.length) lines.push("**Entered:**", ...entered.map((h) => `- ${h.path}`), "");
  if (left.length) lines.push("**Left:**", ...left.map((h) => `- ${h.path}`), "");
  return { markdown: lines.join("\n").trimEnd(), fragments: [frag(entered.length + left.length, "hotspot changed", "hotspots changed")] };
}

function warningsSection(prev: ContextMap, curr: ContextMap): Section | null {
  const prevW = prev.ai_context?.warnings ?? [];
  const currW = curr.ai_context?.warnings ?? [];
  const currSet = new Set(currW);
  const prevSet = new Set(prevW);
  const resolved = prevW.filter((w) => !currSet.has(w)).sort((a, b) => a.localeCompare(b));
  const fresh = currW.filter((w) => !prevSet.has(w)).sort((a, b) => a.localeCompare(b));
  if (!resolved.length && !fresh.length) return null;

  const lines = ["## Warnings", ""];
  const fragments: string[] = [];
  // Resolved warnings are the win — render first.
  if (resolved.length) {
    fragments.push(frag(resolved.length, "warning resolved", "warnings resolved"));
    lines.push("**✓ Resolved:**", ...resolved.map((w) => `- ${w}`), "");
  }
  if (fresh.length) {
    fragments.push(frag(fresh.length, "new warning", "new warnings"));
    lines.push("**New:**", ...fresh.map((w) => `- ${w}`), "");
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

function entryPointsSection(prev: ContextMap, curr: ContextMap): Section | null {
  const key = (e: { path: string }) => e.path;
  const { added, removed } = diffByKey(prev.entry_points ?? [], curr.entry_points ?? [], key);
  if (!added.length && !removed.length) return null;

  const lines = ["## Entry Points", ""];
  const fragments: string[] = [];
  if (added.length) {
    fragments.push(frag(added.length, "entry point added", "entry points added"));
    lines.push("**Added:**", ...added.map((e) => `- ${e.path}`), "");
  }
  if (removed.length) {
    fragments.push(frag(removed.length, "entry point removed", "entry points removed"));
    lines.push("**Removed:**", ...removed.map((e) => `- ${e.path}`), "");
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

/** Sum LOC per language from the file_tree_summary aggregate (files only). */
function languageTotals(ctx: ContextMap): Map<string, number> {
  const totals = new Map<string, number>();
  for (const f of ctx.structure?.file_tree_summary ?? []) {
    if (f.type !== "file" || !f.language) continue;
    totals.set(f.language, (totals.get(f.language) ?? 0) + (f.loc ?? 0));
  }
  return totals;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function sizeSection(prev: ContextMap, curr: ContextMap): Section | null {
  const prevTotal = prev.structure?.total_loc ?? 0;
  const currTotal = curr.structure?.total_loc ?? 0;
  const totalDelta = currTotal - prevTotal;

  const prevLangs = languageTotals(prev);
  const currLangs = languageTotals(curr);
  const langDeltas = [...new Set([...prevLangs.keys(), ...currLangs.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((lang) => ({ lang, prev: prevLangs.get(lang) ?? 0, curr: currLangs.get(lang) ?? 0 }))
    .filter((d) => d.curr - d.prev !== 0);

  if (totalDelta === 0 && !langDeltas.length) return null;

  const lines = ["## Size", ""];
  const fragments: string[] = [];
  if (totalDelta !== 0) {
    fragments.push(`total LOC ${signed(totalDelta)}`);
    lines.push(`Total LOC: ${prevTotal} → ${currTotal} (${signed(totalDelta)})`, "");
  }
  if (langDeltas.length) {
    // totalDelta === 0 here means the mix shifted without moving the total — still a
    // real, summary-worthy change, so it needs its own fragment (unlike the
    // total-LOC fragment above, which only fires when totalDelta !== 0).
    if (totalDelta === 0) fragments.push(frag(langDeltas.length, "language mix shifted", "language mixes shifted"));
    lines.push(
      "**Per-language:**",
      ...langDeltas.map((d) => `- ${d.lang}: ${d.prev} → ${d.curr} (${signed(d.curr - d.prev)})`),
      "",
    );
  }
  return { markdown: lines.join("\n").trimEnd(), fragments };
}

function summarizeDelta(sections: Section[]): DeltaSummary {
  return { changed: sections.length > 0, sections: sections.length };
}

/** Pure. Returns the markdown body, or null when nothing meaningful changed. */
export function buildDeltaReport(prev: ContextMap, curr: ContextMap): string | null {
  const sections = [
    stackSection(prev, curr),
    routesSection(prev, curr),
    domainModelsSection(prev, curr),
    hotspotsSection(prev, curr),
    warningsSection(prev, curr),
    entryPointsSection(prev, curr),
    sizeSection(prev, curr),
  ].filter((s): s is Section => s !== null);

  const summary = summarizeDelta(sections);
  if (!summary.changed) return null;

  const name = mdInline(curr.project_identity?.name ?? "this project");
  const fragments = sections.flatMap((s) => s.fragments);

  const lines: string[] = [];
  lines.push(`# Delta Report — ${name}`);
  lines.push("");
  lines.push(`Since the last snapshot: ${fragments.join(", ")}.`);
  lines.push("");
  for (const s of sections) lines.push(s.markdown, "");
  lines.push("---");
  lines.push("");
  lines.push("_Computed from snapshot-to-snapshot comparison — every line above is a real diff, not an inference._");
  return lines.join("\n");
}

/**
 * Weave the delta report into a generation result IN PLACE: append a single
 * delta-report.md artifact when buildDeltaReport finds a meaningful change.
 * Best-effort (a throw is swallowed) and idempotent (skips if already added).
 * Call BEFORE appendProgramFunnel so the funnel + loop sequence picks it up.
 */
export function appendDeltaReport(generated: GeneratorResult, prev: ContextMap, curr: ContextMap): void {
  try {
    if (!generated.files.length) return;
    const path = "delta-report.md";
    if (generated.files.some((f) => f.path === path)) return;
    const content = buildDeltaReport(prev, curr);
    if (!content) return;
    const file: GeneratedFile = {
      path,
      content,
      content_type: "text/markdown",
      program: DELTA_PROGRAM,
      description: "What changed since the previous snapshot — computed diffs across stack, routes, models, hotspots, warnings, and size.",
    };
    generated.files.push(file);
  } catch {
    // Best-effort; the generated package already succeeded.
  }
}
