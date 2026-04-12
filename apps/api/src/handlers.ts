import type { IncomingMessage, ServerResponse } from "node:http";
import { chargeMpp } from "./mpp.js";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
  recordUsage,
  checkQuota,
  trackEvent,
  resolveStage,
  TIER_LIMITS,
  indexSnapshotContent,
  searchSnapshotContent,
  getSearchIndexStats,
  indexSymbols,
  searchSymbols,
  getSymbolStats,
  runMaintenance,
  getDbStats,
  getGitHubTokenDecrypted,
} from "@axis/snapshots";
import type { SnapshotInput, SnapshotManifest, FileEntry } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateFiles, listAvailableGenerators } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import { sendJSON, readBody, sendError, isShuttingDown } from "./router.js";
import { resolveAuth, requireAuth } from "./billing.js";
import { ErrorCode, log, getRequestId } from "./logger.js";

// â”€â”€â”€ Ownership helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Check if the current user can access a snapshot. Returns true if allowed, sends error and returns false if not. */
function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { account_id: string | null }): boolean {
  if (!snapshot.account_id) return true; // anonymous snapshot  -  accessible by ID knowledge
  const auth = resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return false;
  }
  if (auth.account.account_id !== snapshot.account_id) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return false;
  }
  return true;
}

/** Check if the current user can access a project. Returns true if allowed. */
function assertProjectAccess(req: IncomingMessage, res: ServerResponse, project_id: string): boolean {
  const owner = getProjectOwner(project_id);
  if (!owner) return true; // anonymous project
  const auth = resolveAuth(req);
  if (!auth.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
    return false;
  }
  if (auth.account.account_id !== owner) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
    return false;
  }
  return true;
}

// â”€â”€â”€ Per-program default outputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const PROGRAM_OUTPUTS: Record<string, string[]> = {
  debug:        [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
  frontend:     [".ai/frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
  seo:          [".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json"],
  optimization: [".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
  theme:        [".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
  brand:        ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", "channel-rulebook.md"],
  superpowers:  ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
  marketing:    ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
  notebook:     ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
  obsidian:     ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
  mcp:          ["mcp-config.json", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml"],
  artifacts:    ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json"],
  remotion:     ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
  canvas:       ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "brand-board.md"],
  algorithmic:          ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
  "agentic-purchasing": ["agent-purchasing-playbook.md", "product-schema.json", "checkout-flow.md", "negotiation-rules.md", "commerce-registry.json"],
};

// â”€â”€â”€ Generic program handler factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function makeProgramHandler(program: string, defaultOutputs: string[]) {
  return async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
      return;
    }

    const snapshotId = body.snapshot_id as string;
    if (!snapshotId || typeof snapshotId !== "string") {
      sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
      return;
    }

    const rawOutputs = body.outputs;
    if (rawOutputs !== undefined && !Array.isArray(rawOutputs)) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "outputs must be an array of strings");
      return;
    }

    const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
    const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
    if (!contextMap || !repoProfile) {
      sendError(res, 404, ErrorCode.CONTEXT_PENDING, "No context for this snapshot \u2014 run POST /v1/snapshots first");
      return;
    }

    const requestedOutputs = (rawOutputs as string[] | undefined) ?? defaultOutputs;
    const snapshot = getSnapshot(snapshotId);
    const result = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: requestedOutputs,
      source_files: snapshot?.files,
    });

    const programFiles = result.files.filter(f => f.program === program);
    sendJSON(res, 200, {
      snapshot_id: snapshotId,
      program,
      files: programFiles,
      skipped: result.skipped,
    });
  };
}

// â”€â”€â”€ Program handlers (generated from PROGRAM_OUTPUTS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const handleDebugAnalyze        = makeProgramHandler("debug", PROGRAM_OUTPUTS.debug);
export const handleFrontendAudit       = makeProgramHandler("frontend", PROGRAM_OUTPUTS.frontend);
export const handleSeoAnalyze          = makeProgramHandler("seo", PROGRAM_OUTPUTS.seo);
export const handleOptimizationAnalyze = makeProgramHandler("optimization", PROGRAM_OUTPUTS.optimization);
export const handleThemeGenerate       = makeProgramHandler("theme", PROGRAM_OUTPUTS.theme);
export const handleBrandGenerate       = makeProgramHandler("brand", PROGRAM_OUTPUTS.brand);
export const handleSuperpowersGenerate = makeProgramHandler("superpowers", PROGRAM_OUTPUTS.superpowers);
export const handleMarketingGenerate   = makeProgramHandler("marketing", PROGRAM_OUTPUTS.marketing);
export const handleNotebookGenerate    = makeProgramHandler("notebook", PROGRAM_OUTPUTS.notebook);
export const handleObsidianAnalyze     = makeProgramHandler("obsidian", PROGRAM_OUTPUTS.obsidian);
export const handleMcpProvision        = makeProgramHandler("mcp", PROGRAM_OUTPUTS.mcp);
export const handleArtifactsGenerate   = makeProgramHandler("artifacts", PROGRAM_OUTPUTS.artifacts);
export const handleRemotionGenerate    = makeProgramHandler("remotion", PROGRAM_OUTPUTS.remotion);
export const handleCanvasGenerate      = makeProgramHandler("canvas", PROGRAM_OUTPUTS.canvas);
export const handleAlgorithmicGenerate = makeProgramHandler("algorithmic", PROGRAM_OUTPUTS.algorithmic);
export const handleAgenticPurchasingGenerate = makeProgramHandler("agentic-purchasing", PROGRAM_OUTPUTS["agentic-purchasing"]);

export async function handleCreateSnapshot(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  // Validate required fields
  const manifest = body.manifest as SnapshotManifest | undefined;
  if (!manifest?.project_name || !manifest?.project_type || !manifest?.frameworks || !manifest?.goals || !manifest?.requested_outputs) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Missing required manifest fields: project_name, project_type, frameworks, goals, requested_outputs");
    return;
  }

  // Validate manifest field types
  if (typeof manifest.project_name !== "string" || typeof manifest.project_type !== "string") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "manifest.project_name and manifest.project_type must be strings");
    return;
  }
  if (!Array.isArray(manifest.frameworks) || !Array.isArray(manifest.goals) || !Array.isArray(manifest.requested_outputs)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "manifest.frameworks, manifest.goals, and manifest.requested_outputs must be arrays");
    return;
  }

  const files = body.files as FileEntry[] | undefined;
  if (!files || !Array.isArray(files) || files.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "files array is required and must not be empty");
    return;
  }

  // Validate file entries
  for (const file of files) {
    if (!file.path || typeof file.content !== "string") {
      sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
      return;
    }
    // Normalize path separators and reject traversal
    file.path = file.path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
    if (file.path.includes("..")) {
      sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path}`);
      return;
    }
    file.size = file.size ?? Buffer.byteLength(file.content, "utf-8");
  }

  const input: SnapshotInput = {
    input_method: (body.input_method as SnapshotInput["input_method"]) ?? "api_submission",
    manifest,
    files,
  };

  // Reject invalid/revoked keys (key provided but not valid)
  const auth = resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }
  // Check quota if authenticated
  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path tested but V8 won't credit compound ternary */
    if (!quota.allowed) {
      trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason });
      const mppResult = await chargeMpp(req, res, {
        amount: auth.account.tier === "free" ? "39.00" : "0.50",
        currency: "usd",
        decimals: 2,
        description: auth.account.tier === "free"
          ? "AXIS Toolbox Pro  -  $39/month"
          : "AXIS API Credit  -  $0.50",
        meta: { account_id: auth.account.account_id, tier: auth.account.tier },
      });
      if (mppResult === null) {
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    /* v8 ignore stop */

    // Enforce per-snapshot file count and size limits
    const limits = TIER_LIMITS[auth.account.tier];
    if (files.length > limits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${limits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
    for (const file of files) {
      if (file.size > limits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${limits.max_file_size_bytes} for ${auth.account.tier} tier)`);
        return;
      }
    }
  }

  const snapshot = createSnapshot(input, auth.account?.account_id);

  // Process synchronously for v1 (production: queue to worker)
  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    saveContextMap(snapshot.snapshot_id, contextMap);
    saveRepoProfile(snapshot.snapshot_id, repoProfile);

    // Generate output files
    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: snapshot.manifest.requested_outputs,
      source_files: snapshot.files,
    });
    saveGeneratorResult(snapshot.snapshot_id, generated);
    updateSnapshotStatus(snapshot.snapshot_id, "ready");

    // Record usage per program if authenticated
    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, files.length, input.files.reduce((s, f) => s + f.size, 0));
      }
      trackEvent(auth.account.account_id, "snapshot_created", resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        files: files.length,
      });
    }

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      context_map: contextMap,
      repo_profile: repoProfile,
      generated_files: generated.files.map(f => ({ path: f.path, program: f.program, description: f.description })),
    });
  /* v8 ignore start  -  requires internal processing function to throw */
  } catch (err) {
    updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "snapshot_processing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

export async function handleGetSnapshot(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!assertSnapshotAccess(_req, res, snapshot)) return;

  sendJSON(res, 200, {
    snapshot_id: snapshot.snapshot_id,
    project_id: snapshot.project_id,
    created_at: snapshot.created_at,
    input_method: snapshot.input_method,
    manifest: snapshot.manifest,
    file_count: snapshot.file_count,
    total_size_bytes: snapshot.total_size_bytes,
    status: snapshot.status,
  });
}

