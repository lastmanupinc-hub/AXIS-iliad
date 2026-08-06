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

// ─── Inter-repo ticket system ───────────────────────────────────
//
// Productizes the agent-to-agent protocol Axis' Iliad runs against its own
// sibling repos (see this repo's begin.yaml#project_begin.inter_repo_ticket_system,
// activated 2026-07-26). The mechanic: when unit A's loop needs work done on a
// SHARED path owned by unit B (billing, auth, a payments rail, a shared contract),
// A does NOT edit B's files mid-flight — A appends a ticket to B's begin.yaml
// inbox, B triages it into its own candidate queue under its own verification
// discipline, and B writes the completion notice back into A's outbox so A never
// polls. File-based, no network, no round trip.
//
// The KEY NAME is kept identical (`inter_repo_ticket_system`) across every
// generated implementation on purpose: two agents from unrelated codebases can
// only speak this protocol if they look for the same key and the same field
// names. `topology` + `known_units` carry what actually differs per repo.

/** A YAML-key-safe slug for an addressable unit path (`apps/api` → `apps_api`). */
function unitSlug(path: string): string {
  return path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "unit";
}

/**
 * Addressable units the ticket protocol can route between, derived from the
 * analysis (never hardcoded). Monorepo roots (`apps/`, `packages/`, `services/`)
 * are expanded one level down using the file paths the scan actually saw, so a
 * unit only appears if it demonstrably has files. Deterministic: sorted, capped.
 */
export function detectTicketUnits(ctx: ContextMap): Array<{ slug: string; path: string }> {
  const MULTI_UNIT_PURPOSES = new Set(["monorepo_apps", "monorepo_packages", "service_layer"]);
  const roots = (ctx.structure?.top_level_layout ?? [])
    .filter((d) => MULTI_UNIT_PURPOSES.has(d.purpose))
    .map((d) => d.name);
  if (!roots.length) return [];

  const rootSet = new Set(roots);
  const paths = new Set<string>();
  for (const entry of ctx.structure?.file_tree_summary ?? []) {
    const segs = String(entry.path ?? "").split("/");
    // `<root>/<unit>/<...>` — a unit needs at least one file BELOW it, so a bare
    // two-segment path (a file sitting directly in the root) is not a unit.
    if (segs.length >= 3 && rootSet.has(segs[0])) paths.add(`${segs[0]}/${segs[1]}`);
  }
  return [...paths]
    .sort()
    .slice(0, 24) // bounded output; alphabetical so the cap is deterministic
    .map((p) => ({ slug: unitSlug(p), path: p }));
}

/**
 * The ticket-system block, indented for `project_begin:`. Emitted for every repo:
 * with detected units it routes between them; without, it still carries the schema
 * so an agent can file against a sibling repo/service the analysis cannot see.
 */
