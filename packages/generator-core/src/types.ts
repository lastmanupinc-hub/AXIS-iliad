import type { ContextMap, RepoProfile } from "@axis/context-engine";

export interface GeneratedFile {
  path: string;
  content: string;
  content_type: string;
  program: string;
  description: string;
}

export interface SourceFile {
  path: string;
  content: string;
  size: number;
}

export interface GeneratorInput {
  context_map: ContextMap;
  repo_profile: RepoProfile;
  requested_outputs: string[];
  source_files?: SourceFile[];
}

export interface GeneratorResult {
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  files: GeneratedFile[];
  skipped: Array<{ path: string; reason: string }>;
}
