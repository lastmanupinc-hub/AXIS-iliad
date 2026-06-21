import type { RepoAnalysis } from "../pipeline.js";
import { MARKDOWN_MARKER, finalize } from "../marker.js";
import { buildCanonicalBody } from "./canonical.js";

/** GEMINI.md — canonical content with a Gemini heading. */
export function emitGeminiMd(analysis: RepoAnalysis): string {
  const name = analysis.contextMap.project_identity.name;
  const lines: string[] = [
    MARKDOWN_MARKER,
    `# GEMINI.md — ${name}`,
    "",
    "Guidance for Gemini agents when working in this repository.",
    "",
    ...buildCanonicalBody(analysis),
  ];
  return finalize(lines);
}
