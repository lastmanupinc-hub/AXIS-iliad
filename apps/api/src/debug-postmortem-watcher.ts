// ─── app_32_debug_wired_to_incidents: the debug program's Watch → Verify → Apply loop ─
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #8 — "A: ingest the user's
// Sentry stream; on incident, draft the postmortem from real events using its
// own tracing rules. V: every playbook step references a real symbol/log line
// in the current repo. W: incident webhook. Accepts when: a real Sentry event
// produces a grounded draft." The rest of the debug program emits blank forms
// (incident-template.md) and static playbooks; this closes the loop: a real
// Sentry incident produces a postmortem DRAFT pre-filled with real event
// facts, grounded in the current repo, landing as a PR.
//
// The V stage is not optional and runs BEFORE the PR: every stack frame the
// draft cites must resolve to a real file in the current snapshot (and a real
// line within it). Frames that don't resolve — node_modules, minified
// bundles, files deleted since the incident — are DROPPED, listed as dropped,
// and if NO frame grounds, there is no PR at all. AXIS opening a postmortem
// that points an on-call engineer at files that don't exist would be worse
// than doing nothing: a postmortem's whole value is that its references hold.
//
// Sentry data is UNTRUSTED third-party input (issue titles and culprit
// strings contain user-controlled request data): every Sentry-derived string
// is sanitized before it lands in markdown an agent may read and obey — the
// same prompt-injection posture generators-skills.ts documents for its own
// repo-derived strings.
//
// Scope notes (deliberate, recorded in begin.yaml too):
// - W is the incident WEBHOOK, exactly as the spec says — NOT a scheduled
//   poller. Nothing in this codebase schedules jobs today (watch-queue.ts is
//   immediate-send only), and building the first scheduling substrate is a
//   bigger change than app_32 itself; app_42 already declined it once for
//   the same reason. A poll-based backfill is a named deferral.
// - "Plain REST, deliberately no SDK" per the strategy doc's dependency
//   table: fetchSentryIssue below is fetch + AbortController, nothing else.

import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload, SentryConnectionSecrets } from "@axis/snapshots";
import { getSentryConnectionDecrypted, markSentryConnectionUsed } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import type { ContextMap } from "@axis/context-engine";
import {
  openApplyPullRequest,
  applyBranchName,
  type ApplyFile,
  type OpenApplyPrParams,
  type OpenApplyPrResult,
} from "./github-pr.js";

const DEBUG_PRODUCT_ID = "debug";

/** Where drafts land in the user's repo — also this watcher's own-output filter. */
export const POSTMORTEM_DIR = "postmortems/";

const SENTRY_CALL_TIMEOUT_MS = 15_000;

// ─── Sentry incident shape (typed subset of the REST responses) ─

export interface SentryFrame {
  path: string; // repo-relative-ish filename as Sentry reports it
  line: number | null;
  function: string | null;
}

export interface SentryIncident {
  issue_id: string;
  title: string;
  culprit: string | null;
  level: string | null;
  count: string | null;
  first_seen: string | null;
  last_seen: string | null;
  permalink: string | null;
  frames: SentryFrame[];
}

export interface DebugPostmortemDeps {
  /** GitHub token for the PR — same source every other watcher uses. */
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
  /** The account's stored Sentry connection for this repo, decrypted. */
  getConnection: (account_id: string, repo_full_name: string) => Promise<SentryConnectionSecrets | undefined>;
  /** Plain-REST hydration of the webhook's thin payload into real events. */
  fetchIncident: (conn: SentryConnectionSecrets, issue_id: string) => Promise<SentryIncident>;
}

export type DebugPostmortemStatus =
  | "not_debug_product"
  | "no_token"
  | "no_incident"
  | "no_sentry_connection"
  | "sentry_fetch_failed"
  | "ungrounded"
  | "no_changes"
  | "pr_opened"
  | "pr_skipped";

export interface DebugPostmortemResult {
  status: DebugPostmortemStatus;
  target?: string;
  grounded_frames?: number;
  dropped_frames?: number;
  error?: string;
  pr?: OpenApplyPrResult;
}

// ─── Sanitization ───────────────────────────────────────────────
//
// Local rather than imported: generator-core's barrel exports only mdInline,
// and the CLI-bundle constraint makes widening that export a separate
// decision. Same contract as md-sanitize.ts's mdText/mdCode: collapse
// whitespace, break HTML-comment delimiters, neutralize backticks — identity
// on clean single-line input.

