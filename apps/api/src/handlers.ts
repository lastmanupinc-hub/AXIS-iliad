import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
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
  runMaintenance,
  getDbStats,
} from "@axis/snapshots";
import type { SnapshotInput, SnapshotManifest, FileEntry } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateFiles } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import { sendJSON, readBody, sendError, isShuttingDown } from "./router.js";
import { resolveAuth } from "./billing.js";
import { ErrorCode, log, getRequestId } from "./logger.js";

// ─── Per-program default outputs ────────────────────────────────

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
  algorithmic:  ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
};

// ─── Generic program handler factory ────────────────────────────

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
    const result = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: requestedOutputs,
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

// ─── Program handlers (generated from PROGRAM_OUTPUTS) ──────────

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
    if (!quota.allowed) {
      trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason });
      sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      return;
    }

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

  const snapshot = createSnapshot(input);

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
  const deleted = deleteSnapshot(snapshot_id);
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
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  if (!contextMap || !repoProfile) {
    sendError(res, 404, ErrorCode.CONTEXT_PENDING, "Context not yet available — snapshot may still be processing");
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
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
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
  sendJSON(res, ready ? 200 : 503, {
    status: ready ? "ok" : "shutting_down",
    service: "axis-api",
    version: "0.4.0",
    timestamp: new Date().toISOString(),
  });
}

export async function handleDbStats(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const stats = getDbStats();
  sendJSON(res, stats.success ? 200 : 500, stats);
}

export async function handleDbMaintenance(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const results = runMaintenance();
  const allOk = results.every((r) => r.success);
  sendJSON(res, allOk ? 200 : 500, { results, success: allOk });
}

export async function handleGetGeneratedFile(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id, file_path } = params;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
  if (!generated) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  // Match by path — handle both "AGENTS.md" and ".ai/context-map.json" style
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
    sendError(res, 404, ErrorCode.NOT_FOUND, "No results for this snapshot — run POST /v1/snapshots first");
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
  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: requestedOutputs,
  });

  const skillsFiles = result.files.filter(f => f.program === "skills");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "skills",
    files: skillsFiles,
    skipped: result.skipped,
  });
}

// ─── GitHub URL intake ──────────────────────────────────────────

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
    const token = (typeof rawToken === "string" ? rawToken : undefined) ?? process.env.GITHUB_TOKEN;
    fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
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
    if (!quota.allowed) {
      trackEvent(auth.account.account_id, "limit_reached", "limit_hit", { reason: quota.reason, source: "github" });
      sendError(res, 429, ErrorCode.QUOTA_EXCEEDED, quota.reason ?? "Quota exceeded", { tier: quota.tier, usage: quota.usage });
      return;
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

  const snapshot = createSnapshot(input);

  try {
    const contextMap = buildContextMap(snapshot);
    const repoProfile = buildRepoProfile(snapshot);

    saveContextMap(snapshot.snapshot_id, contextMap);
    saveRepoProfile(snapshot.snapshot_id, repoProfile);

    const generated = generateFiles({
      context_map: contextMap,
      repo_profile: repoProfile,
      requested_outputs: [],
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
}

// ─── File Content Search API ────────────────────────────────────

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

  const files = (snapshot.files as Array<{ path: string; content: string }>).filter(
    (f) => typeof f.path === "string" && typeof f.content === "string",
  );

  const result = indexSnapshotContent(snapshotId, files);

  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    indexed_files: result.indexed_files,
    indexed_lines: result.indexed_lines,
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
  const stats = getSearchIndexStats(snapshot_id);

  sendJSON(res, 200, {
    snapshot_id,
    ...stats,
  });
}
