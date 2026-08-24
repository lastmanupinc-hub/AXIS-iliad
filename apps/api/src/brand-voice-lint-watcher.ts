// ─── app_41_brand_voice_linter: the brand program's Watch → Verify → Apply loop ─
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #14 — "A: enforce
// voice-and-tone on user-facing strings in PRs via vale rules the program
// synthesizes from its own guide. V: the guide's own examples pass their own
// rules. W: PR-lint. Accepts when: an off-voice string fails CI with a
// citation to the guide." generators-brand.ts's generateValeConfig /
// generateValeForbiddenTermsStyle / generateValePreferredTermsStyle are the
// pure, deterministic half (rule synthesis, no external process). This file
// is the live half: on every PR, extract the strings a real end user would
// actually see, run the REAL vale binary against them, and post a commit
// status GitHub renders as a CI check — never a report.
//
// SAFETY — this watcher is UNLIKE every other external-process caller in
// this codebase. canvas-diagram-watcher.ts's own header explains why running
// D2 server-side is safe: D2's input is "100% AXIS-generated deterministic
// text derived from repo facts (never the user's own arbitrary file
// content)". That argument does NOT apply here — the strings vale lints
// below are extracted DIRECTLY FROM THE PR AUTHOR'S OWN DIFF, i.e.
// arbitrary, untrusted, attacker-controllable text. Safety here rests on
// two different, narrower guarantees instead of "the input is ours":
//   1. PR-derived text NEVER becomes part of a shell command line. It is
//      written to a TEMP FILE (extractedStrings.join("\n")) and vale is
//      invoked with execFile + an ARGUMENT ARRAY containing only FIXED,
//      AXIS-controlled paths (the temp file's own generated path, the
//      generated config path) — never string-interpolated, never run with
//      shell:true. A PR string containing `; rm -rf /` or backticks is just
//      inert file CONTENT to both execFile and to vale (a linter, which
//      reads and pattern-matches text — it has no code-execution semantics
//      of its own).
//   2. Bounded blast radius: MAX_STRINGS caps how many extracted strings
//      one PR can force vale to process, MAX_STRING_LENGTH caps each one,
//      and VALE_TIMEOUT_MS bounds the subprocess itself — a maximally
//      adversarial diff (huge, many huge JSX literals) can degrade to "vale
//      skipped, capped" but can never hang or OOM the watch worker.
//
// The diff-parsing / string-extraction below is a SWEEP, not a compiler —
// same discipline as app_33's detectLlmCallSites: false negatives (a
// user-facing string missed) are fine, false positives (inventing a
// violation, or a citation, that doesn't exist in the real diff) are not.

import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WatchJobPayload } from "@axis/snapshots";
import {
  generateValeConfig,
  generateValeForbiddenTermsStyle,
  generateValePreferredTermsStyle,
  VOICE_EXAMPLES,
} from "@axis/generator-core";
import {
  fetchPullRequestFiles,
  postCommitStatus,
  type PullRequestFile,
  type PostCommitStatusResult,
} from "./github-pr.js";

const BRAND_PRODUCT_ID = "brand";
const COMMIT_STATUS_CONTEXT = "axis/brand-voice-lint";
const VALE_TIMEOUT_MS = 15_000;
const MAX_STRINGS = 200;
const MAX_STRING_LENGTH = 500;
/** Applied to a diff LINE before regex extraction runs — see extractUserFacingStrings' inline comment. */
const MAX_LINE_LENGTH = 2000;
const JSX_FILE_RE = /\.(tsx|jsx)$/;

// ─── vale invocation shape ────────────────────────────────────────

export interface ValeFinding {
  check: string;
  message: string;
  severity: string;
  match: string;
  /** 1-indexed line within the batched input file this watcher wrote — mapped back to an extracted string by the caller. */
  line: number;
}

/** Injectable: real implementation shells out to the vale binary; tests substitute a pure function. */
export type RunVale = (lines: string[]) => Promise<ValeFinding[]>;