/**
 * Coerce an untrusted Sentry JSON field to a string ONLY when it is genuinely
 * a primitive, else null.
 *
 * Bare `String(unknown)` produced "[object Object]" whenever Sentry sent a
 * nested object where a scalar was expected — and that string then landed
 * verbatim in a generated postmortem draft as the incident title, culprit, or
 * frame function. A missing field (null) is honest; "[object Object]" is not.
 * (@typescript-eslint/no-base-to-string was flagging exactly this.)
 */
function primitiveToString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") return String(v);
  return null;
}

export function sanitizeIncidentText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/<!--/g, "<! --")
    .replace(/-->/g, "-- >")
    .replace(/`/g, "'")
    .trim();
}

// ─── V: grounding ───────────────────────────────────────────────

export interface GroundedFrame extends SentryFrame {
  /** The real snapshot path the Sentry filename resolved to. */
  resolved_path: string;
}

/**
 * Resolve a Sentry frame against the real snapshot. Sentry filenames come in
 * many shapes (absolute container paths, webpack:// prefixes, repo-relative);
 * a frame grounds when some snapshot file path ends with the frame's
 * meaningful suffix AND the cited line exists in that file. Ambiguous
 * matches (suffix matching 2+ files) do NOT ground — a postmortem pointing
 * at "one of these three files" is a guess wearing a citation.
 */
export function groundFrames(frames: SentryFrame[], files: FileEntry[]): { grounded: GroundedFrame[]; dropped: SentryFrame[] } {
  const grounded: GroundedFrame[] = [];
  const dropped: SentryFrame[] = [];

  for (const frame of frames) {
    const cleaned = frame.path
      .replace(/^webpack:\/\/[^/]*\//, "")
      .replace(/^(app:|~\/|\.\/)/, "")
      .replace(/^\/+/, "");
    if (cleaned.length === 0 || cleaned.includes("node_modules")) {
      dropped.push(frame);
      continue;
    }
    const matches = files.filter((f) => f.path === cleaned || f.path.endsWith(`/${cleaned}`));
    if (matches.length !== 1) {
      dropped.push(frame);
      continue;
    }
    const file = matches[0];
    if (frame.line !== null) {
      const lineCount = file.content.split("\n").length;
      if (frame.line < 1 || frame.line > lineCount) {
        dropped.push(frame);
        continue;
      }
    }
    grounded.push({ ...frame, resolved_path: file.path });
  }
  return { grounded, dropped };
}

// ─── The draft ──────────────────────────────────────────────────

/**
 * Pure builder: real incident facts + grounded frames + repo context, no I/O.
 * Every repo reference in the output comes from `grounded` (already proven
 * to resolve) or from ctx (derived from the same snapshot) — the draft is
 * structurally incapable of citing a file that doesn't exist.
 */
export function buildPostmortemDraft(
  ctx: ContextMap,
  incident: SentryIncident,
  grounded: GroundedFrame[],
  dropped: SentryFrame[],
): string {
  const t = sanitizeIncidentText;
  const lines: string[] = [];
  lines.push(`# Postmortem draft: ${t(incident.title)}`);
  lines.push("");
  lines.push("> Drafted by AXIS Debug from a real Sentry incident. Every file:line");
  lines.push("> below resolved against the repository at drafting time — frames that");
  lines.push("> did not resolve are listed as dropped, never presented as fact.");
  lines.push("");
  lines.push("## Incident");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Sentry issue | ${t(incident.issue_id)} |`);
  if (incident.level) lines.push(`| Level | ${t(incident.level)} |`);
  if (incident.culprit) lines.push(`| Culprit | ${t(incident.culprit)} |`);
  if (incident.count) lines.push(`| Event count | ${t(incident.count)} |`);
  if (incident.first_seen) lines.push(`| First seen | ${t(incident.first_seen)} |`);
  if (incident.last_seen) lines.push(`| Last seen | ${t(incident.last_seen)} |`);
  if (incident.permalink) lines.push(`| Sentry link | ${t(incident.permalink)} |`);
  lines.push("");
  lines.push("## Grounded stack frames");
  lines.push("");
  lines.push("Frames from the latest event that resolve to real files in this repository:");
  lines.push("");
  for (const f of grounded) {
    const loc = f.line !== null ? `${f.resolved_path}:${f.line}` : f.resolved_path;
    const fn = f.function ? ` — \`${t(f.function)}\`` : "";
    lines.push(`- \`${loc}\`${fn}`);
  }
  if (dropped.length > 0) {
    lines.push("");
    lines.push(
      `*${dropped.length} frame${dropped.length === 1 ? "" : "s"} did not resolve against the current repository (vendored code, generated bundles, or files changed since the incident) and ${dropped.length === 1 ? "was" : "were"} dropped rather than cited.*`,
    );
  }
  lines.push("");
  lines.push("## Suspect surface (from the repository's own dependency graph)");
  lines.push("");
  const groundedPaths = new Set(grounded.map((f) => f.resolved_path));
  const hotspots = [...ctx.dependency_graph.hotspots]
    .sort((a, b) => (groundedPaths.has(b.path) ? 1 : 0) - (groundedPaths.has(a.path) ? 1 : 0) || b.risk_score - a.risk_score)
    .slice(0, 6);
  if (hotspots.length > 0) {
    lines.push("| File | Inbound | Outbound | Risk | In stack? |");
    lines.push("|---|---|---|---|---|");
    for (const h of hotspots) {
      lines.push(`| \`${h.path}\` | ${h.inbound_count} | ${h.outbound_count} | ${h.risk_score} | ${groundedPaths.has(h.path) ? "**yes**" : "no"} |`);
    }
  } else {
    lines.push("*No dependency hotspots detected in this repository.*");
  }
  lines.push("");
  lines.push("## Root cause");
  lines.push("");
  lines.push("<!-- Fill in after tracing the grounded frames above. -->");
  lines.push("");
  lines.push("## Fix / Follow-up");
  lines.push("");
  lines.push("<!-- Link the fixing PR; list regression tests added. -->");
  lines.push("");
  lines.push("— Drafted by AXIS Debug (watch mechanic, app_32). Grounding rule: no reference ships unverified.");
  lines.push("");
  return lines.join("\n");
}

