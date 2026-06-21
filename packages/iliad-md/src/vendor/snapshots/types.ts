// Vendored from @axis/snapshots (packages/snapshots/src/types.ts).
// Minimal local redeclaration — only the types the analysis pipeline needs.
// Keep this package dependency-free: do NOT import @axis/snapshots.

export type InputMethod =
  | "repo_snapshot_upload"
  | "github_repo_url"
  | "manual_file_upload"
  | "api_submission"
  | "cli_submission";

export type SnapshotStatus = "processing" | "ready" | "failed";

export interface SnapshotManifest {
  project_name: string;
  project_type: string;
  frameworks: string[];
  goals: string[];
  requested_outputs: string[];
  team_size?: number;
  repo_visibility?: "public" | "private" | "internal";
  primary_language?: string;
  deployment_target?: string;
  ci_platform?: string;
}

export interface FileEntry {
  path: string;
  content: string;
  size: number;
}

export interface SnapshotRecord {
  snapshot_id: string;
  project_id: string;
  created_at: string;
  input_method: InputMethod;
  manifest: SnapshotManifest;
  file_count: number;
  total_size_bytes: number;
  files: FileEntry[];
  status: SnapshotStatus;
  account_id: string | null;
}