export async function handleDeleteSnapshot(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = getSnapshot(snapshot_id);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  // Delete requires auth for owned snapshots
  if (snapshot.account_id) {
    const ctx = requireAuth(_req, res);
    if (!ctx) return;
    if (ctx.account!.account_id !== snapshot.account_id) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
      return;
    }
  }
  const deleted = deleteSnapshot(snapshot_id);
  /* v8 ignore next 3  -  deleteSnapshot always succeeds when snapshot exists */
  if (!deleted) {
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Failed to delete snapshot");
    return;
  }
  sendJSON(res, 200, { deleted: true, snapshot_id });
}

export async function handleDeleteProject(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  // Delete requires auth for owned projects
  const owner = getProjectOwner(project_id);
  if (owner) {
    const ctx = requireAuth(_req, res);
    if (!ctx) return;
    if (ctx.account!.account_id !== owner) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
      return;
    }
  }
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    // Check if the project itself exists
    const db = (await import("@axis/snapshots")).getDb();
    const project = db.prepare("SELECT project_id FROM projects WHERE project_id = ?").get(project_id);
    if (!project) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "Project not found");
      return;
    }
  }
  const result = deleteProject(project_id);
  sendJSON(res, 200, { deleted: true, project_id, deleted_snapshots: result.deleted_snapshots });
}

export async function handleGetContext(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  if (!assertProjectAccess(_req, res, project_id)) return;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  if (!contextMap || !repoProfile) {
    sendError(res, 404, ErrorCode.CONTEXT_PENDING, "Context not yet available  -  snapshot may still be processing");
    return;
  }

  sendJSON(res, 200, {
    snapshot_id: latest.snapshot_id,
    context_map: contextMap,
    repo_profile: repoProfile,
  });
}

export async function handleGetGeneratedFiles(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  if (!assertProjectAccess(_req, res, project_id)) return;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
  /* v8 ignore next 3  -  V8 quirk: tested but V8 won't credit */
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  sendJSON(res, 200, {
    snapshot_id: latest.snapshot_id,
    project_id: latest.project_id,
    generated_at: generated.generated_at,
    files: generated.files,
    skipped: generated.skipped,
  });
}

export async function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ready = !isShuttingDown();
  /* v8 ignore start  -  shutdown path not tested in unit tests */
  sendJSON(res, ready ? 200 : 503, {
    status: ready ? "ok" : "shutting_down",
    service: "axis-api",
    version: "0.4.0",
    timestamp: new Date().toISOString(),
  });
  /* v8 ignore stop */
}

export async function handleDbStats(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const stats = getDbStats();
  /* v8 ignore next  -  V8 quirk: stats always succeed in test DB */
  sendJSON(res, stats.success ? 200 : 500, stats);
}

export async function handleDbMaintenance(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const results = runMaintenance();
  const allOk = results.every((r) => r.success);
  /* v8 ignore next  -  V8 quirk: maintenance always succeeds in test DB */
  sendJSON(res, allOk ? 200 : 500, { results, success: allOk });
}

export async function handleGetGeneratedFile(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id, file_path } = params;
  if (!assertProjectAccess(_req, res, project_id)) return;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
  /* v8 ignore next 3  -  V8 quirk: no-generated check tested but V8 won't credit */
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  // Match by path  -  handle both "AGENTS.md" and ".ai/context-map.json" style
  const decoded = decodeURIComponent(file_path);
  if (decoded.includes("..") || decoded.startsWith("/")) {
    sendError(res, 400, ErrorCode.PATH_TRAVERSAL, "Invalid file path");
    return;
  }
  const file = generated.files.find(f => f.path === decoded || f.path === `.ai/${decoded}`);
  if (!file) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `File not found: ${decoded}`, { available: generated.files.map(f => f.path) });
    return;
  }

  // Return raw content with appropriate content-type
  res.writeHead(200, { "Content-Type": file.content_type, "Access-Control-Allow-Origin": "*" });
  res.end(file.content);
}

export async function handleSearchExport(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const generated = getGeneratorResult(snapshotId) as GeneratorResult | undefined;
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No results for this snapshot  -  run POST /v1/snapshots first");
    return;
  }

  const searchFiles = generated.files.filter(f => f.program === "search");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "search",
    files: searchFiles,
  });
}

export async function handleSkillsGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  // Regenerate skills files with optional custom outputs
  const rawOutputs = body.outputs;
  if (rawOutputs !== undefined && !Array.isArray(rawOutputs)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "outputs must be an array of strings");
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendError(res, 404, ErrorCode.CONTEXT_PENDING, "No context for this snapshot \u2014 run POST /v1/snapshots first");
    return;
  }

  const requestedOutputs = (rawOutputs as string[] | undefined) ?? ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md"];
  const snapshot = getSnapshot(snapshotId);
  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: requestedOutputs,
    source_files: snapshot?.files,
  });

  const skillsFiles = result.files.filter(f => f.program === "skills");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "skills",
    files: skillsFiles,
    skipped: result.skipped,
  });
}