// ─── The processor ──────────────────────────────────────────────

export async function processDebugPostmortem(
  payload: WatchJobPayload,
  deps: DebugPostmortemDeps,
): Promise<DebugPostmortemResult> {
  if (payload.product_id !== DEBUG_PRODUCT_ID) return { status: "not_debug_product" };
  if (!deps.token) return { status: "no_token" };
  if (!payload.sentry_issue_id) return { status: "no_incident" };

  const conn = await deps.getConnection(payload.account_id, payload.repo_full_name);
  if (!conn) return { status: "no_sentry_connection" };

  let incident: SentryIncident;
  try {
    incident = await deps.fetchIncident(conn, payload.sentry_issue_id);
  } catch (err) {
    return { status: "sentry_fetch_failed", error: err instanceof Error ? err.message : String(err) };
  }

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // Prior drafts are this watcher's own output — never let them feed the
  // regeneration input (the app_11 / app_24 / app_35 lesson).
  const sourceFiles = fr.files.filter((f) => !f.path.startsWith(POSTMORTEM_DIR));

  // ── V: nothing reaches a PR unless it grounds in the current repo ──
  const { grounded, dropped } = groundFrames(incident.frames, sourceFiles);
  if (grounded.length === 0) {
    return { status: "ungrounded", grounded_frames: 0, dropped_frames: dropped.length };
  }

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Draft incident postmortem"],
    requested_outputs: [],
  };
  // undefined account_id: transient snapshot, built only to derive ctx for
  // this one draft and never looked up again by account.
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);

  const content = buildPostmortemDraft(ctx, incident, grounded, dropped);
  const target = `${POSTMORTEM_DIR}sentry-${sanitizeSlug(incident.issue_id)}.md`;

  const existing = fr.files.find((f) => f.path === target)?.content;
  if (existing === content) return { status: "no_changes", target, grounded_frames: grounded.length, dropped_frames: dropped.length };

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const files: ApplyFile[] = [{ path: target, content }];
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("debug-postmortem", content),
    files,
    title: `AXIS: postmortem draft for Sentry issue ${sanitizeSlug(incident.issue_id)}`,
    body: buildPrBody(target, grounded.length, dropped.length),
  });
  return {
    status: pr.opened ? "pr_opened" : "pr_skipped",
    target,
    grounded_frames: grounded.length,
    dropped_frames: dropped.length,
    pr,
  };
}

/** Issue ids embed in a file path and a PR title — strip anything but safe chars. */
function sanitizeSlug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown";
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

