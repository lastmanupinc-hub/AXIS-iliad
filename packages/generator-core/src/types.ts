import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { ProgramVerifyResult } from "./verify-harness.js";

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
  /** Verify-harness substrate evidence, grouped by program — optional so
   *  existing GeneratorResult fixtures/mocks stay valid; generateFiles()
   *  itself always populates it. */
  verification?: ProgramVerifyResult[];
}
