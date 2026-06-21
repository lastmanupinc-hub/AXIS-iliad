import type { RepoAnalysis } from "../pipeline.js";
import { MARKDOWN_MARKER, finalize } from "../marker.js";
import { buildCanonicalBody } from "./canonical.js";

/** CLAUDE.md — canonical content with a Claude Code heading. */
export function emitClaudeMd(analysis: RepoAnalysis): string {
  const name = analysis.contextMap.project_identity.name;
  const lines: string[] = [
    MARKDOWN_MARKER,
    `# CLAUDE.md — ${name}`,
    "",
    "Guidance for Claude Code when working in this repository.",
    "",
    ...buildCanonicalBody(analysis),
  ];
  return finalize(lines);
}
