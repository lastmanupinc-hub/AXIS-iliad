import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
  recordUsage,
  checkQuota,
} from "@axis/snapshots";
import type { SnapshotInput, SnapshotManifest, FileEntry } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateFiles } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import { sendJSON, readBody } from "./router.js";
import { resolveAuth } from "./billing.js";

export async function handleCreateSnapshot(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  // Validate required fields
  const manifest = body.manifest as SnapshotManifest | undefined;
  if (!manifest?.project_name || !manifest?.project_type || !manifest?.frameworks || !manifest?.goals || !manifest?.requested_outputs) {
    sendJSON(res, 400, {
      error: "Missing required manifest fields: project_name, project_type, frameworks, goals, requested_outputs",
    });
    return;
  }

  const files = body.files as FileEntry[] | undefined;
  if (!files || !Array.isArray(files) || files.length === 0) {
    sendJSON(res, 400, { error: "files array is required and must not be empty" });
    return;
  }

  // Validate file entries
  for (const file of files) {
    if (!file.path || typeof file.content !== "string") {
      sendJSON(res, 400, { error: "Each file must have path (string) and content (string)" });
      return;
    }
    file.size = file.size ?? Buffer.byteLength(file.content, "utf-8");
  }

  const input: SnapshotInput = {
    input_method: (body.input_method as SnapshotInput["input_method"]) ?? "api_submission",
    manifest,
    files,
  };

  // Check quota if authenticated
  const auth = resolveAuth(req);
  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    if (!quota.allowed) {
      sendJSON(res, 429, { error: quota.reason, tier: quota.tier, usage: quota.usage });
      return;
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
    console.error("Snapshot processing failed:", err);
    sendJSON(res, 500, {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
      error: "Processing failed",
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
    sendJSON(res, 404, { error: "Snapshot not found" });
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

export async function handleGetContext(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendJSON(res, 404, { error: "No snapshots found for project" });
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "Context not yet available — snapshot may still be processing" });
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
    sendJSON(res, 404, { error: "No snapshots found for project" });
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const contextMap = getContextMap(latest.snapshot_id);
  const repoProfile = getRepoProfile(latest.snapshot_id);

  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
  if (!generated) {
    sendJSON(res, 404, { error: "No generated files available yet" });
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
  sendJSON(res, 200, {
    status: "ok",
    service: "axis-api",
    version: "0.2.0",
    timestamp: new Date().toISOString(),
  });
}

export async function handleGetGeneratedFile(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id, file_path } = params;
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendJSON(res, 404, { error: "No snapshots found for project" });
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const generated = getGeneratorResult(latest.snapshot_id) as GeneratorResult | undefined;
  if (!generated) {
    sendJSON(res, 404, { error: "No generated files available yet" });
    return;
  }

  // Match by path — handle both "AGENTS.md" and ".ai/context-map.json" style
  const decoded = decodeURIComponent(file_path);
  const file = generated.files.find(f => f.path === decoded || f.path === `.ai/${decoded}`);
  if (!file) {
    sendJSON(res, 404, { error: `File not found: ${decoded}`, available: generated.files.map(f => f.path) });
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
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const generated = getGeneratorResult(snapshotId) as GeneratorResult | undefined;
  if (!generated) {
    sendJSON(res, 404, { error: "No results for this snapshot — run POST /v1/snapshots first" });
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
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  // Regenerate skills files with optional custom outputs
  const requestedOutputs = (body.outputs as string[]) ?? ["AGENTS.md", "CLAUDE.md", ".cursorrules", "workflow-pack.md", "policy-pack.md"];
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

export async function handleDebugAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md", "root-cause-checklist.md"],
  });

  const debugFiles = result.files.filter(f => f.program === "debug");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "debug",
    files: debugFiles,
  });
}

export async function handleFrontendAudit(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: [".ai/frontend-rules.md", "component-guidelines.md", "layout-patterns.md", "ui-audit.md"],
  });

  const frontendFiles = result.files.filter(f => f.program === "frontend");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "frontend",
    files: frontendFiles,
  });
}

export async function handleSeoAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: [".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md", "meta-tag-audit.json"],
  });

  const seoFiles = result.files.filter(f => f.program === "seo");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "seo",
    files: seoFiles,
  });
}

export async function handleOptimizationAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: [".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json", "token-budget-plan.md"],
  });

  const optimizationFiles = result.files.filter(f => f.program === "optimization");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "optimization",
    files: optimizationFiles,
  });
}

export async function handleThemeGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: [".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json", "dark-mode-tokens.json"],
  });

  const themeFiles = result.files.filter(f => f.program === "theme");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "theme",
    files: themeFiles,
  });
}

