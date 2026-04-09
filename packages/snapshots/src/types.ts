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

export interface SnapshotInput {
  input_method: InputMethod;
  manifest: SnapshotManifest;
  files: FileEntry[];
  github_url?: string;
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
