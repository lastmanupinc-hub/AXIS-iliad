import type { RepoAnalysis } from "../pipeline.js";
import { MARKDOWN_MARKER, finalize } from "../marker.js";
import { buildImperativeRules } from "./canonical.js";

/** Condensed .github/copilot-instructions.md — short rules for GitHub Copilot. */
export function emitCopilotInstructions(analysis: RepoAnalysis): string {
  const ctx = analysis.contextMap;
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(MARKDOWN_MARKER);
  lines.push(`# Copilot Instructions — ${id.name}`);
  lines.push("");
  lines.push(ctx.ai_context.project_summary);
  lines.push("");

  lines.push("## Rules");
  lines.push("");
  for (const rule of buildImperativeRules(ctx)) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  const pm = ctx.detection.package_managers[0] ?? "npm";
  lines.push("## Commands");
  lines.push("");
  lines.push(`- Install: \`${pm} install\``);
  if (ctx.detection.build_tools.length > 0) lines.push(`- Build: \`${pm} run build\``);
  if (ctx.detection.test_frameworks.length > 0) lines.push(`- Test: \`${pm} test\``);
  lines.push("");

  if (ctx.ai_context.key_abstractions.length > 0) {
    lines.push("## Layout");
    lines.push("");
    for (const a of ctx.ai_context.key_abstractions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  return finalize(lines);
}