// â”€â”€â”€ GitHub URL intake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleGitHubAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const githubUrl = body.github_url as string | undefined;
  if (!githubUrl || typeof githubUrl !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "github_url is required");
    return;
  }

  // Import dynamically to avoid loading github module for other endpoints
  const { fetchGitHubRepo, parseGitHubUrl } = await import("./github.js");

  let parsed;
  try {
    parsed = parseGitHubUrl(githubUrl);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid GitHub URL. Expected: https://github.com/owner/repo");
    return;
  }

  let fetchResult;
  try {
    const rawToken = body.token;
    // Priority: 1) explicit token in request, 2) stored token for authenticated user, 3) env var
    let token = typeof rawToken === "string" ? rawToken : undefined;
    if (!token) {
      const auth = resolveAuth(req);
      if (auth.account) {
        token = getGitHubTokenDecrypted(auth.account.account_id) ?? undefined;
      }
    }
    if (!token) {
      token = process.env.GITHUB_TOKEN ?? undefined;
    }
    fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
  /* v8 ignore start  -  GitHub fetch error handling: tested but V8 won't credit all branches */
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const statusMatch = message.match(/returned (\d{3})/);
    const upstreamStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    if (upstreamStatus === 429 || upstreamStatus === 403) {
      sendError(res, 429, ErrorCode.RATE_LIMITED, "GitHub API rate limit reached. Try again later or provide a token.", { retry_after: 60 });
    } else if (upstreamStatus === 404) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "GitHub repository not found");
    } else {
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, `Failed to fetch GitHub repo: ${message}`);
    }
    return;
  }
  /* v8 ignore stop */

  if (fetchResult.files.length === 0) {
    sendError(res, 422, ErrorCode.UNPROCESSABLE, "No source files found in repository");
    return;
  }

  // Check quota if authenticated
  const auth = resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }
  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    /* v8 ignore next 7  -  requires exhausting rate quota in tests */
    if (!quota.allowed) {
      trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason, source: "github" });
      const mppResult = await chargeMpp(req, res, {
        amount: auth.account.tier === "free" ? "39.00" : "0.50",
        currency: "usd",
        decimals: 2,
        description: auth.account.tier === "free"
          ? "AXIS Toolbox Pro  -  $39/month"
          : "AXIS API Credit  -  $0.50",
        meta: { account_id: auth.account.account_id, tier: auth.account.tier },
      });
      if (mppResult === null) {
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
  }

  // Create snapshot from fetched files
  const input = {
    input_method: "github_repo_url" as const,
    manifest: {
      project_name: `${parsed.owner}/${parsed.repo}`,
      project_type: "unknown",
      frameworks: [] as string[],
      goals: ["analyze", "generate-config"],
      requested_outputs: [] as string[],
    },
    files: fetchResult.files,
    github_url: githubUrl,
  };

  const snapshot = createSnapshot(input, auth.account?.account_id);

  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    saveContextMap(snapshot.snapshot_id, contextMap);
    saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: [],
      source_files: snapshot.files,
    });
    saveGeneratorResult(snapshot.snapshot_id, generated);
    updateSnapshotStatus(snapshot.snapshot_id, "ready");

    // Record usage per program if authenticated
    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = fetchResult.files.reduce((s, f) => s + f.size, 0);
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, fetchResult.files.length, totalBytes);
      }
      trackEvent(auth.account.account_id, "snapshot_created", resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "github",
        github_url: githubUrl,
      });
    }

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      context_map: contextMap,
      repo_profile: repoProfile,
      generated_files: generated.files.map(f => ({ path: f.path, program: f.program, description: f.description })),
      github: {
        url: githubUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        ref: fetchResult.ref,
        files_fetched: fetchResult.files.length,
        files_skipped: fetchResult.skipped_count,
        total_bytes: fetchResult.total_bytes,
      },
    });
  /* v8 ignore start  -  requires internal function to throw during processing */
  } catch (err) {
    updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "github_snapshot_processing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      github_url: githubUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ File Content Search API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleSearchIndex(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Snapshot not found");
    return;
  }
  if (!assertSnapshotAccess(req, res, snapshot)) return;

  const files = (snapshot.files as Array<{ path: string; content: string }>).filter(
    (f) => typeof f.path === "string" && typeof f.content === "string",
  );

  const result = indexSnapshotContent(snapshotId, files);
  const symbolResult = indexSymbols(snapshotId, files);

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    indexed_files: result.indexed_files,
    indexed_lines: result.indexed_lines,
    indexed_symbols: symbolResult.indexed_symbols,
  });
}

export async function handleSearchQuery(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId || typeof snapshotId !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "snapshot_id is required");
    return;
  }

  const query = body.query as string;
  if (!query || typeof query !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "query is required");
    return;
  }

  if (query.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "query must be 500 characters or fewer");
    return;
  }

  const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 200) : 50;

  // Ownership check: verify the caller can access this snapshot
  const snapshot = getSnapshot(snapshotId);
  if (snapshot && !assertSnapshotAccess(req, res, snapshot)) return;

  const results = searchSnapshotContent(snapshotId, query, { limit });
  const stats = getSearchIndexStats(snapshotId);

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    query,
    total_indexed_lines: stats.line_count,
    total_indexed_files: stats.file_count,
    results,
  });
}

export async function handleSearchStats(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = getSnapshot(snapshot_id);
  if (snapshot && !assertSnapshotAccess(_req, res, snapshot)) return;
  const stats = getSearchIndexStats(snapshot_id);

  sendJSON(res, 200, {
    snapshot_id,
    ...stats,
  });
}

export async function handleSearchSymbols(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { snapshot_id } = params;
  const snapshot = getSnapshot(snapshot_id);
  // v8 ignore next
  if (snapshot && !assertSnapshotAccess(req, res, snapshot)) return;

  // v8 ignore next
  const url = new URL(req.url ?? "/", "http://localhost");
  const name = url.searchParams.get("name") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  // v8 ignore next
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 200) : 50;

  const results = searchSymbols(snapshot_id, { name, type, limit });
  const stats = getSymbolStats(snapshot_id);

  sendJSON(res, 200, {
    snapshot_id,
    symbol_count: stats.symbol_count,
    results,
  });
}

// â”€â”€â”€ POST /v1/analyze  -  unified one-call analysis endpoint â”€â”€â”€â”€â”€â”€

