// ─── app_31_frontend_v0_answer: the frontend program's Watch → Verify → Apply ──
//
// docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md #6. The rest of the frontend
// program produces prose (frontend-rules.md, component-guidelines.md,
// layout-patterns.md, ui-audit.md) and zero code. This closes the loop: on every
// push for a "frontend"-subscribed repo it infers real components FROM the
// repo's own design-token contract and opens a PR containing the ones that
// PROVED conformant.
//
// WHY A FIXED PRIMITIVE SET rather than "whatever the model feels like": the
// request list is deterministic, so the same repo asks for the same components
// every run and a diff means the DESIGN SYSTEM changed, not that the model
// wandered. Non-determinism is confined to the component body, where the gates
// in frontend-components.ts bind it.
//
// PARTIAL SUCCESS IS THE NORMAL CASE, and is handled honestly. Each component is
// verified independently; the ones that pass are applied and the ones that fail
// are reported with their reason and NEVER silently downgraded into the PR.
// Shipping three good components and naming the fourth as withheld is worth more
// than shipping four of unknown quality — the same reason verify-automations
// withholds a workflow whose steps fail.
//
// MANAGED DIRECTORY, like seo's markers: everything is written under
// src/components/axis/, so re-running replaces this program's own output and
// never touches a component the user wrote. The generator's prior output is also
// excluded from its own regeneration input — the app_11 / app_24 lesson.
import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap, type ContextMap } from "@axis/context-engine";
import {
  openApplyPullRequest,
  applyBranchName,
  type ApplyFile,
  type OpenApplyPrParams,
  type OpenApplyPrResult,
} from "./github-pr.js";
import { generateVerifiedComponent, type ComponentResult, type SourceFileLike } from "./frontend-components.js";

const FRONTEND_PRODUCT_ID = "frontend";

/** Everything this program writes lives here, so re-runs never touch user code. */
export const AXIS_COMPONENT_DIR = "src/components/axis";

/**
 * The deterministic request list. Primitives every design system needs, so the
 * set does not depend on the model's imagination and a changed diff means the
 * tokens moved.
 */
export const PRIMITIVE_REQUESTS: ReadonlyArray<{ name: string; request: string }> = [
  { name: "Button", request: "A primary button with a label prop and a disabled state." },
  { name: "Card", request: "A content card with a title prop and children." },
  { name: "TextField", request: "A labelled single-line text input with a required id and value/onChange props." },
];

export interface FrontendApplyDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  openPr: (params: OpenApplyPrParams) => Promise<OpenApplyPrResult>;
  /** Injected so the loop is testable without a live model. */
  generateComponent: (ctx: ContextMap, request: string, files: SourceFileLike[]) => Promise<ComponentResult>;
}

export type FrontendApplyStatus =
  | "not_frontend_product"
  | "no_token"
  | "all_withheld"
  | "no_changes"
  | "pr_opened"
  | "pr_skipped";

export interface WithheldComponent {
  name: string;
  reason: string;
  invented_colors?: string[];
  findings?: string[];
}

export interface FrontendApplyResult {
  status: FrontendApplyStatus;
  /** Paths written, relative to the repo root. */
  applied?: string[];
  /** Every component that failed a gate, with the reason it failed. */
  withheld?: WithheldComponent[];
}

/** Repo-relative path for a generated primitive. */
export function componentPath(name: string, extension: string): string {
  return `${AXIS_COMPONENT_DIR}/${name}${extension}`;
}

export async function processFrontendApply(
  payload: WatchJobPayload,
  deps: FrontendApplyDeps,
): Promise<FrontendApplyResult> {
  if (payload.product_id !== FRONTEND_PRODUCT_ID) return { status: "not_frontend_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);
  // Never let this program's own output feed its own regeneration.
  const sourceFiles = fr.files.filter((f) => !f.path.startsWith(`${AXIS_COMPONENT_DIR}/`));

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Generate design-system-conformant components"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: sourceFiles }, undefined);
  const ctx = buildContextMap(snapshot);

  const applyFiles: ApplyFile[] = [];
  const withheld: WithheldComponent[] = [];

  for (const primitive of PRIMITIVE_REQUESTS) {
    const res = await deps.generateComponent(ctx, primitive.request, sourceFiles);
    if (res.status !== "generated" || !res.component || !res.path) {
      withheld.push({
        name: primitive.name,
        reason: res.reason ?? "unknown",
        invented_colors: res.invented_colors?.length ? res.invented_colors : undefined,
        findings: res.findings?.length ? res.findings.map((f) => `${f.category}:${f.line}`) : undefined,
      });
      continue;
    }
    const path = `${AXIS_COMPONENT_DIR}/${res.path}`;
    // Idempotence: identical content is not a change worth a PR.
    const existing = fr.files.find((f) => f.path === path)?.content;
    if (existing === res.component.code) continue;
    applyFiles.push({ path, content: res.component.code });
  }

  if (applyFiles.length === 0) {
    // Distinguish "nothing passed the gates" from "everything already current".
    // Collapsing these would hide a total generation failure behind a reassuring
    // "no changes" — the same false-green shape this repo keeps finding.
    return withheld.length > 0 ? { status: "all_withheld", withheld } : { status: "no_changes", withheld: [] };
  }

  const { owner, repo } = splitRepo(payload.repo_full_name);
  const pr = await deps.openPr({
    owner,
    repo,
    token: deps.token,
    baseBranch: branchFromRef(payload.ref),
    branchName: applyBranchName("frontend-components", applyFiles.map((f) => f.content).join("\n")),
    files: applyFiles,
    title: "AXIS: design-system-conformant components",
    body: buildPrBody(applyFiles.map((f) => f.path), withheld),
  });
  return {
    status: pr.opened ? "pr_opened" : "pr_skipped",
    applied: applyFiles.map((f) => f.path),
    withheld,
  };
}

function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "") || "main";
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const i = fullName.indexOf("/");
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

export function buildPrBody(paths: string[], withheld: WithheldComponent[]): string {
  const lines = [
    "AXIS generated these components from this repository's OWN design-token contract.",
    "",
    "Every colour in them already existed in your design system — a component that used a colour your tokens do not define was rejected before this PR, not flagged inside it. Each one also passed the frontend program's own UI audit (no `div` used as a button, no image without alt text, no `dangerouslySetInnerHTML`, no `any`).",
    "",
    ...paths.map((p) => `- \`${p}\``),
  ];
  if (withheld.length > 0) {
    lines.push(
      "",
      "**Withheld** — generated but failed a gate, so they are not in this PR:",
      ...withheld.map((w) =>
        `- \`${w.name}\` — ${w.reason}${w.invented_colors?.length ? ` (colours outside the design system: ${w.invented_colors.join(", ")})` : ""}`,
      ),
    );
  }
  lines.push(
    "",
    `Everything under \`${AXIS_COMPONENT_DIR}/\` is managed by AXIS and replaced on re-run; nothing outside it is touched.`,
    "",
    "— Generated by AXIS frontend (watch mechanic).",
  );
  return lines.join("\n");
}

export function defaultFrontendApplyDeps(): FrontendApplyDeps {
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    openPr: (params) => openApplyPullRequest(fetch, params),
    generateComponent: (ctx, request, files) => generateVerifiedComponent(ctx, request, files),
  };
}
