// ─── Memory Weave — read the project brain back into generation ─
//
// WO-05 gave every project a memory API (decisions, conventions, evidence,
// goals). This layer closes the loop: generation output carries that memory
// forward — a "Decisions already made" section in the context files, plus a
// standalone project-memory.md that teaches the next agent how to keep
// writing to it. Appended at the surface (like appendDeltaReport /
// appendProgramFunnel), before appendAutonomyLoop so the artifact gets
// sequenced into the loop like any other markdown.
//
// Pure + deterministic: entries arrive as an explicit argument — this module
// never reads the store. Same entries ⇒ byte-identical output.

import type { GeneratorResult, GeneratedFile } from "./types.js";

const MEMORY_PROGRAM = "skills";
export const MEMORY_WEAVE_LIMIT = 50;

export interface WovenMemoryEntry {
  kind: "decision" | "convention" | "evidence" | "goal";
  content: string;
  source: string;
  created_at: string;
}

// Rendering order (deliberately not MEMORY_KINDS' storage order): decisions first
// (the highest-stakes "don't re-litigate" content), then the supporting context.
const KIND_ORDER: WovenMemoryEntry["kind"][] = ["decision", "convention", "goal", "evidence"];
const KIND_LABEL: Record<WovenMemoryEntry["kind"], string> = {
  decision: "Decisions",
  convention: "Conventions",
  goal: "Goals",
  evidence: "Evidence",
};

function renderEntryLine(e: WovenMemoryEntry): string {
  const meta = e.source ? `${e.source}, ${e.created_at}` : e.created_at;
  return `- ${e.content} _(${meta})_`;
}

/** The section body shared by both the woven-in-place section and the standalone artifact. */
function renderSectionLines(entries: WovenMemoryEntry[]): string[] {
  const shown = entries.slice(0, MEMORY_WEAVE_LIMIT);
  const lines: string[] = [];
  lines.push("## Decisions already made — do not re-litigate");
  lines.push("");
  lines.push("_Recorded by prior sessions via this project's memory API. Treat these as settled unless the human reopens them._");
  lines.push("");
  for (const kind of KIND_ORDER) {
    const group = shown.filter((e) => e.kind === kind);
    if (!group.length) continue;
    lines.push(`### ${KIND_LABEL[kind]}`);
    lines.push("");
    for (const e of group) lines.push(renderEntryLine(e));
    lines.push("");
  }
  if (entries.length > MEMORY_WEAVE_LIMIT) {
    lines.push(`_… +${entries.length - MEMORY_WEAVE_LIMIT} earlier entries omitted — full log via GET /v1/projects/{project_id}/memory._`);
    lines.push("");
  }
  return lines;
}

/** Pure. Markdown section body, or null when entries is empty. */
export function buildMemorySection(entries: WovenMemoryEntry[]): string | null {
  if (!entries.length) return null;
  return renderSectionLines(entries).join("\n").trimEnd();
}

function buildProjectMemoryArtifact(entries: WovenMemoryEntry[]): string {
  const shown = entries.slice(0, MEMORY_WEAVE_LIMIT);
  const lines: string[] = [`# Project Memory — ${shown.length} entries`, "", ...renderSectionLines(entries)];
  lines.push("---");
  lines.push("");
  lines.push(
    '_To add a new entry: `POST /v1/projects/{project_id}/memory` with `{"kind": "decision"|"convention"|"evidence"|"goal", "content": "...", "source": "optional"}`. ' +
      "Memory is append-only — record corrections as new decision entries rather than editing existing ones._",
  );
  return lines.join("\n");
}

/**
 * Weave the project's memory into a generation result IN PLACE: append the
 * "Decisions already made" section to AGENTS.md and CLAUDE.md when present,
 * and add a standalone project-memory.md artifact (program "skills"). Best-
 * effort (a throw is swallowed) and idempotent (skips entirely if
 * project-memory.md is already present, or if there's nothing to weave).
 */
export function appendMemoryWeave(generated: GeneratorResult, entries: WovenMemoryEntry[]): void {
  try {
    if (!generated.files.length) return;
    if (!entries.length) return;
    const path = "project-memory.md";
    if (generated.files.some((f) => f.path === path)) return;

    const section = buildMemorySection(entries);
    if (!section) return;

    for (const f of generated.files) {
      if (f.path === "AGENTS.md" || f.path === "CLAUDE.md") {
        f.content = `${f.content}\n\n${section}\n`;
      }
    }

    const file: GeneratedFile = {
      path,
      content: buildProjectMemoryArtifact(entries),
      content_type: "text/markdown",
      program: MEMORY_PROGRAM,
      description: "Decisions, conventions, evidence, and goals recorded for this project — read by every new agent session.",
    };
    generated.files.push(file);
  } catch {
    // Best-effort; the generated package already succeeded.
  }
}
