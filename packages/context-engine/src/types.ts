import type { SnapshotRecord } from "@axis/snapshots";
import type { ParseResult } from "@axis/repo-parser";

export interface ContextMap {
  version: "1.0.0";
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  project_identity: {
    name: string;
    type: string;
    primary_language: string;
    description: string | null;
    repo_url: string | null;
    go_module: string | null;
  };
  structure: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    file_tree_summary: Array<{
      path: string;
      type: "file" | "directory";
      language: string | null;
      loc: number;
      role: string;
    }>;
    top_level_layout: Array<{ name: string; purpose: string; file_count: number }>;
  };
  detection: {
    languages: ParseResult["languages"];
    frameworks: ParseResult["frameworks"];
    build_tools: string[];
    test_frameworks: string[];
    package_managers: string[];
    ci_platform: string | null;
    deployment_target: string | null;
  };
  dependency_graph: {
    external_dependencies: ParseResult["dependencies"];
    internal_imports: ParseResult["internal_imports"];
    hotspots: Array<{
      path: string;
      inbound_count: number;
      outbound_count: number;
      risk_score: number;
    }>;
  };
  entry_points: Array<{
    path: string;
    type: string;
    description: string;
  }>;
  routes: Array<{
    path: string;
    method: string;
    source_file: string;
  }>;
  domain_models: Array<{
    name: string;
    kind: string;
    language: string;
    field_count: number;
    source_file: string;
  }>;
  sql_schema: Array<{
    name: string;
    column_count: number;
    foreign_key_count: number;
    source_file: string;
  }>;
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
  version: "1.0.0";
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  project: ContextMap["project_identity"];
  detection: ContextMap["detection"];
  structure_summary: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    top_level_dirs: Array<{ name: string; purpose: string; file_count: number }>;
  };
  health: ParseResult["health"] & {
    dependency_count: number;
    dev_dependency_count: number;
    architecture_patterns: string[];
    separation_score: number;
  };
  goals: {
    objectives: string[];
    requested_outputs: string[];
  } | null;
}