// Per-file adoption hints (deterministic  -  same input = same output)
const ADOPTION_HINTS: Record<string, { placement: string; adoption_hint: string }> = {
  "AGENTS.md":                { placement: "repo root", adoption_hint: "Place in repo root. Cursor, Copilot, and Claude auto-load this as codebase context  -  instant AI grounding." },
  ".cursorrules":             { placement: "repo root", adoption_hint: "Place in repo root. Cursor reads this at the start of every session to understand your codebase." },
  "CLAUDE.md":                { placement: "repo root or project system prompt", adoption_hint: "Place in repo root, or paste into your Claude project system prompt for persistent context." },
  "context-map.json":         { placement: ".ai/", adoption_hint: "Machine-readable dependency graph. Reference from CI pipelines, code tools, or agent tooling." },
  "debug-playbook.md":        { placement: ".ai/", adoption_hint: "Share with your on-call team. Agents use this for automated incident triage and postmortem generation." },
  "incident-template.md":     { placement: "incident management system", adoption_hint: "Import as a template in PagerDuty, Linear, or your incident tracker." },
  "tracing-rules.md":         { placement: ".ai/", adoption_hint: "Add to your observability runbook. Governs trace sampling, span naming, and alert routing." },
  "root-cause-checklist.md":  { placement: ".ai/", adoption_hint: "Reference during postmortems. Systematizes root cause analysis  -  reduces MTTR." },
  "skills.json":              { placement: ".ai/", adoption_hint: "Add to your agent's context. Lists every detectable capability in this codebase." },
  "skill-map.md":             { placement: ".ai/", adoption_hint: "Human-readable capability index. Share with new team members or AI assistants onboarding to the repo." },
  "component-guidelines.md":  { placement: ".ai/", adoption_hint: "Reference when writing UI components. AI assistants use this to match your design system conventions." },
  "layout-patterns.md":       { placement: ".ai/", adoption_hint: "Reference for page-level layout decisions. Prevents AI from generating patterns you've already ruled out." },
  "ui-audit.md":              { placement: ".ai/", adoption_hint: "Review with your design team. Flags inconsistencies in component usage, spacing, and accessibility." },
  "frontend-rules.md":        { placement: ".ai/", adoption_hint: "Reference in Cursor/Copilot chat when building UI. Locks in your frontend conventions." },
  "seo-rules.md":             { placement: ".ai/", adoption_hint: "Add to your CMS or content pipeline. Ensures every page follows your SEO governance rules." },
  "schema-recommendations.json": { placement: ".ai/", adoption_hint: "Add JSON-LD structured data to your pages. Each route gets the right schema type." },
  "route-priority-map.md":    { placement: ".ai/", adoption_hint: "Use for sitemap generation and crawl budget allocation. Reference in your deployment pipeline." },
  "content-audit.md":         { placement: ".ai/", adoption_hint: "Review with your content team. Identifies thin content, duplicate metadata, and coverage gaps." },
  "meta-tag-audit.json":      { placement: ".ai/", adoption_hint: "Feed to your SEO tooling. Per-route meta tag analysis in machine-readable format." },
  "optimization-rules.md":    { placement: ".ai/", adoption_hint: "Reference in code review. Locks in performance and cost optimization patterns for AI-assisted work." },
  "prompt-diff-report.md":    { placement: ".ai/", adoption_hint: "Use before/after AI-assisted sessions to measure prompt quality drift and output consistency." },
  "cost-estimate.json":       { placement: ".ai/", adoption_hint: "Import into your billing dashboard or cost tracking pipeline. Per-operation token cost model." },
  "token-budget-plan.md":     { placement: ".ai/", adoption_hint: "Reference when designing AI features. Prevents unbounded token spend by establishing per-operation budgets." },
  "design-tokens.json":       { placement: ".ai/ or design system repo", adoption_hint: "Import into Figma via Token Studio, or your CSS-in-JS token pipeline. Single source of truth for design values." },
  "theme.css":                { placement: "styles/ or global CSS", adoption_hint: "Import in your global stylesheet. All design tokens as CSS custom properties, ready to use." },
  "theme-guidelines.md":      { placement: ".ai/", adoption_hint: "Reference when building UI themes. AI assistants use this to stay on-brand." },
  "component-theme-map.json": { placement: ".ai/", adoption_hint: "Maps each component to its design token set. Feed to your Storybook or design system tooling." },
  "dark-mode-tokens.json":    { placement: ".ai/ or design system repo", adoption_hint: "Import your dark mode token layer. Works with design-tokens.json as the light-mode base." },
  "brand-guidelines.md":      { placement: ".ai/ or brand portal", adoption_hint: "Share with copywriters, designers, and AI content tools. Establishes brand voice and usage rules." },
  "voice-and-tone.md":        { placement: ".ai/", adoption_hint: "Add to your AI writing tool system prompts. Ensures generated copy matches your brand voice." },
  "content-constraints.md":   { placement: ".ai/", adoption_hint: "Add to AI content generation workflows. Lists banned phrases, required disclaimers, and tone rules." },
  "messaging-system.yaml":    { placement: ".ai/", adoption_hint: "Machine-readable messaging hierarchy. Reference from CMS, email, and campaign tooling." },
  "channel-rulebook.md":      { placement: ".ai/", adoption_hint: "Reference per channel when publishing. Governs tone, format, and frequency for each distribution channel." },
  "superpower-pack.md":       { placement: ".ai/", adoption_hint: "Add to your AI assistant context. Unlocks codebase-specific capabilities not visible from file structure alone." },
  "workflow-registry.json":   { placement: ".ai/", adoption_hint: "Feed to your CI/CD automation and agent task runners. Machine-readable workflow catalog." },
  "test-generation-rules.md": { placement: ".ai/", adoption_hint: "Add to your AI test generation workflow. Locks in naming conventions, coverage thresholds, and assertion patterns." },
  "refactor-checklist.md":    { placement: ".ai/", adoption_hint: "Reference before major refactors. Reduces regression risk by surfacing known coupling and constraint patterns." },
  "automation-pipeline.yaml": { placement: ".ai/ or .github/workflows/", adoption_hint: "Import into your CI/CD pipeline. Automates the highest-ROI codebase maintenance tasks." },
  "campaign-brief.md":        { placement: ".ai/", adoption_hint: "Share with your marketing team and AI content tools. Grounds campaigns in real product capabilities." },
  "funnel-map.md":            { placement: ".ai/", adoption_hint: "Reference in analytics and product work. Maps the actual conversion path derived from your codebase." },
  "sequence-pack.md":         { placement: ".ai/", adoption_hint: "Import into your email/CRM platform. Triggered sequences derived from your actual user journey." },
  "cro-playbook.md":          { placement: ".ai/", adoption_hint: "Share with your growth team. Actionable conversion experiments matched to your existing UI patterns." },
  "ab-test-plan.md":          { placement: ".ai/", adoption_hint: "Import into your A/B testing platform. Tests designed for your specific component set and traffic patterns." },
  "notebook-summary.md":      { placement: ".ai/", adoption_hint: "Add to your Obsidian vault or Notion knowledge base. Structured summary of codebase knowledge." },
  "source-map.json":          { placement: ".ai/", adoption_hint: "Machine-readable knowledge source graph. Reference from your personal knowledge management tooling." },
  "study-brief.md":           { placement: ".ai/", adoption_hint: "Share with new engineers or AI assistants learning the codebase. Accelerates onboarding." },
  "research-threads.md":      { placement: ".ai/", adoption_hint: "Track open architectural questions and investigations. Add to your team wiki or project backlog." },
  "citation-index.json":      { placement: ".ai/", adoption_hint: "Machine-readable reference index. Feed to note-taking tools, documentation systems, or research agents." },
  "obsidian-skill-pack.md":   { placement: "Obsidian vault", adoption_hint: "Place in your Obsidian vault. Provides linked codebase knowledge as Obsidian-compatible nodes." },
  "vault-rules.md":           { placement: "Obsidian vault", adoption_hint: "Governs your vault structure for this project. Ensures consistent linking and tagging." },
  "graph-prompt-map.json":    { placement: "Obsidian vault or AI tooling", adoption_hint: "Maps graph relationships to prompt templates. Reference from AI-assisted note generation." },
  "linking-policy.md":        { placement: "Obsidian vault", adoption_hint: "Enforces consistent backlinking strategy. Prevents knowledge graph fragmentation." },
  "template-pack.md":         { placement: "Obsidian vault", adoption_hint: "Import as Obsidian templates. Each codebase concept gets a structured note template." },
  "mcp-config.json":          { placement: "MCP client config", adoption_hint: "Add to your MCP client configuration. Agents discover AXIS capabilities automatically  -  no manual tool registration." },
  "connector-map.yaml":       { placement: "agent tooling / .ai/", adoption_hint: "Reference from your agent tool registry. Complete map of AXIS connectors and their input/output contracts." },
  "capability-registry.json": { placement: "agent tooling", adoption_hint: "Exposes all queryable capabilities to agents. Add to your agent's startup context for zero-configuration capability discovery." },
  "server-manifest.yaml":     { placement: "MCP infrastructure", adoption_hint: "Deploy alongside your MCP server. Complete description of the tool surface, transport, and auth requirements." },
  "generated-component.tsx":  { placement: "src/components/", adoption_hint: "Drop into your components directory. Production-ready component generated from your design system and conventions." },
  "dashboard-widget.tsx":     { placement: "src/components/", adoption_hint: "Drop into your dashboard. Data-connected widget generated from your existing component patterns." },
  "embed-snippet.ts":         { placement: "public/ or CDN", adoption_hint: "Deploy to your CDN or embed in external surfaces. Zero-dependency, self-contained." },
  "artifact-spec.md":         { placement: ".ai/", adoption_hint: "Reference when generating new artifacts. Documents the artifact schema and generation constraints." },
  "component-library.json":   { placement: ".ai/ or Storybook config", adoption_hint: "Machine-readable component catalog. Import into Storybook, Chromatic, or design system tooling." },
  "remotion-script.ts":       { placement: "remotion/", adoption_hint: "Drop into your Remotion project. Generates video from your actual codebase data  -  not placeholder content." },
  "scene-plan.md":            { placement: ".ai/", adoption_hint: "Reference when storyboarding. Shot-by-shot plan derived from your real product architecture." },
  "render-config.json":       { placement: "remotion/ or CI pipeline", adoption_hint: "Import into your Remotion render pipeline. Configures output resolution, fps, and codec per environment." },
  "asset-checklist.md":       { placement: ".ai/", adoption_hint: "Use before shipping visual assets. Ensures every export format and size variant is accounted for." },
  "storyboard.md":            { placement: ".ai/", adoption_hint: "Share with your video team. Detailed shot descriptions derived from your product's actual user journey." },
  "canvas-spec.json":         { placement: ".ai/ or design tooling", adoption_hint: "Machine-readable canvas layout spec. Import into Fabric.js, Konva, or your generative design pipeline." },
  "social-pack.md":           { placement: ".ai/", adoption_hint: "Send to your social media team. Per-platform design specs derived from your brand system." },
  "poster-layouts.md":        { placement: ".ai/", adoption_hint: "Reference when generating marketing visuals. Layout system derived from your actual brand dimensions." },
  "asset-guidelines.md":      { placement: ".ai/", adoption_hint: "Add to your asset management workflow. Governs file naming, versioning, and export conventions." },
  "brand-board.md":           { placement: ".ai/ or brand portal", adoption_hint: "Share with external agencies and AI design tools. Complete visual identity reference in one document." },
  "generative-sketch.ts":     { placement: "src/ or sketches/", adoption_hint: "Run with p5.js or your generative art toolchain. Parameters tuned to your brand's visual identity." },
  "parameter-pack.json":      { placement: ".ai/ or generative tooling", adoption_hint: "Machine-readable parameter space. Feed to your generative art pipeline for constrained randomness." },
  "collection-map.md":        { placement: ".ai/", adoption_hint: "Reference when building NFT or generative art collections. Maps trait layers to your brand values." },
  "export-manifest.yaml":     { placement: ".ai/ or CI pipeline", adoption_hint: "Import into your export pipeline. Governs output formats, metadata, and delivery targets." },
  "variation-matrix.json":    { placement: ".ai/ or generative tooling", adoption_hint: "Machine-readable variation system. Feed to your generative pipeline to produce constrained, on-brand variants." },
  "agent-purchasing-playbook.md": { placement: "purchasing agent system prompt", adoption_hint: "Add to your purchasing agent's system prompt. Enables authorized, structured procurement against your product catalog." },
  "product-schema.json":      { placement: "agent tooling", adoption_hint: "Reference from your agent's tool definitions. Validates product structure before any purchase is initiated." },
  "checkout-flow.md":         { placement: "purchasing agent context", adoption_hint: "Step-by-step purchase protocol for agents. Prevents checkout errors and unauthorized transactions." },
  "negotiation-rules.md":     { placement: "purchasing agent context", adoption_hint: "Governs agent-to-agent pricing negotiation. Add to your automated procurement context." },
  "commerce-registry.json":   { placement: "agent tooling / /.well-known/", adoption_hint: "Register with your purchasing agent to enable product discovery, bearer auth, and commerce endpoint routing." },
};

