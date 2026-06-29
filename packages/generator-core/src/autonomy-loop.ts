// ─── Begin Loop — the self-referential autonomy control loop ────
//
// Iliad's artifacts orient an agent ("what IS this repo"). This layer adds the
// LOOP that lets an agent actually FINISH a (possibly non-technical) owner's idea:
// a convergent control cycle woven into the generated output.
//
//   begin.yaml          — the loop HEAD (session gate + move selector), generalized
//                         from Axis' own begin.yaml and parameterized to the repo.
//   continuation.yaml   — the loop STATE: an ordered step-list of every artifact +
//                         a priority-ranked candidate queue seeded from the analysis.
//   ⟳ Continue footer   — appended to every agent-readable (markdown) artifact: the
//                         command for continued iteration + a pointer to the next step.
//                         The TERMINAL step's footer is the literal self-prompt `begin`,
//                         sending the agent back to begin.yaml — closing the loop.
//
// It is CONVERGENT, not perpetual: the cycle ends when the candidate queue empties
// (idea built), a human stops it, a decision only the human can make is hit, or a
// candidate makes no progress across cycles. That stop condition is the safety rail
// when a non-coder hands the repo to an agent and says "begin".
//
// Pure + deterministic (no clock / no randomness): same analysis ⇒ byte-identical
// loop. Mirrors the quality-gate layer (appendQualityArtifacts) — appended at the
// surface so every analysis ships the loop without touching the 137 generators.

import type { ContextMap } from "@axis/context-engine";
import type { GeneratorResult, GeneratedFile } from "./types.js";

const BEGIN_PROGRAM = "begin";

/** A markdown artifact is one an agent reads as instructions (gets a continuation footer). */
function isMarkdown(f: GeneratedFile): boolean {
  return /\.(md|mdx)$/i.test(f.path) || (f.content_type ?? "").includes("markdown");
}

function asName(x: unknown): string | null {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string") return (x as { name: string }).name;
  return null;
}

/** Quote a value as a safe single-line YAML double-quoted scalar. */
function yq(s: string): string {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").trim()}"`;
}

/** Emit a multi-line value as a YAML block scalar at the given indent. */
function yblock(s: string, indent: string): string {
  const body = String(s)
    .trim()
    .split(/\r?\n/)
    .map((l) => `${indent}  ${l}`)
    .join("\n");
  return `>\n${body}`;
}

/** A short, human-readable stack label from the detection signals. */
function stackLabel(ctx: ContextMap): string {
  const fw = (ctx.detection?.frameworks ?? []).map(asName).filter(Boolean) as string[];
  const lang = (ctx.detection?.languages ?? []).map(asName).filter(Boolean) as string[];
  const parts = [...fw.slice(0, 3), ...lang.slice(0, 2)];
  return parts.length ? [...new Set(parts)].join(", ") : "the detected stack";
}

/**
 * The single most important field: what the owner wants built. We seed it from the
 * project identity but explicitly instruct the agent to CONFIRM it with the human
 * (in plain English) before building — a wrong goal is the costliest failure.
 */
function inferGoal(ctx: ContextMap): string {
  const name = ctx.project_identity?.name ?? "this project";
  return (
    `Complete the owner's idea for ${name}. This was inferred from the repo, NOT confirmed — ` +
    `before building, restate the goal in one plain-English sentence and ask the human "is this right?". ` +
    `Treat their answer as the authoritative goal and record it here in continuation.yaml.`
  );
}

