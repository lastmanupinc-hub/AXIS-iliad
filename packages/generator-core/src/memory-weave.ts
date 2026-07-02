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
const MEMORY_MARKER_START = "<!-- axis:project-memory:start -->";
const MEMORY_MARKER_END = "<!-- axis:project-memory:end -->";

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

/** Wrap a section in the delimiter pair so a later weave can find and replace it. */
function delimitedSection(section: string): string {
  return `${MEMORY_MARKER_START}\n${section}\n${MEMORY_MARKER_END}`;
}

/**
 * Inject the delimited section into `content`, or — if the delimiter pair is
 * already present (a prior weave) — replace everything between the markers
 * (inclusive) with the fresh block. Refresh, not skip: the surrounding content
 * (before/after the markers) is left untouched either way.
 */
function injectOrReplaceSection(content: string, section: string): string {
  const block = delimitedSection(section);
  const startIdx = content.indexOf(MEMORY_MARKER_START);
  const endIdx = content.indexOf(MEMORY_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.slice(0, startIdx) + block + content.slice(endIdx + MEMORY_MARKER_END.length);
  }
  return `${content}\n\n${block}\n`;
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
 * Weave the project's memory into a generation result IN PLACE: inject the
 * delimited "Decisions already made" section into AGENTS.md and CLAUDE.md when
 * present, and add/refresh a standalone project-memory.md artifact (program
 * "skills"). REFRESH, not skip: a package that already carries a woven package
 * (e.g. one persisted by the MCP path) gets its memory replaced with the
 * current entries rather than frozen at first-weave state — the delimiters are
 * exactly what let a later call find and replace its own prior output without
 * touching anything else in the file or duplicating the section. Best-effort
 * (a throw is swallowed) and a no-op on empty entries or an empty package
 * (an existing artifact is left as-is, not cleared).
 */
export function appendMemoryWeave(generated: GeneratorResult, entries: WovenMemoryEntry[]): void {
  try {
    if (!generated.files.length) return;
    if (!entries.length) return;

    const section = buildMemorySection(entries);
    if (!section) return;

    for (const f of generated.files) {
      if (f.path === "AGENTS.md" || f.path === "CLAUDE.md") {
        f.content = injectOrReplaceSection(f.content, section);
      }
    }

    const path = "project-memory.md";
    const content = buildProjectMemoryArtifact(entries);
    const existing = generated.files.find((f) => f.path === path);
    if (existing) {
      existing.content = content;
    } else {
      const file: GeneratedFile = {
        path,
        content,
        content_type: "text/markdown",
        program: MEMORY_PROGRAM,
        description: "Decisions, conventions, evidence, and goals recorded for this project — read by every new agent session.",
      };
      generated.files.push(file);
    }
  } catch {
    // Best-effort; the generated package already succeeded.
  }
}
