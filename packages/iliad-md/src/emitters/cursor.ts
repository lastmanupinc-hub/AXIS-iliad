import type { RepoAnalysis } from "../pipeline.js";
import { HASH_MARKER, finalize } from "../marker.js";
import { buildImperativeRules } from "./canonical.js";

/** Condensed .cursorrules — imperative rule lines (plain text, # comments). */
export function emitCursorRules(analysis: RepoAnalysis): string {
  const ctx = analysis.contextMap;
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(HASH_MARKER);
  lines.push(`# ${id.name} — ${id.type.replace(/_/g, " ")} | ${id.primary_language}`);
  const fws = ctx.detection.frameworks.map((f) => f.name).join(", ");
  if (fws) lines.push(`# Stack: ${fws}`);
  lines.push("");

  for (const rule of buildImperativeRules(ctx)) {
    lines.push(rule);
  }
  lines.push("");

  if (ctx.ai_context.key_abstractions.length > 0) {
    lines.push("# Key directories:");
    for (const a of ctx.ai_context.key_abstractions) {
      lines.push(`#   ${a}`);
    }
    lines.push("");
  }

  if (ctx.domain_models.length > 0) {
    lines.push("# Domain models:");
    for (const m of ctx.domain_models.slice(0, 20)) {
      lines.push(`#   ${m.name} (${m.kind}, ${m.field_count} fields) @ ${m.source_file}`);
    }
    if (ctx.domain_models.length > 20) {
      lines.push(`#   ... and ${ctx.domain_models.length - 20} more`);
    }
    lines.push("");
  }

  return finalize(lines);
}