export function buildTicketSystemBlock(ctx: ContextMap): string {
  const units = detectTicketUnits(ctx);
  const multi = units.length >= 2;
  const known = multi
    ? units.map((u) => `      ${u.slug}: ${yq(u.path)}`).join("\n")
    : `      # No multi-unit topology detected in this repo. Add the sibling repo or
      # service you actually coordinate with, as <slug>: "<path-or-repo-name>",
      # and mirror this whole block into ITS begin.yaml so both speak one protocol.
      # (This repo still has a working inbox/outbox below — the schema is live.)`;

  return `  # Agent-to-agent work requests across ${multi ? "the units below" : "repo/service boundaries"}. See known_units.
  inter_repo_ticket_system:
    activated: ${yq(ctx.generated_at ?? "")}
    topology: ${multi ? "in_repo_units" : "single_unit"}
    transport: file_based_no_network   # a ticket is filed by editing the target's begin.yaml directly
    purpose: >
      Let one unit ask another for work on a SHARED path (billing, auth,
      payments, a shared contract or schema) WITHOUT editing that unit's files
      while its own loop may be mid-candidate. The provider triages the ticket
      into its own candidate queue, does the work under its own verification
      discipline, and writes the completion notice back into the requester's
      outbox — so the requester never polls.

    known_units:
${known}

    ticket_schema:
      # Copy this template, fill it in, append it under inbox.tickets in the
      # unit you are requesting FROM. Do not edit any other section of its file.
      template:
        id: ""                    # TICKET-<from_unit>-<short-slug>-<YYYYMMDD>
        from_unit: ""             # a known_units key
        from_agent_session: ""    # your session id or a short human label
        submitted: ""             # YYYY-MM-DD
        status: submitted         # submitted -> in_progress -> confirmed -> archived
        severity: normal          # normal | priority_1 (priority_1 pauses the loop like a direct operator report)
        title: ""                 # one line
        request: >
          Exactly what you need: endpoint, field, behavior. Point at your OWN
          canonical spec file if one exists instead of restating it here.
        why: ""                   # what this blocks on your side
        acceptance_criteria: []   # concrete conditions the provider can self-verify
        pointer_back: ""          # where in YOUR unit to also check/write, if not your own outbox

    inbox:
      # Tickets other units have filed against THIS one. Every ticket with
      # status: submitted is triaged before the next candidate is picked.
      tickets: []
      archived_tickets: []

    outbox:
      # Tickets THIS unit has filed elsewhere. The provider updates status
      # directly here when they act on it, using the same schema.
      tickets: []
      archived_tickets: []

    triage_policy:
      on_new_inbox_ticket:
        - assign_a_candidate_id_and_add_to_the_candidate_queue
        - severity_priority_1_is_handled_before_the_next_candidate
        - severity_normal_takes_its_place_in_normal_priority_rank_order
        - set_ticket_status_in_progress_and_record_the_assigned_candidate_id
      on_candidate_close:
        - set_ticket_status_confirmed_in_inbox
        - write_the_same_confirmation_into_the_requesters_outbox_entry_with_matching_id
      on_mutual_confirmation:
        - move_the_ticket_to_archived_tickets_in_both_places

    notify_protocol:
      where: "<from_unit>/begin.yaml#project_begin.inter_repo_ticket_system.outbox.tickets[id]"
      what_to_write:
        status: confirmed
        confirmed: ""              # YYYY-MM-DD
        provider_candidate_id: ""  # the candidate you closed for this ticket
        evidence: ""               # commit SHA + what was verified
        summary: ""                # 1-3 sentences
`;
}

/**
 * The single most important field: what the owner wants built. We seed it from the
 * project identity but explicitly instruct the agent to CONFIRM it with the human
 * (in plain English) before building — a wrong goal is the costliest failure.
 */
function inferGoal(ctx: ContextMap): string {
  const name = ctx.project_identity?.name ?? "this project";

  // This function used to interpolate ONLY the name into a fixed sentence while
  // asserting "This was inferred from the repo" — inferring nothing. That made
  // the highest-priority entry in the queue (candidate #1, priority 100) a
  // placeholder, in a product whose whole premise is that the files are derived
  // from the repo the user submitted. Everything below is read from the same
  // analysis the tailored docs use, so the claim of inference is now true.
  const facts: string[] = [];

  const summary = ctx.ai_context?.project_summary?.trim();
  if (summary) facts.push(summary);

  const described = ctx.project_identity?.description?.trim();
  // Terminate it: these facts are joined with spaces into one paragraph, and a
  // README tagline or manifest description rarely ends in punctuation — without
  // this the sentences run together ("...small businesses Its main pieces are").
  if (described) facts.push(`Its own description: ${/[.!?]$/.test(described) ? described : `${described}.`}`);

  const abstractions = (ctx.ai_context?.key_abstractions ?? []).filter(Boolean).slice(0, 5);
  if (abstractions.length > 0) facts.push(`Its main pieces are ${abstractions.join(", ")}.`);

  const entry = (ctx.entry_points ?? [])[0]?.path;
  if (entry) facts.push(`It starts at ${entry}.`);

  const routeCount = (ctx.routes ?? []).length;
  const modelCount = (ctx.domain_models ?? []).length;
  if (routeCount > 0 || modelCount > 0) {
    const parts: string[] = [];
    if (routeCount > 0) parts.push(`${routeCount} route${routeCount === 1 ? "" : "s"}`);
    if (modelCount > 0) parts.push(`${modelCount} domain model${modelCount === 1 ? "" : "s"}`);
    facts.push(`It already defines ${parts.join(" and ")}.`);
  }

  // Fall back to the name alone only when the analysis genuinely yielded nothing
  // — and say so, rather than implying an inference that did not happen.
  const derived =
    facts.length > 0
      ? `What the analysis found: ${facts.join(" ")}`
      : `The analysis could not characterise ${name} beyond its name — treat the goal as unknown.`;

  return (
    `Finish building ${name}. ${derived} ` +
    `That describes what EXISTS, which is not the same as what the owner WANTS — so before building, ` +
    `restate the goal in one plain-English sentence and ask the human "is this right?". ` +
    `Treat their answer as the authoritative goal and replace this text with it in continuation.yaml.`
  );
}