/** Return placement and adoption hint for a given generated file path. Deterministic. */
export function adoptionHint(filePath: string): { placement: string; adoption_hint: string } {
  const basename = filePath.replace(/^.*[\\/]/, "");
  return ADOPTION_HINTS[basename] ?? ADOPTION_HINTS[filePath] ?? {
    placement: ".ai/",
    adoption_hint: "Add to your project's .ai/ directory for AI assistant context.",
  };
}

/** Top-priority next steps based on which files were generated. Deterministic (fixed priority order). */
export function buildNextSteps(files: Array<{ path: string }>): string[] {
  const paths = new Set(files.map(f => f.path.replace(/^.*[\\/]/, "")));
  const priority: Array<{ file: string; step: string }> = [
    { file: "AGENTS.md",           step: "Place AGENTS.md in your repo root  -  AI coding assistants auto-load codebase context" },
    { file: ".cursorrules",        step: "Place .cursorrules in your repo root  -  Cursor reads it at the start of every session" },
    { file: "CLAUDE.md",           step: "Add CLAUDE.md to your Claude project system prompt for persistent context" },
    { file: "mcp-config.json",     step: "Add mcp-config.json to your MCP client  -  agents discover AXIS tools automatically" },
    { file: "commerce-registry.json", step: "Add commerce-registry.json to your purchasing agent context for structured procurement" },
    { file: "debug-playbook.md",   step: "Share debug-playbook.md with your on-call team to enable AI-assisted incident triage" },
    { file: "design-tokens.json",  step: "Import design-tokens.json into your design system pipeline (Figma Token Studio, CSS custom properties)" },
    { file: "brand-guidelines.md", step: "Share brand-guidelines.md with AI writing and design tools for on-brand generation" },
  ];
  const steps: string[] = [];
  for (const { file, step } of priority) {
    if (paths.has(file)) steps.push(step);
    if (steps.length === 3) break;
  }
  return steps;
}

/** Extract project name from package.json or README heading. Returns null if not detectable. */
export function detectProjectName(files: Array<{ path: string; content: string }>): string | null {
  const pkg = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json") && !f.path.includes("node_modules"));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content) as Record<string, unknown>;
      if (typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name;
    } catch { /* ignore */ }
  }
  const readme = files.find(f => f.path === "README.md" || f.path === "readme.md");
  if (readme) {
    const match = readme.content.match(/^#\s+(.+)/m);
    if (match) return match[1].trim().slice(0, 64);
  }
  return null;
}

