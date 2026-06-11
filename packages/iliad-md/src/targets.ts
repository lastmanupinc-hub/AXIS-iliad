import type { RepoAnalysis } from "./pipeline.js";
import { emitAgentsMd } from "./emitters/agents.js";
import { emitClaudeMd } from "./emitters/claude.js";
import { emitCursorRules } from "./emitters/cursor.js";
import { emitCopilotInstructions } from "./emitters/copilot.js";
import { emitGeminiMd } from "./emitters/gemini.js";

export interface Target {
  /** Short name used by --targets. */
  name: string;
  /** Output path relative to the repo root (forward slashes). */
  relPath: string;
  emit: (analysis: RepoAnalysis) => string;
}

export const ALL_TARGETS: readonly Target[] = [
  { name: "agents", relPath: "AGENTS.md", emit: emitAgentsMd },
  { name: "claude", relPath: "CLAUDE.md", emit: emitClaudeMd },
  { name: "cursor", relPath: ".cursorrules", emit: emitCursorRules },
  { name: "copilot", relPath: ".github/copilot-instructions.md", emit: emitCopilotInstructions },
  { name: "gemini", relPath: "GEMINI.md", emit: emitGeminiMd },
];

/** Resolve a comma-separated --targets value to Target entries. Throws on unknown names. */
export function selectTargets(csv?: string): Target[] {
  if (!csv) return [...ALL_TARGETS];
  const names = csv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) return [...ALL_TARGETS];
  const selected: Target[] = [];
  for (const n of names) {
    const target = ALL_TARGETS.find((t) => t.name === n);
    if (!target) {
      throw new Error(
        `Unknown target "${n}". Valid targets: ${ALL_TARGETS.map((t) => t.name).join(", ")}`,
      );
    }
    if (!selected.includes(target)) selected.push(target);
  }
  return selected;
}
