// ─── app_30_seo_applies: the seo program's Watch → Verify → Apply loop ─────
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #7 — "Accepts when:
// recommendations land as merged tags, not a report." The rest of the seo
// program produces reports (seo-rules.md, schema-recommendations.json). This
// closes the loop: on every push for an "seo"-subscribed repo it regenerates
// the real <head> markup, VALIDATES it, and opens a PR that injects it.
//
// The V stage is not optional and runs BEFORE the PR: validateStructuredData
// checks the generated JSON-LD, and invalid markup means no PR at all. AXIS
// opening a PR that puts broken structured data into someone's <head> would be
// worse than doing nothing — search engines would act on it.
//
// INJECTION IS MARKER-DELIMITED AND IDEMPOTENT. Rewriting a user's index.html
// wholesale is not acceptable, so the generated block is written between
// AXIS:SEO markers: present markers are replaced in place, absent ones are
// inserted just before </head>. Re-running never stacks duplicate blocks, and
// everything outside the markers is untouched. If the repo has no <head> at
// all, the tags are written to a standalone file instead of guessing where
// they belong.
//
// Scope note: the candidate's W ("Search Console coverage/ranking deltas
// pulled on schedule") and sitemap submission both need the OWNER's Google
// Search Console OAuth credentials and are NOT built here — see begin.yaml.
// This rides the same repo_subscriptions push flow every other Watch consumer
// uses, which needs no third-party auth.

import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import { generateSeoHeadTags, validateStructuredData } from "@axis/generator-core";
import {
  openApplyPullRequest,
  applyBranchName,
  type ApplyFile,
  type OpenApplyPrParams,
  type OpenApplyPrResult,
} from "./github-pr.js";

const SEO_PRODUCT_ID = "seo";

/** Standalone fallback when the repo has no HTML document to inject into. */
export const SEO_TAGS_PATH = "seo-head-tags.html";

export const MARKER_START = "<!-- AXIS:SEO:START — managed by AXIS, edits inside this block are overwritten -->";
export const MARKER_END = "<!-- AXIS:SEO:END -->";

export interface SeoApplyDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
}

export type SeoApplyStatus =
  | "not_seo_product"
  | "no_token"
  | "invalid_structured_data"
  | "no_changes"
  | "pr_opened"
  | "pr_skipped";

export interface SeoApplyResult {
  status: SeoApplyStatus;
  /** Which file the tags were written into — an existing HTML doc, or the standalone fallback. */
  target?: string;
  validation_errors?: string[];
  pr?: OpenApplyPrResult;
}

/**
 * Replace the AXIS block if present, otherwise insert before </head>.
 * Returns null when the document has no </head> to anchor to — the caller
 * falls back to a standalone file rather than guessing a location.
 */
export function injectIntoHtml(html: string, block: string): string | null {
  const startIdx = html.indexOf(MARKER_START);
  const endIdx = html.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Idempotent path: swap the managed block, leave everything else alone.
    return html.slice(0, startIdx) + block + html.slice(endIdx + MARKER_END.length);
  }
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose === -1) return null;
  const indent = "  ";
  return `${html.slice(0, headClose)}${indent}${block}\n${html.slice(headClose)}`;
}

/** The managed block, markers included. */
export function buildManagedBlock(tags: string): string {
  return `${MARKER_START}\n${tags.trimEnd()}\n${MARKER_END}`;
}

/** Prefers an app-root index.html; falls back to the shallowest index.html in the repo. */
export function pickHtmlTarget(files: FileEntry[]): FileEntry | null {
  const candidates = files.filter((f) => /(^|\/)index\.html$/i.test(f.path));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))[0];
}

export async function processSeoApply(payload: WatchJobPayload, deps: SeoApplyDeps): Promise<SeoApplyResult> {
  if (payload.product_id !== SEO_PRODUCT_ID) return { status: "not_seo_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // The standalone fallback is this generator's own prior output — never let it
  // feed its own regeneration (the app_11 / app_24 lesson).
  const sourceFiles = fr.files.filter((f) => f.path !== SEO_TAGS_PATH);

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Apply SEO head tags"],
    requested_outputs: [],
  };
  // undefined account_id: transient snapshot, built only to derive ctx for this
  // one regeneration and never looked up again by account.
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);
  const tags = generateSeoHeadTags(ctx).content;

  // ── V: nothing reaches a PR until the structured data validates ──
  const validation = validateStructuredData(tags);
  if (!validation.ok) {
    return { status: "invalid_structured_data", validation_errors: validation.issues.map((i) => `block ${i.block}: ${i.message}`) };
  }

  const block = buildManagedBlock(tags);
  const htmlTarget = pickHtmlTarget(sourceFiles);

  let target: string;
  let content: string;
  if (htmlTarget) {
    const injected = injectIntoHtml(htmlTarget.content, block);
    if (injected === null) {
      target = SEO_TAGS_PATH;
      content = tags;
    } else {
      if (injected === htmlTarget.content) return { status: "no_changes", target: htmlTarget.path };
      target = htmlTarget.path;
      content = injected;
    }
  } else {
    target = SEO_TAGS_PATH;
    content = tags;
  }

  if (target === SEO_TAGS_PATH) {
    const existing = fr.files.find((f) => f.path === SEO_TAGS_PATH)?.content ?? "";
    if (existing === content) return { status: "no_changes", target };
  }

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const files: ApplyFile[] = [{ path: target, content }];
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("seo-head-tags", content),
    files,
    title: "AXIS: apply SEO head tags",
    body: buildPrBody(target),
  });
  return { status: pr.opened ? "pr_opened" : "pr_skipped", target, pr };
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

function buildPrBody(target: string): string {
  return [
    "AXIS regenerated this repository's SEO `<head>` markup from its own metadata.",
    "",
    `Every value is derived from real repo facts (name, description, detected languages, repo URL). Missing facts are omitted rather than filled with placeholder copy.`,
    "",
    `- \`${target}\` — the managed block sits between \`AXIS:SEO:START\` / \`AXIS:SEO:END\`; anything outside those markers is untouched, and re-running replaces the block in place rather than stacking duplicates.`,
    "",
    "The embedded JSON-LD passed structured-data validation before this PR was opened — invalid markup means no PR at all.",
    "",
    "— Generated by AXIS SEO (watch mechanic).",
  ].join("\n");
}

export function defaultSeoApplyDeps(): SeoApplyDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    openPr: (params) => openApplyPullRequest(fetch, params),
  };
}
