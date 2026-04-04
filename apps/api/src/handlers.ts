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
} from "@axis/snapshots";
import type { SnapshotInput, SnapshotManifest, FileEntry } from "@axis/snapshots";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import type { ContextMap, RepoProfile } from "@axis/context-engine";
import { generateFiles } from "@axis/generator-core";
import type { GeneratorResult } from "@axis/generator-core";
import { sendJSON, readBody } from "./router.js";

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
  const requestedOutputs = (body.outputs as string[]) ?? ["AGENTS.md", "CLAUDE.md", ".cursorrules"];
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
    requested_outputs: [".ai/debug-playbook.md", "incident-template.md", "tracing-rules.md"],
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
    requested_outputs: [".ai/frontend-rules.md", "component-guidelines.md"],
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
    requested_outputs: [".ai/seo-rules.md", "schema-recommendations.json", "route-priority-map.md", "content-audit.md"],
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
    requested_outputs: [".ai/optimization-rules.md", "prompt-diff-report.md", "cost-estimate.json"],
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
    requested_outputs: [".ai/design-tokens.json", "theme.css", "theme-guidelines.md", "component-theme-map.json"],
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
    requested_outputs: ["brand-guidelines.md", "voice-and-tone.md", "content-constraints.md", "messaging-system.yaml"],
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
    requested_outputs: ["superpower-pack.md", "workflow-registry.json", "test-generation-rules.md", "refactor-checklist.md"],
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
    requested_outputs: ["campaign-brief.md", "funnel-map.md", "sequence-pack.md", "cro-playbook.md"],
  });

  const marketingFiles = result.files.filter(f => f.program === "marketing");
  sendJSON(res, 200, {
    snapshot_id: snapshotId,
    program: "marketing",
    files: marketingFiles,
  });
}