/**
 * Real vale invocation — SAFE by construction (see file header): `lines` is
 * arbitrary/untrusted PR-derived text, but it only ever becomes the CONTENT
 * of a generated temp file; execFile's argv holds only fixed, AXIS-built
 * paths, never shell-interpolated. Batches every line into ONE vale call
 * (one subprocess per PR, not one per string) — each input line maps 1:1 to
 * vale's own 1-indexed `Line` field.
 */
export function realRunVale(valeBinaryPath: string): RunVale {
  return (lines: string[]) => {
    if (lines.length === 0) return Promise.resolve([]);
    const dir = mkdtempSync(join(tmpdir(), "axis-vale-"));
    try {
      const configPath = join(dir, ".vale.ini");
      const stylesDir = join(dir, "styles", "AXIS");
      const inputPath = join(dir, "input.txt");
      writeFileSync(configPath, generateValeConfig({} as never).content, "utf-8");
      return runValeSubprocess(valeBinaryPath, configPath, stylesDir, inputPath, lines, dir);
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      return Promise.reject(err);
    }
  };
}

async function runValeSubprocess(
  valeBinaryPath: string,
  configPath: string,
  stylesDir: string,
  inputPath: string,
  lines: string[],
  dir: string,
): Promise<ValeFinding[]> {
  try {
    mkdirSync(stylesDir, { recursive: true });
    writeFileSync(join(stylesDir, "ForbiddenPatterns.yml"), generateValeForbiddenTermsStyle({} as never).content, "utf-8");
    writeFileSync(join(stylesDir, "PreferredTerms.yml"), generateValePreferredTermsStyle({} as never).content, "utf-8");
    // Each extracted string is already normalized to a single line by the
    // caller — one string per line keeps vale's 1-indexed Line field a
    // direct index back into `lines`.
    writeFileSync(inputPath, lines.join("\n") + "\n", "utf-8");

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        valeBinaryPath,
        ["--config", configPath, "--output=JSON", inputPath],
        { timeout: VALE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        (error, out) => {
          // vale exits non-zero when error-severity findings exist — that is
          // the EXPECTED, successful "violations found" case, not a failure.
          // Only reject if there is no stdout at all (the binary genuinely
          // could not run — missing config, crashed, timed out).
          if (error && (!out || out.trim().length === 0)) {
            reject(new Error(`vale invocation failed: ${error.message}`));
            return;
          }
          resolve(out ?? "");
        },
      );
    });

    const parsed = JSON.parse(stdout || "{}") as Record<string, Array<Record<string, unknown>>>;
    const findings = Object.values(parsed).flat();
    return findings
      .filter((f) => typeof f.Line === "number")
      .map((f) => ({
        check: String(f.Check ?? ""),
        message: String(f.Message ?? ""),
        severity: String(f.Severity ?? ""),
        match: String(f.Match ?? ""),
        line: f.Line as number,
      }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── V: the guide's own examples pass their own rules (runtime self-check) ─

export interface VoiceExampleCheckResult {
  self_consistent: boolean;
  /** Examples whose `do` text unexpectedly produced an error-severity finding, or whose `dont` text (with a stated reason) produced none. */
  failures: string[];
  /** Examples with no dont_reason_words — named as excluded, never silently skipped. */
  excluded: string[];
}

/**
 * Runs the SAME synthesized rules against VOICE_EXAMPLES (imported from the
 * generator, never a second copy) before trusting them against a real PR.
 * "Pass" means: every Do example has ZERO error-severity findings (a
 * warning-severity terminology nudge on a Do example is fine — e.g. "Upload
 * a project snapshot" legitimately contains the word "Upload" as an
 * instruction verb); every Don't example WITH a stated reason has AT LEAST
 * ONE error-severity finding. Examples with no reason words are excluded
 * and named, not silently skipped — empirically verified against the real
 * vale binary during this candidate's own build (see begin.yaml).
 *
 * NAMED GAP (found on adversarial review, not fixed by re-architecting —
 * disclosed instead, matching this file's own "false negatives are fine"
 * philosophy): this proves the synthesized rules are self-consistent against
 * VOICE_EXAMPLES' clean, single-sentence prose — it does NOT prove the same
 * rules behave identically on the structurally different text
 * extractUserFacingStrings actually produces from a real PR (JSX-
 * interpolation-adjacent fragments, attribute values, 500-char-truncated
 * slices). A forbidden phrase landing next to a `{expr}` boundary in real
 * extracted text is not exercised by this self-check. This can only widen
 * the false-negative surface (a real off-voice string going unflagged),
 * never fabricate a citation — the file's actual hard constraint — so it is
 * accepted as a known limitation rather than blocking the candidate, the
 * same way the cross-line-JSX-text exclusion below is.
 */
export async function verifyVoiceExamplesSelfConsistent(runVale: RunVale): Promise<VoiceExampleCheckResult> {
  const excluded = VOICE_EXAMPLES.filter((e) => e.dont_reason_words.length === 0).map((e) => e.context);
  const testable = VOICE_EXAMPLES.filter((e) => e.dont_reason_words.length > 0);
  if (testable.length === 0) return { self_consistent: true, failures: [], excluded };

  const lines: string[] = [];
  const index: Array<{ context: string; kind: "do" | "dont" }> = [];
  for (const ex of testable) {
    index.push({ context: ex.context, kind: "do" });
    lines.push(normalizeToSingleLine(ex.do));
    index.push({ context: ex.context, kind: "dont" });
    lines.push(normalizeToSingleLine(ex.dont));
  }

  const findings = await runVale(lines);
  const errorLines = new Set(findings.filter((f) => f.severity === "error").map((f) => f.line));

  const failures: string[] = [];
  index.forEach((entry, i) => {
    const lineNo = i + 1; // vale Line is 1-indexed
    const hasError = errorLines.has(lineNo);
    if (entry.kind === "do" && hasError) failures.push(`${entry.context}: Do example unexpectedly flagged`);
    if (entry.kind === "dont" && !hasError) failures.push(`${entry.context}: Don't example was NOT flagged`);
  });

  return { self_consistent: failures.length === 0, failures, excluded };
}

function normalizeToSingleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ─── A: extract user-facing strings from the PR's own diff ────────

export interface ExtractedString {
  file: string;
  line: number;
  text: string;
}

export interface ExtractionResult {
  strings: ExtractedString[];
  /**
   * True when MAX_STRINGS was hit before every changed file's diff was fully
   * scanned. Found on adversarial review: a silently-truncated extraction
   * could previously produce a confident "all on-voice" success on a PR that
   * genuinely contains an off-voice string past the cap — a false pass, the
   * one thing this file's own header (false negatives fine, false positives
   * not) actually forbids. The caller MUST surface this rather than claim
   * completeness it doesn't have.
   */
  truncated: boolean;
}

/**
 * Parses a unified-diff `patch` and walks ADDED lines only (never removed or
 * context lines — this is a check against what the PR is INTRODUCING) with
 * accurate new-file line numbers (tracked from `@@ -a,b +c,d @@` hunk
 * headers). A sweep, not a compiler: JSX text content between `>...<` and a
 * small explicit set of user-facing attributes (aria-label, alt, title,
 * placeholder) — cross-line JSX text and non-JSX string literals (error
 * messages, toasts) are a stated v1 exclusion, not silently missed forever.
 */
export function extractUserFacingStrings(files: PullRequestFile[]): ExtractionResult {
  const out: ExtractedString[] = [];
  for (const file of files) {
    if (!JSX_FILE_RE.test(file.filename) || !file.patch) continue;
    let newLine = 0;
    for (const raw of file.patch.split("\n")) {
      if (raw.startsWith("@@")) {
        const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        // Found on adversarial review: an unrecognized "@@" line (a genuinely
        // malformed/corrupted patch — GitHub's own API is not known to emit
        // one) used to fall through silently, leaving newLine stale and
        // fabricating line numbers for every added line that followed. Stop
        // trusting THIS FILE's line numbers from here rather than fabricate
        // one — whatever was already extracted from earlier, well-formed
        // hunks in this file stays (their line numbers were derived correctly).
        if (!hunk) break;
        newLine = Number(hunk[1]) - 1; // next added/context line will be this + 1
        continue;
      }
      if (raw.startsWith("+++") || raw.startsWith("---")) continue;
      if (raw.startsWith("+")) {
        newLine++;
        const content = raw.slice(1);
        // Cap BEFORE regex matching, not after: MAX_STRING_LENGTH truncated each
        // MATCH, but extractFromLine's regexes still scanned the full, uncapped
        // line first — a single pathologically long added line (megabytes) would
        // undermine the "bounded blast radius" this file's own header claims. A
        // single diff line this long is not legitimate hand-written JSX text
        // regardless; skip extraction on it outright rather than truncate-then-scan.
        if (content.length <= MAX_LINE_LENGTH) {
          for (const text of extractFromLine(content)) {
            if (out.length >= MAX_STRINGS) return { strings: out, truncated: true }; // bounded blast radius, disclosed
            out.push({ file: file.filename, line: newLine, text: text.slice(0, MAX_STRING_LENGTH) });
          }
        }
      } else if (raw.startsWith(" ")) {
        newLine++;
      }
      // lines starting with "-" are removed — they never advance newLine.
    }
  }
  return { strings: out, truncated: false };
}

const JSX_TEXT_RE = />([^<>{}\n]+)</g;
const JSX_ATTR_RE = /\b(aria-label|alt|title|placeholder)\s*=\s*["']([^"']+)["']/g;

function extractFromLine(line: string): string[] {
  const found: string[] = [];
  for (const m of line.matchAll(JSX_TEXT_RE)) {
    const t = m[1].trim();
    if (t.length > 0 && /[A-Za-z]/.test(t)) found.push(t);
  }
  for (const m of line.matchAll(JSX_ATTR_RE)) {
    const t = m[2].trim();
    if (t.length > 0) found.push(t);
  }
  return found;
}

// ─── The processor ──────────────────────────────────────────────

export interface BrandVoiceLintDeps {
  token: string | undefined;
  fetchPrFiles: (owner: string, repo: string, prNumber: number) => Promise<PullRequestFile[]>;
  runVale: RunVale;
  postStatus: (params: {
    owner: string;
    repo: string;
    sha: string;
    state: "success" | "failure";
    description: string;
  }) => Promise<PostCommitStatusResult>;
}

export type BrandVoiceLintStatus =
  | "not_brand_product"
  | "no_token"
  | "no_pr"
  | "self_check_failed"
  | "no_user_facing_strings"
  | "status_posted";

export interface BrandVoiceLintResult {
  status: BrandVoiceLintStatus;
  strings_checked?: number;
  violations?: number;
  self_check?: VoiceExampleCheckResult;
  status_state?: "success" | "failure";
  /** True when MAX_STRINGS was hit — this result is a PARTIAL check, disclosed in the posted description too, never silently claimed as exhaustive. */
  truncated?: boolean;
  /** Whether the GitHub commit status actually landed — decoupled from status_state: a "failure" verdict that failed to POST is still worth knowing about, never silently conflated with a clean pass. */
  posted?: boolean;
}

export async function processBrandVoiceLint(
  payload: WatchJobPayload,
  deps: BrandVoiceLintDeps,
): Promise<BrandVoiceLintResult> {
  if (payload.product_id !== BRAND_PRODUCT_ID) return { status: "not_brand_product" };
  if (!deps.token) return { status: "no_token" };
  if (!payload.pr_number) return { status: "no_pr" };

  // ── V (runtime half): never trust synthesized rules against a real PR
  // without first proving they still discriminate the guide's own examples.
  // A failure here means the RULE SYNTHESIS is broken, not the PR — reported
  // distinctly rather than posting a possibly-nonsensical status.
  const selfCheck = await verifyVoiceExamplesSelfConsistent(deps.runVale);
  if (!selfCheck.self_consistent) {
    return { status: "self_check_failed", self_check: selfCheck };
  }

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const prFiles = await deps.fetchPrFiles(owner, repo, payload.pr_number);
  const { strings, truncated } = extractUserFacingStrings(prFiles);
  // Found on adversarial review: a truncated extraction must NEVER be
  // reported as a confident, unqualified pass — that would be exactly the
  // false-positive ("all on-voice") this file's own header forbids, even
  // though every string it DID check is genuinely clean. Always disclosed,
  // on both the success and failure path below.
  const truncationNote = truncated
    ? ` NOTE: this PR has more user-facing strings than the ${MAX_STRINGS}-string cap — not exhaustively checked.`
    : "";

  if (strings.length === 0) {
    // Nothing to lint is a legitimate pass — not every PR touches JSX.
    // (truncated can't be true here: reaching the cap requires MAX_STRINGS>0 extracted strings.)
    const posted = await deps.postStatus({
      owner,
      repo,
      sha: payload.ref,
      state: "success",
      description: "AXIS Brand: no user-facing strings changed in this PR.",
    });
    return { status: "no_user_facing_strings", strings_checked: 0, status_state: "success", truncated, posted: posted.posted };
  }

  const lines = strings.map((s) => normalizeToSingleLine(s.text));
  const findings = await deps.runVale(lines);
  const errorFindings = findings.filter((f) => f.severity === "error");
  const isViolation = (i: number) => errorFindings.some((f) => f.line === i + 1);
  const violations = strings.filter((_, i) => isViolation(i));
  // Found on adversarial review: the finding cited in the description must be
  // the ONE THAT ACTUALLY BELONGS to violations[0]'s own batch line — not
  // just errorFindings[0], which is only correct by luck of RunVale's return
  // order. Re-derive violations[0]'s real batch line and look its finding up
  // explicitly, so the citation is correct by construction.
  const firstViolationBatchLine = strings.findIndex((_, i) => isViolation(i)) + 1;
  const firstFinding = errorFindings.find((f) => f.line === firstViolationBatchLine);

  const state: "success" | "failure" = violations.length === 0 ? "success" : "failure";
  const description =
    violations.length === 0
      ? `AXIS Brand: ${strings.length} user-facing string${strings.length === 1 ? "" : "s"} checked, all on-voice.${truncationNote}`
      : `AXIS Brand: ${violations.length} off-voice string${violations.length === 1 ? "" : "s"} (${violations[0].file}:${violations[0].line} — ${firstFinding?.message ?? ""}). See voice-and-tone.md.${truncationNote}`;

  const posted = await deps.postStatus({ owner, repo, sha: payload.ref, state, description });
  return {
    status: "status_posted",
    strings_checked: strings.length,
    violations: violations.length,
    status_state: state,
    self_check: selfCheck,
    truncated,
    posted: posted.posted,
  };
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

export function defaultBrandVoiceLintDeps(): BrandVoiceLintDeps {
  const valeBinaryPath = process.env.AXIS_VALE_BINARY_PATH || "vale";
  return {
    token: process.env.GITHUB_TOKEN,
    fetchPrFiles: (owner, repo, prNumber) => fetchPullRequestFiles(fetch, process.env.GITHUB_TOKEN ?? "", owner, repo, prNumber),
    runVale: realRunVale(valeBinaryPath),
    postStatus: (p) =>
      postCommitStatus(fetch, {
        owner: p.owner,
        repo: p.repo,
        token: process.env.GITHUB_TOKEN ?? "",
        sha: p.sha,
        state: p.state,
        description: p.description,
        context: COMMIT_STATUS_CONTEXT,
      }),
  };
}