function buildPrBody(target: string, groundedCount: number, droppedCount: number): string {
  return [
    "AXIS drafted this postmortem from a real Sentry incident.",
    "",
    `- \`${target}\` — incident facts come from the Sentry API; every cited stack frame resolved against this repository at drafting time (${groundedCount} grounded, ${droppedCount} dropped rather than cited).`,
    "",
    "A frame that no longer resolves is listed as dropped, never presented as fact — a postmortem's value is that its references hold.",
    "",
    "— Generated by AXIS Debug (watch mechanic).",
  ].join("\n");
}

// ─── Real deps ──────────────────────────────────────────────────

/**
 * Plain REST to the Sentry API — deliberately no SDK (strategy doc
 * dependency table, #8). GET issue + latest event, normalize errors the same
 * way email.ts does: timeout and network failure produce one stable message
 * shape, never a raw stack.
 */
export async function realFetchSentryIncident(
  conn: SentryConnectionSecrets,
  issue_id: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = process.env.SENTRY_API_BASE_URL || "https://sentry.io/api/0",
): Promise<SentryIncident> {
  const get = async (path: string): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SENTRY_CALL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${conn.token}` },
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(`Sentry unreachable: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Sentry API error: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };

  const issue = await get(`/issues/${encodeURIComponent(issue_id)}/`);
  const event = await get(`/issues/${encodeURIComponent(issue_id)}/events/latest/`);
  void markSentryConnectionUsed(conn.token_id).catch(() => {
    /* bookkeeping only — never let it mask the real result */
  });

  return {
    issue_id,
    title: primitiveToString(issue.title) ?? "Untitled incident",
    culprit: primitiveToString(issue.culprit),
    level: primitiveToString(issue.level),
    count: primitiveToString(issue.count),
    first_seen: primitiveToString(issue.firstSeen),
    last_seen: primitiveToString(issue.lastSeen),
    permalink: primitiveToString(issue.permalink),
    frames: extractFrames(event),
  };
}

/** Innermost-exception frames from Sentry's event JSON; in-app first, reversed so the crash site leads. */
export function extractFrames(event: Record<string, unknown>): SentryFrame[] {
  const entries = Array.isArray(event.entries) ? (event.entries as Array<Record<string, unknown>>) : [];
  const exception = entries.find((e) => e.type === "exception");
  const values = exception && typeof exception.data === "object" && exception.data !== null
    ? ((exception.data as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined)
    : undefined;
  const last = values && values.length > 0 ? values[values.length - 1] : undefined;
  const stacktrace = last && typeof last.stacktrace === "object" && last.stacktrace !== null
    ? (last.stacktrace as Record<string, unknown>)
    : undefined;
  const rawFrames = stacktrace && Array.isArray(stacktrace.frames)
    ? (stacktrace.frames as Array<Record<string, unknown>>)
    : [];

  const frames: SentryFrame[] = rawFrames
    .filter((f): f is Record<string, unknown> & { filename: string } =>
      typeof f.filename === "string" && f.filename.length > 0)
    .map((f) => ({
      // `f.filename` is narrowed to string by the type predicate above, so the
      // String()/`as string` casts that were here are gone — they were both
      // unnecessary and (for f.function) capable of yielding "[object Object]"
      // into a postmortem report.
      path: f.filename,
      line: typeof f.lineNo === "number" ? f.lineNo : typeof f.lineno === "number" ? f.lineno : null,
      function: primitiveToString(f.function),
    }));
  // Sentry orders frames outermost-first; the crash site is last. Reverse so
  // the most diagnostic frames lead, and prefer in-app when flagged.
  const inApp = rawFrames.map((f) => f.inApp === true || f.in_app === true);
  const paired = frames.map((frame, i) => ({ frame, inApp: inApp[i] ?? false }));
  paired.reverse();
  paired.sort((a, b) => (b.inApp ? 1 : 0) - (a.inApp ? 1 : 0));
  return paired.map((p) => p.frame).slice(0, 20);
}

export function defaultDebugPostmortemDeps(): DebugPostmortemDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    openPr: (params) => openApplyPullRequest(fetch, params),
    getConnection: (account_id, repo_full_name) => getSentryConnectionDecrypted(account_id, repo_full_name),
    fetchIncident: (conn, issue_id) => realFetchSentryIncident(conn, issue_id),
  };
}
