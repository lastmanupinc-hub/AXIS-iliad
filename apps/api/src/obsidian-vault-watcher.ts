// ─── app_35_obsidian_vault_sync: obsidian program's Watch → Verify → Apply ──
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #17. Everything else this
// program emits tells a human how to BUILD a vault by hand (templates, a
// linking policy, a "graph prompt map"). This closes the loop: on every push
// for an "obsidian"-subscribed repo it writes the actual vault — one note per
// file that participates in the repo's own import graph — verifies every
// [[wikilink]] resolves before ever proposing a PR, and opens one containing
// exactly what verified clean.
//
// MANAGED DIRECTORY, same as seo/theme/frontend: everything under vault/, so
// re-running replaces AXIS's own output and never touches a note the user
// wrote by hand. The generator's prior output is excluded from its own
// regeneration input — the app_11/app_24/app_31 lesson, repeated here because
// it is a repeated failure mode, not a one-off.
//
// FAIL-CLOSED ON A BROKEN LINK: if verifyVaultLinks ever finds one, that is a
// bug in generateVaultNotes, not a customer problem to inherit — the PR is
// withheld entirely rather than shipping a vault with a dead link in it.
import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap } from "@axis/context-engine";
import { generateVaultNotes, verifyVaultLinks } from "@axis/generator-core";
import { openApplyPullRequest, applyBranchName, type ApplyFile, type OpenApplyPrParams, type OpenApplyPrResult } from "./github-pr.js";

const OBSIDIAN_PRODUCT_ID = "obsidian";

/** Everything this program writes lives here, so re-runs never touch a note the user wrote. */
export const VAULT_DIR = "vault";

export interface ObsidianVaultDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
}

export type ObsidianVaultStatus =
  | "not_obsidian_product"
  | "no_token"
  | "no_changes"
  | "broken_links_withheld"
  | "pr_opened"
  | "pr_skipped";

export interface ObsidianVaultResult {
  status: ObsidianVaultStatus;
  applied?: string[];
  /** Populated only on broken_links_withheld — real diagnostics, not a silent drop. */
  broken_links?: Array<{ note: string; link: string }>;
}

export async function processObsidianVaultSync(
  payload: WatchJobPayload,
  deps: ObsidianVaultDeps,
): Promise<ObsidianVaultResult> {
  if (payload.product_id !== OBSIDIAN_PRODUCT_ID) return { status: "not_obsidian_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // Never let this program's own output feed its own regeneration.
  const sourceFiles = fr.files.filter((f) => !f.path.startsWith(`${VAULT_DIR}/`));

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Maintain the obsidian vault"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);

  const notes = generateVaultNotes(ctx, sourceFiles);

  // Fail-closed: a broken link here is a code bug, not a customer's problem —
  // withhold rather than ship it, with the real diagnostics attached so the
  // failure is loud, not silently swallowed into a smaller, wrong PR.
  const { broken } = verifyVaultLinks(notes);
  if (broken.length > 0) return { status: "broken_links_withheld", broken_links: broken };

  const applyFiles: ApplyFile[] = [];
  for (const note of notes) {
    const existing = fr.files.find((f) => f.path === note.path)?.content;
    if (existing === note.content) continue; // idempotence: unchanged notes are not a diff
    applyFiles.push({ path: note.path, content: note.content });
  }

  if (applyFiles.length === 0) return { status: "no_changes" };

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("obsidian-vault", applyFiles.map((f) => f.content).join("\n")),
    files: applyFiles,
    title: "AXIS: obsidian vault sync",
    body: buildPrBody(applyFiles.map((f) => f.path)),
  });
  return { status: pr.opened ? "pr_opened" : "pr_skipped", applied: applyFiles.map((f) => f.path) };
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

export function buildPrBody(paths: string[]): string {
  return [
    "AXIS regenerated your obsidian vault from this repository's OWN import graph.",
    "",
    "Every [[wikilink]] in this PR was verified to resolve to a real note in the same set before this " +
      "PR was opened — a link that would land nowhere in Obsidian is withheld entirely, not shipped.",
    "",
    ...paths.map((p) => `- \`${p}\``),
    "",
    `Everything under \`${VAULT_DIR}/\` is managed by AXIS and replaced on re-run; nothing outside it is touched.`,
    "",
    "— Generated by AXIS obsidian (watch mechanic).",
  ].join("\n");
}

export function defaultObsidianVaultDeps(): ObsidianVaultDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    openPr: (params) => openApplyPullRequest(fetch, params),
  };
}
