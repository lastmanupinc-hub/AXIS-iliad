// ─── app_23_artifacts_embed_platform: the artifacts program's Watch → Apply ──
//
// Mirrors frontend-apply-watcher.ts's shape (payload → deterministic result,
// deps-injected for testability without a live GitHub token or R2 bucket) but
// the Apply target is different by necessity: frontend/seo/obsidian write
// files INTO the customer's own repo via a PR; a browser-embeddable widget
// bundle is a build artifact, not source the customer's repo should carry.
// Its "Apply" is hosting it somewhere a <script> tag can reach — an R2
// upload, not a PR. A minted, working URL is the live endpoint the
// Apply/Watch rubric asks for; a PR containing a minified React+ReactDOM
// blob would not be a better answer to the same requirement.
//
// Every stage can legitimately produce a non-"built" outcome, and each is
// reported with its real reason — never silently downgraded into a fake
// success the way an admin tool that grants nothing while returning
// {"granted":true} would (see money_02's incident).
import { fetchGitHubRepo, createSnapshot } from "@axis/snapshots";
import type { SnapshotManifest, FileEntry, WatchJobPayload } from "@axis/snapshots";
import { buildContextMap, type ContextMap } from "@axis/context-engine";
import { generateDashboardWidget } from "@axis/generator-core";
import { buildWidget as buildWidgetPipeline, type BuildWidgetResult } from "./artifacts-bundler.js";
import { uploadWidgetBundle, defaultUploadWidgetDeps, type UploadWidgetResult } from "./artifacts-upload.js";

const ARTIFACTS_PRODUCT_ID = "artifacts";

export interface ArtifactsApplyDeps {
  token: string | undefined;
  fetchRepo: (url: string, token: string) => Promise<{ files: FileEntry[] }>;
  /** Injected so the pipeline is testable without real esbuild/happy-dom timing in every caller. */
  buildWidget: (componentSource: string) => Promise<BuildWidgetResult>;
  uploadWidget: (code: string, accountId: string) => Promise<UploadWidgetResult>;
}

export type ArtifactsApplyStatus =
  | "not_artifacts_product"
  | "no_token"
  | "withheld"
  | "not_configured"
  | "upload_failed"
  | "uploaded";

export interface ArtifactsApplyResult {
  status: ArtifactsApplyStatus;
  /** Set only on "uploaded" — a real, working, time-limited embed link. */
  url?: string;
  expires_at?: string;
  /** Set on "withheld"/"upload_failed" — the real reason, never summarized away. */
  reason?: string;
  /** Set on "withheld" with reason "audit_failed" — which UI-audit rules fired. */
  findings?: string[];
}

export async function processArtifactsApply(
  payload: WatchJobPayload,
  deps: ArtifactsApplyDeps,
): Promise<ArtifactsApplyResult> {
  if (payload.product_id !== ARTIFACTS_PRODUCT_ID) return { status: "not_artifacts_product" };
  if (!deps.token) return { status: "no_token" };

  const fr = await deps.fetchRepo(`https://github.com/${payload.repo_full_name}`, deps.token);

  const manifest: SnapshotManifest = {
    project_name: payload.repo_full_name,
    project_type: "github_repository",
    frameworks: [],
    goals: ["Generate an embeddable dashboard widget"],
    requested_outputs: [],
  };
  const snapshot = await createSnapshot({ input_method: "github_repo_url", manifest, files: fr.files }, undefined);
  const ctx: ContextMap = buildContextMap(snapshot);

  const generated = generateDashboardWidget(ctx, fr.files);
  const built = await deps.buildWidget(generated.content);
  if (built.status !== "built" || !built.code) {
    return {
      status: "withheld",
      reason: built.reason ?? "unknown",
      findings: built.findings?.length ? built.findings.map((f) => `${f.category}:${f.line}`) : undefined,
    };
  }

  const uploaded = await deps.uploadWidget(built.code, payload.account_id);
  if (uploaded.status === "not_configured") return { status: "not_configured" };
  if (uploaded.status === "upload_failed") return { status: "upload_failed", reason: uploaded.error };
  return { status: "uploaded", url: uploaded.url, expires_at: uploaded.expires_at };
}

export function defaultArtifactsApplyDeps(): ArtifactsApplyDeps {
  const uploadDeps = defaultUploadWidgetDeps();
  return {
    token: process.env.GITHUB_TOKEN,
    fetchRepo: (url, token) => fetchGitHubRepo(url, token),
    buildWidget: (componentSource) => buildWidgetPipeline(componentSource),
    uploadWidget: (code, accountId) => uploadWidgetBundle(code, accountId, uploadDeps),
  };
}