/** Build candidate entries: the work queue, seeded from the analysis. Deterministic order. */
function buildCandidates(ctx: ContextMap): Array<{ id: string; description: string; priority: number; check: string }> {
  const out: Array<{ id: string; description: string; priority: number; check: string }> = [];
  // The goal is always candidate #1.
  out.push({
    id: "goal",
    description: "Build the owner's stated goal (see begin.yaml → project_identity.goal). Decompose it into small, verifiable steps and append them here as you discover them.",
    priority: 100,
    check: "The owner confirms the built feature does what they asked, via a runnable demo.",
  });
  // Detected gaps become candidates. Stable order = analysis order.
  const warnings = ctx.ai_context?.warnings ?? [];
  warnings.forEach((w, i) => {
    out.push({
      id: `gap-${i + 1}`,
      description: String(w),
      priority: 80 - i, // earlier-detected gaps rank slightly higher; deterministic
      check: "Re-run the analysis / the app and confirm this gap no longer reports.",
    });
  });
  // If no tests were detected, make a verification harness an explicit candidate —
  // it is the prerequisite for the agent being able to self-check anything else.
  if ((ctx.detection?.test_frameworks ?? []).length === 0) {
    out.push({
      id: "verify-harness",
      description: "No test framework detected. Add a minimal run-and-verify harness (one command to run the app, one to smoke-test it) so every later step can be self-checked.",
      priority: 95,
      check: "`<run>` starts the app and `<verify>` exits 0 on a known-good state.",
    });
  }
  return out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** The loop HEAD. Generalized from Axis' own begin.yaml; parameterized to the repo. */
export function buildBeginYaml(ctx: ContextMap): string {
  const name = ctx.project_identity?.name ?? "this repository";
  const hotspots = (ctx.dependency_graph?.hotspots ?? []).map((h) => h.path).filter(Boolean).slice(0, 8);
  return `# begin.yaml — autonomous iteration loop head  (generated by Axis' Iliad)
#
# Hand this repository to an AI coding agent and say:  begin
# The agent reads this file, then continuation.yaml, then works the queue until a
# stop condition is reached. The owner does not need to write code — only to answer
# the plain-English questions the loop surfaces.

project_begin:
  version: v1
  role: session_gate_and_move_selector
  generated_by: "Axis' Iliad"
  generated_at: ${yq(ctx.generated_at ?? "")}

  project_identity:
    name: ${yq(name)}
    stack: ${yq(stackLabel(ctx))}
    goal: ${yblock(inferGoal(ctx), "    ")}

  required_read_order:
    - read_this_file_first
    - then_read_continuation_yaml
    - then_take_the_highest_priority_open_candidate

  # Who decides what. Keeps a non-technical owner in the loop WITHOUT needing them to code.
  human_in_the_loop:
    ask_the_human_only_for:
      - product_or_preference_decisions      # phrase these in plain English, with options
      - missing_secrets_or_external_access   # API keys, accounts — the human must provide
      - irreversible_or_destructive_actions  # deleting data, spending money, going live
    decide_yourself_for:
      - implementation_details, naming, structure, refactors
      - which_candidate_to_take_next
    report_progress_as:
      - a_runnable_demo_or_screenshot        # NOT a diff or code
      - a_plain_english_changelog

  # The loop. One bounded, verified move per cycle, then continue.
  next_move_selection_algorithm:
    - read continuation.yaml
    - pick the highest-priority candidate whose status is open and which is not blocked
    - implement it as ONE bounded change
    - verify it against its acceptance_check (build/run/test must be green)
    - update continuation.yaml — mark it done, record evidence, append any new candidates discovered
    - commit the change
    - re-rank the remaining candidates
    - continue_until_stop_condition

  # CONVERGENCE — this is what makes "begin → … → begin" terminate, not run forever.
  stop_conditions:
    - explicit_human_stop
    - no_open_candidates_remain            # the idea is built
    - decision_only_the_human_can_make     # surface it, then stop and wait
    - no_progress_after_2_cycles_on_same_candidate   # escalate, do not thrash
    - verification_cannot_be_made_to_pass  # stop; report what is broken

  guardrails:
    keep_the_app_runnable_after_every_step: true
    never_commit_secrets: true
    escalate_before_touching_load_bearing_code:
${hotspots.length ? hotspots.map((h) => `      - ${yq(h)}`).join("\n") : "      - (none flagged — still confirm before touching auth, payments, or data layers)"}

  # The loop closes here. After finishing a candidate, do NOT stop — return to the top:
  on_cycle_complete: "Re-read this file and continue:  begin"
`;
}

/** The loop STATE: the ordered step-list of artifacts + the candidate queue. */
export function buildContinuationYaml(ctx: ContextMap, files: GeneratedFile[]): string {
  const steps = files
    .map((f, i) => {
      const isLast = i === files.length - 1;
      const cmd = isLast
        ? "begin   # ← self-prompt: the sequence is complete, re-enter the loop via begin.yaml"
        : `read/apply, then continue to step ${i + 2}`;
      return `    - n: ${i + 1}\n      artifact: ${yq(f.path)}\n      program: ${yq(f.program)}\n      command: ${yq(cmd)}`;
    })
    .join("\n");

  const candidates = buildCandidates(ctx)
    .map(
      (c) =>
        `    - id: ${yq(c.id)}\n      description: ${yblock(c.description, "      ")}\n      priority: ${c.priority}\n      status: open\n      acceptance_check: ${yq(c.check)}`,
    )
    .join("\n");

  return `# continuation.yaml — loop STATE  (generated by Axis' Iliad)
#
# The agent READS this to choose the next move and UPDATES it after every cycle
# (mark candidates done, append evidence, add newly-discovered candidates).
# When 'candidates' has no open entries, the loop's stop condition is met — the idea is built.

continuation:
  version: v1
  generated_at: ${yq(ctx.generated_at ?? "")}
  active_vertical: ${yq(stackLabel(ctx))}

  # The ordered artifact step-list (the map's steps). The final command is 'begin'.
  steps:
${steps || "    []"}

  # The work queue — complete in priority order (highest first). SEED, not final:
  # decompose 'goal' into concrete steps and append them as you go.
  candidates:
${candidates}

  # The agent appends to these every cycle.
  evidence_log: []           # what you did + proof (build/test/demo) it worked
  open_questions_for_human: []   # plain-English product questions blocking progress
  decisions: []              # decisions made + why (so future cycles don't re-litigate
`;
}

/** Build the ⟳ Continue footer for a markdown artifact at position (idx of mdTotal). */
function continueFooter(path: string, idx: number, mdTotal: number, next: string | null): string {
  const head = `\n\n---\n\n## ⟳ Continue the loop\n\n- **You are here:** \`${path}\` — agent step ${idx + 1} of ${mdTotal}.\n`;
  if (next) {
    return (
      head +
      `- **Next:** \`${next}\`.\n` +
      `- **To iterate:** re-read \`begin.yaml\` → \`continuation.yaml\`, take the highest-priority open candidate, complete + verify it, update \`continuation.yaml\`, then keep going.\n`
    );
  }
  // Terminal step → the self-prompt back to begin.yaml.
  return (
    head +
    `- **▶ The loop closes here.** The artifact sequence is complete. Re-enter the loop now: **begin** (re-read \`begin.yaml\`).\n` +
    `- **Stop only when:** \`continuation.yaml\` has no open candidates, a human stops you, or you hit a decision only the human can make.\n`
  );
}

/**
 * Weave the begin-loop into a generation result IN PLACE: append a ⟳ Continue footer to
 * every markdown artifact (the last one self-prompts `begin`), then add begin.yaml +
 * continuation.yaml. Best-effort — a throw is swallowed so the loop layer can never fail
 * a generation. Call AFTER appendQualityArtifacts so the quality docs are sequenced too.
 */
export function appendAutonomyLoop(generated: GeneratorResult, ctx: ContextMap): void {
  try {
    if (!generated.files.length) return;
    // Idempotent: begin.yaml present ⇒ the loop (footers + continuation.yaml) was already
    // woven in by an earlier call. Safe to call at generation AND again at export over a
    // stored package (e.g. one produced by the MCP path) without double-footering.
    if (generated.files.some((f) => f.path === "begin.yaml")) return;
    // 1. Footer every markdown artifact; the last markdown one carries the self-prompt.
    const md = generated.files.filter(isMarkdown);
    md.forEach((f, i) => {
      const next = i < md.length - 1 ? md[i + 1].path : null;
      f.content = f.content + continueFooter(f.path, i, md.length, next);
    });
    // 2. Add the loop head + state (path-collision guarded, like the quality gate).
    const add = (path: string, content: string, description: string) => {
      if (generated.files.some((f) => f.path === path)) return;
      generated.files.push({ path, content, content_type: "application/yaml", program: BEGIN_PROGRAM, description });
    };
    add("begin.yaml", buildBeginYaml(ctx), "Autonomy loop head — hand the repo to an agent and say 'begin'");
    add("continuation.yaml", buildContinuationYaml(ctx, generated.files), "Autonomy loop state — ordered steps + the candidate queue the agent works");
  } catch {
    // Best-effort; the generated package already succeeded.
  }
}
