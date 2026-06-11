import type { RepoAnalysis } from "../pipeline.js";
import { MARKDOWN_MARKER, finalize } from "../marker.js";
import { buildCanonicalBody } from "./canonical.js";

/** Canonical AGENTS.md — the source-of-truth agent context file. */
export function emitAgentsMd(analysis: RepoAnalysis): string {
  const name = analysis.contextMap.project_identity.name;
  const lines: string[] = [
    MARKDOWN_MARKER,
    `# AGENTS.md — ${name}`,
    "",
    "Instructions for AI coding agents working in this repository.",
    "",
    ...buildCanonicalBody(analysis),
  ];
  return finalize(lines);
}