/** Build candidate entries: the work queue, seeded from the analysis. Deterministic order. */
function buildCandidates(ctx: ContextMap): Array<{ id: string; description: string; priority: number; check: string }> {
  const out: Array<{ id: string; description: string; priority: number; check: string }> = [];

  // CANDIDATE #1 IS THE SMART DOCS, not the build. The product promise is: drop a
  // repo in, get artifacts, open your coding agent, type `begin`, and the agent
  // writes the docs that actually describe YOUR program. The generator can only
  // get you a deterministic scaffold — it has no model, so it cannot write prose
  // about intent. The agent can, and this is the step that tells it to, BEFORE it
  // starts building against a goal nobody has confirmed.
  //
  // Previously the queue opened with "build the owner's stated goal", which
  // skipped straight past that: an agent would start writing code guided by
  // scaffold prose nobody had tailored.
  out.push({
    id: "smart-docs",
    description:
      "FIRST MOVE — turn the generated scaffolds into real docs for THIS project. " +
      "Read context.md, prd.md and tasks.md (Iliad generated them deterministically from the repo, so they are accurate but generic). " +
      "Then ask the human, in plain English, what they are actually trying to build and who it is for — begin.yaml's project_identity.goal is inferred from code that EXISTS, not from what they WANT. " +
      "Rewrite the three docs so they describe that program specifically: what it does, who uses it, what done looks like, and the concrete next tasks. " +
      "Record the confirmed goal in continuation.yaml, replacing the inferred text. Everything after this candidate is built against those docs.",
    priority: 100,
    check:
      "The human reads context.md, prd.md and tasks.md and confirms they describe THEIR project — not a generic description of the code that happens to be present.",
  });

  out.push({
    id: "goal",
    description: "Build the goal confirmed in the smart-docs step (recorded in continuation.yaml, and reflected in prd.md/tasks.md). Decompose it into small, verifiable steps and append them here as you discover them.",
    priority: 99,
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
    - then_check_the_ticket_inbox      # inter_repo_ticket_system.inbox — requests that arrived since last session
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
    - check the ticket inbox and triage any new tickets into the queue   # inter_repo_ticket_system.triage_policy
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

${buildTicketSystemBlock(ctx)}
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

// The footer's stable prefix, exported so other layers (e.g. memory-weave's
// project-memory.md refresh) can locate a previously-appended footer without
// duplicating the literal string.
export const CONTINUE_FOOTER_MARKER = "\n\n---\n\n## ⟳ Continue the loop\n";

/** Build the ⟳ Continue footer for a markdown artifact at position (idx of mdTotal). */
function continueFooter(path: string, idx: number, mdTotal: number, next: string | null): string {
  const head = CONTINUE_FOOTER_MARKER + `\n- **You are here:** \`${path}\` — agent step ${idx + 1} of ${mdTotal}.\n`;
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
/**
 * Files a coding agent reads on its own when it opens a repo. These are the only
 * place a `begin` contract can live and actually be seen — anywhere else and the
 * agent has to be told to look, which is the problem this solves.
 */
const AGENT_ENTRY_FILES = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  "GEMINI.md",
  ".github/copilot-instructions.md",
]);

/** Stable marker so re-running never stacks contracts. */
export const BEGIN_CONTRACT_MARKER = "<!-- axis:begin-contract -->";

/**
 * The bootstrap contract. Deliberately short: it competes for attention with the
 * rest of the file, and its only job is to route the agent to begin.yaml.
 *
 * `.cursorrules` is not markdown, so it gets a comment-free variant — an HTML
 * comment marker there would be shown to the model as literal noise.
 */
function beginContract(path: string): string {
  const body = [
    "## If the first instruction is `begin`",
    "",
    "This repository was analysed by Axis' Iliad, which left an autonomous work queue in it.",
    "",
    "When the human's first message is `begin` (or they ask you to start, continue, or pick up the work):",
    "",
    "1. Read `begin.yaml` — the loop rules, the inferred goal, and how to choose the next move.",
    "2. Read `continuation.yaml` — the live candidate queue and what has already been done.",
    "3. Take the highest-priority candidate whose `status` is `open`. The first one asks you to",
    "   interview the human about what they are actually building, and rewrite `context.md`,",
    "   `prd.md` and `tasks.md` to describe THAT — the generated versions are accurate about the",
    "   code but generic about intent.",
    "4. Verify against the candidate's `acceptance_check`, update `continuation.yaml`, then continue.",
    "",
    "The goal recorded in `begin.yaml` was inferred from the code that EXISTS. Confirm it with the",
    "human before building against it.",
  ].join("\n");

  if (path === ".cursorrules") {
    // Plain text: no HTML comment, marker rendered as a normal line.
    return `# axis:begin-contract
${body}
`;
  }
  return `${BEGIN_CONTRACT_MARKER}
${body}
`;
}

export function appendAutonomyLoop(generated: GeneratorResult, ctx: ContextMap): void {
  if (!generated.files.length) return;
  // Idempotent: begin.yaml present ⇒ the loop (footers + continuation.yaml) was already
  // woven in by an earlier call. Safe to call at generation AND again at export over a
  // stored package (e.g. one produced by the MCP path) without double-footering.
  if (generated.files.some((f) => f.path === "begin.yaml")) return;

  // ORDER MATTERS, and it used to be wrong. The previous version footered every
  // markdown file FIRST and built the yaml SECOND, all inside a catch that
  // swallowed everything. A throw between those steps shipped a package whose
  // artifacts all say "re-read begin.yaml" while begin.yaml was never written —
  // a dangling self-reference, with no error surfaced anywhere. Build the
  // content first: if it throws, nothing has been mutated and the package is
  // simply loop-less rather than loop-less-but-claiming-otherwise.
  let beginYaml: string;
  let continuationYaml: string;
  try {
    beginYaml = buildBeginYaml(ctx);
    // Built against the pre-footer file list deliberately — the step list names
    // artifacts, and footering does not change any path.
    continuationYaml = buildContinuationYaml(ctx, generated.files);
  } catch (err) {
    // Best-effort by design (the generated package already succeeded), but NOT
    // silent. A silent skip here is indistinguishable from "this build has no
    // loop system", which is exactly the confusion it caused in practice.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[axis] autonomy loop NOT generated — begin.yaml/continuation.yaml are missing from this package.\n` +
        `       reason: ${msg}\n` +
        `       The rest of the artifacts are unaffected and no footers were added.`,
    );
    return;
  }

  // 0. THE BOOTSTRAP CONTRACT — prepended, not appended, to the files a coding
  // agent actually auto-reads.
  //
  // Without this the product's core promise did not work. begin.yaml opens with
  // "Hand this repository to an AI coding agent and say: begin" — but that
  // instruction lives INSIDE the file the agent will not open unless something
  // tells it to. What agents auto-read is CLAUDE.md / AGENTS.md / .cursorrules,
  // and there the only reference was the ⟳ footer on the LAST line, phrased as
  // "to iterate" rather than "start here". .cursorrules had no reference at all.
  // So `begin` working depended on the agent scrolling to the bottom and
  // inferring intent — an accident, not a design.
  //
  // Prepended because agents read top-down and may truncate long files; a
  // bootstrap instruction at the bottom is one the agent may never reach.
  for (const f of generated.files) {
    if (!AGENT_ENTRY_FILES.has(f.path)) continue;
    if (f.content.includes(BEGIN_CONTRACT_MARKER)) continue; // idempotent
    f.content = `${beginContract(f.path)}\n${f.content}`;
  }

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
  add("begin.yaml", beginYaml, "Autonomy loop head — hand the repo to an agent and say 'begin'");
  add("continuation.yaml", continuationYaml, "Autonomy loop state — ordered steps + the candidate queue the agent works");
}