export async function handleBrandGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml", "channel-rulebook.md"],
  });

  const brandFiles = result.files.filter(f => f.program === "brand");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "brand",
    files: brandFiles,
  });
}

export async function handleSuperpowersGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md", "automation-pipeline.yaml"],
  });

  const superpowersFiles = result.files.filter(f => f.program === "superpowers");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "superpowers",
    files: superpowersFiles,
  });
}

export async function handleMarketingGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md", "ab-test-plan.md"],
  });

  const marketingFiles = result.files.filter(f => f.program === "marketing");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "marketing",
    files: marketingFiles,
  });
}

export async function handleNotebookGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["notebook-summary.md", "source-map.json", "study-brief.md", "research-threads.md", "citation-index.json"],
  });

  const notebookFiles = result.files.filter(f => f.program === "notebook");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "notebook",
    files: notebookFiles,
  });
}

export async function handleObsidianAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["obsidian-skill-pack.md", "vault-rules.md", "graph-prompt-map.json", "linking-policy.md", "template-pack.md"],
  });

  const obsidianFiles = result.files.filter(f => f.program === "obsidian");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "obsidian",
    files: obsidianFiles,
  });
}

export async function handleMcpProvision(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["mcp-config.json", "connector-map.yaml", "capability-registry.json", "server-manifest.yaml"],
  });

  const mcpFiles = result.files.filter(f => f.program === "mcp");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "mcp",
    files: mcpFiles,
  });
}

export async function handleArtifactsGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["generated-component.tsx", "dashboard-widget.tsx", "embed-snippet.ts", "artifact-spec.md", "component-library.json"],
  });

  const artifactFiles = result.files.filter(f => f.program === "artifacts");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "artifacts",
    files: artifactFiles,
  });
}

export async function handleRemotionGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["remotion-script.ts", "scene-plan.md", "render-config.json", "asset-checklist.md", "storyboard.md"],
  });

  const remotionFiles = result.files.filter(f => f.program === "remotion");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "remotion",
    files: remotionFiles,
  });
}

export async function handleCanvasGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["canvas-spec.json", "social-pack.md", "poster-layouts.md", "asset-guidelines.md", "brand-board.md"],
  });

  const canvasFiles = result.files.filter(f => f.program === "canvas");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "canvas",
    files: canvasFiles,
  });
}

export async function handleAlgorithmicGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) {
    sendJSON(res, 400, { error: "snapshot_id is required" });
    return;
  }

  const contextMap = getContextMap(snapshotId) as ContextMap | undefined;
  const repoProfile = getRepoProfile(snapshotId) as RepoProfile | undefined;
  if (!contextMap || !repoProfile) {
    sendJSON(res, 404, { error: "No context for this snapshot — run POST /v1/snapshots first" });
    return;
  }

  const result = generateFiles({
    context_map: contextMap,
    repo_profile: repoProfile,
    requested_outputs: ["generative-sketch.ts", "parameter-pack.json", "collection-map.md", "export-manifest.yaml", "variation-matrix.json"],
  });

  const algorithmicFiles = result.files.filter(f => f.program === "algorithmic");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "algorithmic",
    files: algorithmicFiles,
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
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const githubUrl = body.github_url as string | undefined;
  if (!githubUrl || typeof githubUrl !== "string") {
    sendJSON(res, 400, { error: "github_url is required" });
    return;
  }

  // Import dynamically to avoid loading github module for other endpoints
  const { fetchGitHubRepo, parseGitHubUrl } = await import("./github.js");

  let parsed;
  try {
    parsed = parseGitHubUrl(githubUrl);
  } catch {
    sendJSON(res, 400, { error: "Invalid GitHub URL. Expected: https://github.com/owner/repo" });
    return;
  }

  let fetchResult;
  try {
    const token = (body.token as string) ?? process.env.GITHUB_TOKEN;
    fetchResult = await fetchGitHubRepo(githubUrl, token || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendJSON(res, 502, { error: `Failed to fetch GitHub repo: ${message}` });
    return;
  }

  if (fetchResult.files.length === 0) {
    sendJSON(res, 422, { error: "No source files found in repository" });
    return;
  }

  // Check quota if authenticated
  const auth = resolveAuth(req);
  if (auth.account) {
    const quota = checkQuota(auth.account.account_id);
    if (!quota.allowed) {
      sendJSON(res, 429, { error: quota.reason, tier: quota.tier, usage: quota.usage });
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
    console.error("GitHub snapshot processing failed:", err);
    sendJSON(res, 500, {
      snapshot_id: snapshot.snapshot_id,
      status: "failed",
      error: "Processing failed",
    });
  }
}