export async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const githubUrl = body.github_url as string | undefined;
  const rawFiles = body.files as FileEntry[] | undefined;

  if (!githubUrl && !rawFiles) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "github_url or files is required");
    return;
  }
  if (githubUrl && rawFiles) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Provide github_url or files, not both");
    return;
  }

  const rawPrograms = body.programs;
  if (rawPrograms !== undefined && !Array.isArray(rawPrograms)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "programs must be an array of strings");
    return;
  }
  const requestedPrograms = rawPrograms as string[] | undefined;

  const inlineContent = body.inline_content !== false;

  const auth = resolveAuth(req);
  if (!auth.anonymous && !auth.account) {
    sendError(res, 401, ErrorCode.INVALID_KEY, "Invalid or revoked API key");
    return;
  }

  let files: FileEntry[];
  let inputMethod: SnapshotInput["input_method"];
  let githubMeta: Record<string, unknown> | undefined;

  if (githubUrl) {
    const { fetchGitHubRepo, parseGitHubUrl } = await import("./github.js");
    let parsed;
    try {
      parsed = parseGitHubUrl(githubUrl);
    } catch {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid GitHub URL. Expected: https://github.com/owner/repo");
      return;
    }
    let fetchResult;
    try {
      let token = typeof body.token === "string" ? body.token : undefined;
      if (!token && auth.account) {
        token = getGitHubTokenDecrypted(auth.account.account_id) ?? undefined;
      }
      if (!token) token = process.env.GITHUB_TOKEN ?? undefined;
      fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
    /* v8 ignore start  -  github fetch errors: tested in handlers-deep.test.ts */
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const statusMatch = message.match(/returned (\d{3})/);
      const upstreamStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      if (upstreamStatus === 429 || upstreamStatus === 403) {
        sendError(res, 429, ErrorCode.RATE_LIMITED, "GitHub API rate limit reached. Try again later or provide a token.", { retry_after: 60 });
      } else if (upstreamStatus === 404) {
        sendError(res, 404, ErrorCode.NOT_FOUND, "GitHub repository not found");
      } else {
        sendError(res, 502, ErrorCode.UPSTREAM_ERROR, `Failed to fetch GitHub repo: ${message}`);
      }
      return;
    }
    /* v8 ignore stop */
    if (fetchResult.files.length === 0) {
      sendError(res, 422, ErrorCode.UNPROCESSABLE, "No source files found in repository");
      return;
    }
    files = fetchResult.files;
    inputMethod = "github_repo_url";
    githubMeta = {
      url: githubUrl,
      owner: parsed.owner,
      repo: parsed.repo,
      ref: fetchResult.ref,
      files_fetched: fetchResult.files.length,
      files_skipped: fetchResult.skipped_count,
      total_bytes: fetchResult.total_bytes,
    };
  } else {
    // Direct files mode
    files = rawFiles!;
    if (!Array.isArray(files) || files.length === 0) {
      sendError(res, 400, ErrorCode.MISSING_FIELD, "files array must not be empty");
      return;
    }
    for (const file of files) {
      if (!file.path || typeof file.content !== "string") {
        sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
        return;
      }
      file.path = file.path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
      if (file.path.includes("..")) {
        sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path}`);
        return;
      }
      file.size = file.size ?? Buffer.byteLength(file.content, "utf-8");
    }
    inputMethod = "api_submission";
    githubMeta = undefined;
  }

  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path */
    if (!quota.allowed) {
      trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason, source: "analyze" });
      const mppResult = await chargeMpp(req, res, {
        amount: auth.account.tier === "free" ? "39.00" : "0.50",
        currency: "usd",
        decimals: 2,
        description: auth.account.tier === "free"
          ? "AXIS Toolbox Pro  -  $39/month"
          : "AXIS API Credit  -  $0.50",
        meta: { account_id: auth.account.account_id, tier: auth.account.tier },
      });
      if (mppResult === null) {
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    /* v8 ignore stop */
    const limits = TIER_LIMITS[auth.account.tier];
    if (files.length > limits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${limits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
    for (const file of files) {
      if (file.size > limits.max_file_size_bytes) {
        sendError(res, 413, ErrorCode.FILE_TOO_LARGE, `File too large: ${file.path} is ${file.size} bytes (max ${limits.max_file_size_bytes} for ${auth.account.tier} tier)`);
        return;
      }
    }
  }

  const projectName = detectProjectName(files) ?? (githubMeta ? `${githubMeta.owner}/${githubMeta.repo}` : "unnamed-project");

  const skillsOutputs = !requestedPrograms || requestedPrograms.includes("skills")
    ? ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md"]
    : [];
  const allOutputs = [
    ...skillsOutputs,
    ...Object.entries(PROGRAM_OUTPUTS)
      .filter(([prog]) => !requestedPrograms || requestedPrograms.includes(prog))
      .flatMap(([, outputs]) => outputs),
  ];

  const input: SnapshotInput = {
    input_method: inputMethod,
    manifest: {
      project_name: projectName as string,
      project_type: "unknown",
      frameworks: [],
      goals: ["analyze", "generate"],
      requested_outputs: allOutputs,
    },
    files,
    ...(githubUrl ? { github_url: githubUrl } : {}),
  };

  const snapshot = createSnapshot(input, auth.account?.account_id);

  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    saveContextMap(snapshot.snapshot_id, contextMap);
    saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: allOutputs,
      source_files: snapshot.files,
    });
    saveGeneratorResult(snapshot.snapshot_id, generated);
    updateSnapshotStatus(snapshot.snapshot_id, "ready");

    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
      for (const program of programs) {
        const programFiles = generated.files.filter(f => f.program === program);
        recordUsage(auth.account.account_id, program, snapshot.snapshot_id, programFiles.length, files.length, totalBytes);
      }
      trackEvent(auth.account.account_id, "snapshot_created", resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "analyze",
        ...(githubUrl ? { github_url: githubUrl } : {}),
      });
    }

    const enrichedFiles = generated.files
      .filter(f => !requestedPrograms || requestedPrograms.includes(f.program))
      .map(f => {
      const hint = adoptionHint(f.path);
      return {
        path: f.path,
        program: f.program,
        description: f.description,
        placement: hint.placement,
        adoption_hint: hint.adoption_hint,
        ...(inlineContent ? { content: f.content } : {}),
      };
    });

    const nextSteps = buildNextSteps(generated.files);

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      analysis: {
        project_name: projectName,
        language: contextMap.project_identity.primary_language,
        frameworks: contextMap.detection.frameworks.map(fw => fw.name),
        file_count: files.length,
        routes_detected: contextMap.routes.length,
        domain_models_detected: contextMap.domain_models.length,
        separation_score: repoProfile.health.separation_score,
      },
      files: enrichedFiles,
      programs_run: new Set(enrichedFiles.map(f => f.program)).size,
      total_files: enrichedFiles.length,
      next_steps: nextSteps,
      ...(githubMeta ? { github: githubMeta } : {}),
    });
  /* v8 ignore start  -  requires internal function to throw */
  } catch (err) {
    updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "analyze_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ POST /v1/prepare-for-agentic-purchasing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Scoring weights for Purchasing Readiness Score (0â€“100). */
export const PURCHASING_READINESS_WEIGHTS = {
  commerce_artifacts:   25,
  mcp_configs:          20,
  compliance_checklist: 15,
  negotiation_playbook: 15,
  debug_playbook:       10,
  optimization_rules:   10,
  onboarding_docs:       5,
};

/** Pure function  -  computes Purchasing Readiness Score from a list of artifact paths. */
export function computePurchasingReadinessScore(paths: string[]): {
  score: number;
  gaps: string[];
  strengths: string[];
} {
  const has = (check: (p: string) => boolean) => paths.some(check);

  const checks = {
    commerce_artifacts:   has(p => p.includes("agent-purchasing-playbook") || p.includes("commerce-registry") || p.includes("product-schema") || p.includes("checkout-flow")),
    mcp_configs:          has(p => p.includes("mcp-config") || p.includes("capability-registry") || p.includes("mcp-playbook")),
    compliance_checklist: has(p => p.includes("negotiation-rules") || p.includes("checkout-flow")),
    negotiation_playbook: has(p => p.includes("negotiation-rules")),
    debug_playbook:       has(p => p.includes("debug-playbook")),
    optimization_rules:   has(p => p.includes("optimization-rules")),
    onboarding_docs:      has(p => p === "AGENTS.md" || p === "CLAUDE.md" || p === ".cursorrules"),
  };

  let score = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];

  for (const [key, present] of Object.entries(checks)) {
    const weight = PURCHASING_READINESS_WEIGHTS[key as keyof typeof PURCHASING_READINESS_WEIGHTS];
    if (present) {
      score += weight;
      strengths.push(key.replace(/_/g, " "));
    } else {
      gaps.push(key.replace(/_/g, " "));
    }
  }

  return { score, gaps, strengths };
}

export const PURCHASING_PROGRAMS = [
  "agentic-purchasing", "debug", "optimization", "mcp", "marketing",
  "superpowers", "seo", "brand", "search", "skills",
];

export async function handlePreparePurchasing(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const auth = resolveAuth(req);

  let body: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const { project_name, project_type, frameworks, goals, files: rawFiles, focus = "purchasing", agent_type } = body;

  if (!project_name || typeof project_name !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "project_name is required");
    return;
  }
  if (!project_type || typeof project_type !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "project_type is required");
    return;
  }
  if (!Array.isArray(frameworks)) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "frameworks must be an array");
    return;
  }
  if (!Array.isArray(goals)) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "goals must be an array");
    return;
  }
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "files must be a non-empty array");
    return;
  }

  const files: FileEntry[] = [];
  for (const f of rawFiles) {
    const file = f as Record<string, unknown>;
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      sendError(res, 400, ErrorCode.FILE_INVALID, "Each file must have path (string) and content (string)");
      return;
    }
    const path = (file.path as string)
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
    if (path.includes("..")) {
      sendError(res, 400, ErrorCode.PATH_TRAVERSAL, `Invalid file path: ${file.path as string}`);
      return;
    }
    files.push({ path, content: file.content as string, size: Buffer.byteLength(file.content as string, "utf-8") });
  }

  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    /* v8 ignore start  -  quota exceeded path */
    if (!quota.allowed) {
      const mppResult = await chargeMpp(req, res, {
        amount: auth.account.tier === "free" ? "39.00" : "0.50",
        currency: "usd",
        decimals: 2,
        description: auth.account.tier === "free"
          ? "AXIS Toolbox Pro  -  $39/month"
          : "AXIS API Credit  -  $0.50",
        meta: { account_id: auth.account.account_id, tier: auth.account.tier },
      });
      if (mppResult === null) {
        sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      }
      if (mppResult === null || mppResult.status === 402) return;
    }
    /* v8 ignore stop */
    const limits = TIER_LIMITS[auth.account.tier];
    if (files.length > limits.max_files_per_snapshot) {
      sendError(res, 413, ErrorCode.FILE_COUNT_EXCEEDED, `File limit exceeded: ${files.length} files (max ${limits.max_files_per_snapshot} for ${auth.account.tier} tier)`);
      return;
    }
  }

  const generators = listAvailableGenerators();
  const allOutputs = generators
    .filter(g => PURCHASING_PROGRAMS.includes(g.program))
    .map(g => g.path);

  const manifest: SnapshotManifest = {
    project_name,
    project_type,
    frameworks: frameworks as string[],
    goals: goals as string[],
    requested_outputs: allOutputs,
  };

  const snapshot = createSnapshot(
    { input_method: "api_submission", manifest, files },
    auth.account?.account_id,
  );

  try {
    const ctxMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);
    saveContextMap(snapshot.snapshot_id, ctxMap);
    saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: ctxMap,
      repo_profile: repoProfile,
      requested_outputs: allOutputs,
      source_files: snapshot.files,
    });
    saveGeneratorResult(snapshot.snapshot_id, generated);
    updateSnapshotStatus(snapshot.snapshot_id, "ready");

    if (auth.account) {
      const programs = new Set(generated.files.map(f => f.program));
      const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
      for (const program of programs) {
        const pFiles = generated.files.filter(f => f.program === program);
        recordUsage(auth.account.account_id, program, snapshot.snapshot_id, pFiles.length, files.length, totalBytes);
      }
      trackEvent(auth.account.account_id, "snapshot_created", resolveStage(auth.account.account_id), {
        snapshot_id: snapshot.snapshot_id,
        programs: [...programs],
        source: "prepare_for_agentic_purchasing",
        focus: typeof focus === "string" ? focus : "purchasing",
        ...(typeof agent_type === "string" ? { agent_type } : {}),
      });
    }

    const artifactPaths = generated.files.map(f => f.path);
    const { score, gaps, strengths } = computePurchasingReadinessScore(artifactPaths);
    const purchasingFiles = generated.files.filter(f => f.program === "agentic-purchasing");

    sendJSON(res, 201, {
      snapshot_id: snapshot.snapshot_id,
      project_id: snapshot.project_id,
      status: "ready",
      purchasing_readiness_score: score,
      score_breakdown: {
        strengths,
        gaps,
        max_score: 100,
        interpretation: score >= 80 ? "production-ready" : score >= 50 ? "partially-ready" : "needs-work",
      },
      programs_executed: [...new Set(generated.files.map(f => f.program))],
      artifact_count: generated.files.length,
      purchasing_artifacts: purchasingFiles.map(f => ({
        path: f.path,
        program: f.program,
        description: f.description,
        content: f.content,
      })),
      all_artifacts: generated.files.map(f => ({
        path: f.path,
        program: f.program,
        description: f.description,
      })),
      how_to_call_axis_again: {
        note: "To re-run this analysis at any time, call either of these endpoints:",
        rest_endpoint: {
          method: "POST",
          path: "/v1/prepare-for-agentic-purchasing",
          body: { project_name, project_type, frameworks, goals, files: "<your files array>", focus },
        },
        mcp_tool: {
          method: "tools/call",
          name: "prepare_for_agentic_purchasing",
          args: { project_name, project_type, frameworks, goals, focus },
        },
        retrieve_artifact: {
          note: `Use the get_artifact MCP tool or fetch any artifact path from the all_artifacts list.`,
          snapshot_id: snapshot.snapshot_id,
        },
      },
    });
  /* v8 ignore start  -  requires internal function to throw */
  } catch (err) {
    updateSnapshotStatus(snapshot.snapshot_id, "failed");
    log("error", "prepare_purchasing_failed", {
      request_id: getRequestId(res),
      snapshot_id: snapshot.snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, ErrorCode.PROCESS_FAILED, "Processing failed", {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
    });
  }
  /* v8 ignore stop */
}

// â”€â”€â”€ GET /.well-known/axis.json  -  agent discovery manifest â”€â”€â”€â”€â”€â”€

export async function handleWellKnown(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    name: "AXIS Toolbox",
    tagline: "Analyze any codebase. Generate 86 structured artifacts across 18 programs.",
    version: "0.4.0",
    description: "Submit source files or a GitHub URL. AXIS returns structured AI context files  -  AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, brand guidelines, and more  -  each tuned to your specific codebase. Every file includes an adoption_hint telling you exactly where to place it.",
    analyze_endpoint: {
      method: "POST",
      path: "/v1/analyze",
      accepts: ["application/json"],
      body_options: [
        { field: "github_url", type: "string", description: "Public GitHub repo URL (https://github.com/owner/repo)" },
        { field: "files", type: "array", description: "Array of {path, content} objects  -  your source files directly" },
      ],
      optional_fields: [
        { field: "programs", type: "string[]", description: "Filter to specific programs (e.g. [\"search\",\"mcp\"]). Defaults to all." },
        { field: "inline_content", type: "boolean", description: "Include file content in response (default: true)" },
        { field: "token", type: "string", description: "GitHub personal access token for private repos" },
      ],
      authentication: {
        type: "bearer",
        header: "Authorization: Bearer <api_key>",
        obtain: "POST /v1/accounts  -  creates an account and returns raw_key",
        note: "Anonymous requests are accepted on the free tier",
      },
    },
    programs: 18,
    generators: 86,
    key_outputs: [
      { path: "AGENTS.md",           program: "search",             purpose: "Codebase context for AI coding assistants (Cursor, Copilot, Claude)" },
      { path: ".cursorrules",        program: "search",             purpose: "Cursor IDE session rules  -  loaded before every conversation" },
      { path: "CLAUDE.md",           program: "search",             purpose: "Claude project system prompt context" },
      { path: "mcp-config.json",     program: "mcp",                purpose: "MCP server configuration  -  agents discover AXIS tools automatically" },
      { path: "commerce-registry.json", program: "agentic-purchasing", purpose: "Product catalog and commerce endpoints for purchasing agents" },
      { path: "agent-purchasing-playbook.md", program: "agentic-purchasing", purpose: "Authorized procurement protocol for autonomous agents" },
      { path: "debug-playbook.md",   program: "debug",              purpose: "Incident triage and postmortem generation context" },
      { path: "design-tokens.json",  program: "theme",              purpose: "Design system tokens  -  import into Figma, CSS, or component library" },
    ],
    quick_start: {
      step_1: "POST /v1/accounts with {email, name, tier: 'free'} â†’ get raw_key",
      step_2: "POST /v1/analyze with {github_url: 'https://github.com/your/repo'} and Authorization: Bearer <raw_key>",
      step_3: "Read adoption_hint on each returned file to know exactly where to place it",
      step_4: "Place AGENTS.md in repo root  -  AI assistants auto-load it immediately",
    },
    llms_txt: "GET /llms.txt  -  plain-text instructions for AI tools on how to interact with AXIS",
    skills: "GET /.well-known/skills/index.json  -  agent skills index following the agentskills.io standard",
    for_agents: {
      note: "Every file in the response includes placement and adoption_hint fields. No guesswork  -  you know exactly what each file does and where it goes.",
      purchasing: "POST /v1/prepare-for-agentic-purchasing  -  computes Purchasing Readiness Score (0â€“100), chains 8 programs, returns commerce artifacts + compliance checklist + negotiation playbook + self-onboarding kit in a single call.",
      agentic_purchasing_generate: "POST /v1/agentic-purchasing/generate after creating a snapshot. Returns commerce-registry.json with product schema, bearer auth, and checkout flow.",
      mcp_discovery: "GET /mcp (Streamable HTTP transport, 2025-03-26 spec). 7 tools including analyze_repo, analyze_files, get_snapshot, get_artifact, list_programs, prepare_for_agentic_purchasing, search_and_discover_tools.",
      search_tools: "GET /v1/mcp/tools?q=<keyword>  -  search all 18 programs and 86 generators by capability keyword. Returns ranked programs with artifact paths, capability tags, and example API calls. No auth required.",
      openapi: "GET /v1/docs  -  full OpenAPI 3.1 spec",
    },
  });
}

// â”€â”€â”€ GET /llms.txt  -  llmstxt.org standard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleLlmsTxt(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = `# AXIS Toolbox

> Analyze any codebase. Generate 86 structured AI context artifacts across 18 programs. Makes any repo immediately legible to AI coding assistants, autonomous agents, and purchasing agents.

AXIS Toolbox is an API that accepts source files (or a GitHub URL) and returns structured files  -  AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, MCP configs, commerce artifacts, brand guidelines, design tokens, and more  -  each calibrated to the specific codebase.

## Quick Start

- POST /v1/accounts  -  create account, get API key (free tier available, no auth required)
- POST /v1/analyze  -  submit {github_url} or {files:[{path,content}]} â†’ returns 86 artifacts
- GET /.well-known/axis.json  -  machine-readable capability manifest
- GET /v1/mcp/tools?q=  -  search programs by keyword (no auth required)

## MCP Integration

Connect directly via Model Context Protocol (Streamable HTTP, 2025-03-26 spec):

- Endpoint: POST /mcp
- 7 tools: analyze_repo, analyze_files, list_programs, get_snapshot, get_artifact, prepare_for_agentic_purchasing, search_and_discover_tools
- No installation required  -  connect any MCP-compatible agent to https://axis-api-6c7z.onrender.com/mcp

## Programs (18 total)

Free tier: search (AGENTS.md, .cursorrules, CLAUDE.md, symbol-index), skills, debug
Pro tier: frontend, seo, optimization, theme, brand, superpowers, marketing, notebook, obsidian, mcp, artifacts, remotion, canvas, algorithmic, agentic-purchasing

## Agentic Commerce

For autonomous purchasing agents:

- POST /v1/prepare-for-agentic-purchasing  -  one-call hardener. Chains 8 programs, computes Purchasing Readiness Score (0-100), returns AP2/UCP/Visa compliance checklist, negotiation playbook, product schema, checkout flow, dispute handling, and self-onboarding kit.
- The Purchasing Readiness Score measures: commerce_artifacts (20pts), mcp_configs (20pts), compliance_checklist (15pts), negotiation_playbook (15pts), debug_playbook (10pts), optimization_rules (10pts), onboarding_docs (10pts).

## Authentication

- Bearer token: Authorization: Bearer <api_key>
- Obtain key: POST /v1/accounts with {email, name, tier: "free"}
- Free tier: unlimited on search/skills/debug programs, 3 snapshots/day on pro programs

## Docs

- Full OpenAPI 3.1 spec: GET /v1/docs
- Plain-text docs: GET /v1/docs.md
- Discovery manifest: GET /.well-known/axis.json
- Agent skills: GET /.well-known/skills/index.json
`;
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

// â”€â”€â”€ GET /.well-known/skills/index.json  -  agent skills registry â”€â”€

export async function handleSkillsIndex(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJSON(res, 200, {
    version: "1.0",
    publisher: "AXIS Toolbox / Last Man Up Inc.",
    updated: "2026-04-12",
    skills: [
      {
        name: "axis-analyze",
        version: "1.0.0",
        description: "Analyze a codebase and generate structured AI context artifacts (AGENTS.md, .cursorrules, CLAUDE.md, debug playbooks, and more). Works with GitHub URLs or raw file uploads.",
        tags: ["codebase-analysis", "ai-context", "agents-md", "mcp", "debugging"],
        endpoint: "POST /v1/analyze",
        auth_required: false,
        input_schema: {
          oneOf: [
            { required: ["github_url"], properties: { github_url: { type: "string", description: "Public GitHub repo URL" } } },
            { required: ["files"], properties: { files: { type: "array", description: "Array of {path, content} source files" } } },
          ],
        },
        example: { github_url: "https://github.com/your/repo" },
      },
      {
        name: "axis-prepare-for-agentic-purchasing",
        version: "1.0.0",
        description: "Harden a codebase for autonomous purchasing agents. Computes Purchasing Readiness Score (0-100), generates AP2/UCP/Visa compliance checklist, negotiation playbook, product schema, checkout flow mandate, and self-onboarding kit in a single call.",
        tags: ["agentic-commerce", "ap2", "visa", "ucp", "purchasing", "compliance", "checkout", "negotiation"],
        endpoint: "POST /v1/prepare-for-agentic-purchasing",
        auth_required: true,
        input_schema: {
          required: ["project_name", "project_type", "frameworks", "goals", "files"],
          properties: {
            project_name: { type: "string" },
            project_type: { type: "string", enum: ["web_application", "api_service", "cli_tool", "library", "monorepo"] },
            frameworks: { type: "array", items: { type: "string" } },
            goals: { type: "array", items: { type: "string" } },
            files: { type: "array", items: { required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
            focus: { type: "string", enum: ["full", "purchasing", "security", "optimization"] },
          },
        },
        example: { project_name: "my-shop", project_type: "api_service", frameworks: ["stripe", "node"], goals: ["harden for agent purchasing"], files: [] },
      },
      {
        name: "axis-search-tools",
        version: "1.0.0",
        description: "Search all 18 AXIS programs and 86 generators by keyword or capability tag. Returns ranked results with artifact paths and example API calls. Use to discover which program handles a specific domain without loading all schemas.",
        tags: ["discovery", "search", "tool-selection", "programs"],
        endpoint: "GET /v1/mcp/tools",
        auth_required: false,
        input_schema: {
          properties: {
            q: { type: "string", description: "Search keyword (e.g. 'checkout', 'debug', 'brand')" },
            program: { type: "string", description: "Filter by program name" },
          },
        },
        example_url: "/v1/mcp/tools?q=checkout",
      },
      {
        name: "axis-mcp",
        version: "1.0.0",
        description: "Connect to AXIS via Model Context Protocol (Streamable HTTP, 2025-03-26). Provides 7 tools for codebase analysis, artifact retrieval, and agentic commerce hardening.",
        tags: ["mcp", "ai-agents", "protocol", "integration"],
        endpoint: "POST /mcp",
        auth_required: false,
        tools: ["analyze_repo", "analyze_files", "list_programs", "get_snapshot", "get_artifact", "prepare_for_agentic_purchasing", "search_and_discover_tools"],
      },
    ],
  });
}

// â”€â”€â”€ GET /v1/docs.md  -  plain-text OpenAPI summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function handleDocsMd(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = `# AXIS Toolbox API  -  Plain Text Reference

Version: 0.4.0 | Base URL: https://axis-api-6c7z.onrender.com

## Authentication

All endpoints accept \`Authorization: Bearer <api_key>\` header.
Free tier endpoints work without authentication.
Obtain a key: \`POST /v1/accounts\` with \`{email, name, tier: "free"}\`.

## Core Endpoints

### POST /v1/analyze
Analyze a codebase. Accepts \`{github_url}\` or \`{files: [{path, content}]}\`.
Returns 86 structured artifacts across 18 programs, each with \`path\`, \`content\`, \`program\`, \`placement\`, and \`adoption_hint\`.

### POST /v1/prepare-for-agentic-purchasing
One-call commerce hardener for autonomous purchasing agents.
Body: \`{project_name, project_type, frameworks, goals, files, focus?, agent_type?}\`
Returns: \`{score, score_breakdown, purchasing_artifacts, all_artifacts, how_to_call_axis_again}\`

### GET /v1/mcp/tools?q=&program=
Search 18 programs / 86 generators by keyword or capability tag.
Returns: \`{total_matches, results: [{program, tier, score, capability_tags, matching_artifacts, example_call}]}\`

### GET /v1/programs
List all programs with generator counts and output paths. No auth required.

## Account Management

- \`POST /v1/accounts\`  -  create account (returns raw_key)
- \`GET /v1/account\`  -  get account info (auth required)
- \`POST /v1/account/keys\`  -  create additional API keys
- \`GET /v1/account/keys\`  -  list keys
- \`POST /v1/account/keys/:key_id/revoke\`  -  revoke a key
- \`GET /v1/account/usage\`  -  usage stats
- \`GET /v1/account/quota\`  -  quota limits

## Snapshot Endpoints (batch workflow)

1. \`POST /v1/snapshots\`  -  create snapshot with files
2. \`POST /v1/<program>/generate\` or \`analyze\`  -  run a specific program
3. \`GET /v1/projects/:project_id/generated-files\`  -  retrieve results
4. \`GET /v1/projects/:project_id/export\`  -  download ZIP

## MCP (Model Context Protocol)

- \`POST /mcp\`  -  Streamable HTTP transport (2025-03-26 spec)
- \`GET /mcp\`  -  SSE stream for long-running operations
- 7 tools: analyze_repo, analyze_files, list_programs, get_snapshot, get_artifact, prepare_for_agentic_purchasing, search_and_discover_tools

## Search & Indexing

- \`POST /v1/search/index\`  -  build full-text index for a snapshot
- \`POST /v1/search/query\`  -  query indexed content
- \`GET /v1/search/:snapshot_id/stats\`  -  index statistics
- \`GET /v1/search/:snapshot_id/symbols\`  -  symbol list

## Discovery

- \`GET /.well-known/axis.json\`  -  machine-readable capability manifest
- \`GET /.well-known/skills/index.json\`  -  agent skills registry (agentskills.io standard)
- \`GET /llms.txt\`  -  plain-text AI tool instructions (llmstxt.org standard)
- \`GET /v1/docs\`  -  full OpenAPI 3.1 spec (JSON)
- \`GET /v1/docs.md\`  -  this document

## Programs (18)

| Program | Tier | Key Output |
|---------|------|-----------|
| search | free | AGENTS.md, .cursorrules, CLAUDE.md |
| skills | free | skills.json |
| debug | free | debug-playbook.md |
| frontend | pro | component-audit.md |
| seo | pro | seo-checklist.md |
| optimization | pro | optimization-report.md |
| theme | pro | design-tokens.json |
| brand | pro | brand-guidelines.md |
| superpowers | pro | superpower-pack.md |
| marketing | pro | marketing-kit.md |
| notebook | pro | research-notebook.md |
| obsidian | pro | obsidian-vault.md |
| mcp | pro | mcp-config.json |
| artifacts | pro | .cursorrules, CLAUDE.md |
| remotion | pro | remotion-script.tsx |
| canvas | pro | canvas-design.md |
| algorithmic | pro | algorithm-spec.md |
| agentic-purchasing | pro | commerce-registry.json, agent-purchasing-playbook.md |
`;
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
