const API_BASE = "";

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
  generated_files: Array<{ path: string; program: string; description: string }>;
}

export interface ContextMap {
  version: string;
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  project_identity: {
    name: string;
    type: string;
    primary_language: string;
    description: string | null;
  };
  structure: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    file_tree_summary: Array<{
      path: string;
      language: string | null;
      loc: number;
      role: string;
    }>;
    top_level_layout: Array<{ name: string; purpose: string; file_count: number }>;
  };
  detection: {
    languages: Array<{ name: string; file_count: number; loc: number; loc_percent: number }>;
    frameworks: Array<{ name: string; confidence: number; signals: string[] }>;
    build_tools: string[];
    test_frameworks: string[];
    package_managers: string[];
    ci_platform: string | null;
    deployment_target: string | null;
  };
  dependency_graph: {
    external_dependencies: Array<{ name: string; version: string; type: string }>;
    internal_imports: Array<{ source: string; target: string; specifier: string }>;
    hotspots: Array<{ path: string; inbound_count: number; outbound_count: number; risk_score: number }>;
  };
  entry_points: Array<{ path: string; type: string; description: string }>;
  routes: Array<{ path: string; method: string; source_file: string }>;
  architecture_signals: {
    patterns_detected: string[];
    layer_boundaries: Array<{ layer: string; directories: string[] }>;
    separation_score: number;
  };
  ai_context: {
    project_summary: string;
    key_abstractions: string[];
    conventions: string[];
    warnings: string[];
  };
}

export interface RepoProfile {
  version: string;
  project: { name: string; type: string; primary_language: string };
  structure_summary: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    top_level_dirs: Array<{ name: string; purpose: string; file_count: number }>;
  };
  health: {
    has_readme: boolean;
    has_tests: boolean;
    test_file_count: number;
    has_ci: boolean;
    has_lockfile: boolean;
    has_typescript: boolean;
    has_linter: boolean;
    has_formatter: boolean;
    dependency_count: number;
    dev_dependency_count: number;
    architecture_patterns: string[];
    separation_score: number;
  };
  goals: { objectives: string[]; requested_outputs: string[] } | null;
}

export interface GeneratedFile {
  path: string;
  content: string;
  content_type: string;
  program: string;
  description: string;
}

export interface GeneratedFilesResponse {
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  files: GeneratedFile[];
  skipped: Array<{ path: string; reason: string }>;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function createSnapshot(payload: SnapshotPayload): Promise<SnapshotResponse> {
  return fetchJSON<SnapshotResponse>("/v1/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getGeneratedFiles(projectId: string): Promise<GeneratedFilesResponse> {
  return fetchJSON<GeneratedFilesResponse>(`/v1/projects/${projectId}/generated-files`);
}

export async function getGeneratedFile(projectId: string, filePath: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/projects/${projectId}/generated-files/${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.text();
}

export async function runProgram(
  endpoint: string,
  snapshotId: string,
): Promise<{ program: string; files: GeneratedFile[] }> {
  return fetchJSON(`/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  return fetchJSON("/health");
}
