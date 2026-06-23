// ─── E5 Living Architecture: verified specificity pass ──────────
//
// analyze_repo's engineer-mode upgrade makes the output repo-SPECIFIC without
// surrendering the determinism guarantee. A local LLM proposes discrete claims,
// each carrying an `evidence` reference; a deterministic FactOracle verifies
// every claim against the facts already extracted by the analysis pipeline and
// DROPS any it can't ground. The verifier is the structured contract — a
// hallucinated symbol / route / dependency cannot survive into the artifact.
//
// This file holds the pure, dependency-free core (oracle + verifier + render).
// The LLM proposal step (reusing the local runCompletion) is injected, so the
// whole thing is testable without a model.

import type { ContextMap } from "@axis/context-engine";

export type ClaimType = "symbol" | "route" | "model" | "dependency" | "import";

/** What a claim asserts it is grounded on — checked against the FactOracle. */
export interface ClaimEvidence {
  file?: string;
  symbol?: string;
  line?: number;
  model?: string;
  field_count?: number;
  route?: { method: string; path: string };
  dep?: string;
  import?: { source: string; target: string };
}

export interface ArchClaim {
  type: ClaimType;
  evidence: ClaimEvidence;
  /** The repo-specific insight this claim asserts (the prose the LLM supplied). */
  insight: string;
}

export interface DroppedClaim {
  claim: ArchClaim;
  reason: string;
}

export interface VerifyResult {
  kept: ArchClaim[];
  dropped: DroppedClaim[];
}

/** Deterministic ground-truth index built once from the extracted facts. */
export interface FactOracle {
  files: Set<string>;
  /** file_path → set of symbol names declared there. */
  symbolsByFile: Map<string, Set<string>>;
  /** `${file}::${symbol}` → set of line numbers it's declared on. */
  symbolLines: Map<string, Set<number>>;
  /** `${METHOD} ${path}`. */
  routes: Set<string>;
  /** domain-model name → field_count. */
  models: Map<string, number>;
  /** external dependency names. */
  deps: Set<string>;
  /** `${source}->${target}` internal import edges. */
  imports: Set<string>;
}

export interface ExtractedSymbol {
  file_path: string;
  symbol_name: string;
  line_number: number;
}

/**
 * Build the oracle from the ContextMap (routes, models, deps, imports, files)
 * plus the line-accurate symbol index. Pure + deterministic.
 */
export function buildFactOracle(ctx: ContextMap, symbols: ExtractedSymbol[]): FactOracle {
  const files = new Set<string>();
  for (const f of ctx.structure.file_tree_summary) {
    if (f.type === "file") files.add(f.path);
  }

  const symbolsByFile = new Map<string, Set<string>>();
  const symbolLines = new Map<string, Set<number>>();
  for (const s of symbols) {
    files.add(s.file_path);
    let bucket = symbolsByFile.get(s.file_path);
    if (!bucket) {
      bucket = new Set();
      symbolsByFile.set(s.file_path, bucket);
    }
    bucket.add(s.symbol_name);

    const key = `${s.file_path}::${s.symbol_name}`;
    let lines = symbolLines.get(key);
    if (!lines) {
      lines = new Set();
      symbolLines.set(key, lines);
    }
    lines.add(s.line_number);
  }

  return {
    files,
    symbolsByFile,
    symbolLines,
    routes: new Set(ctx.routes.map((r) => `${r.method.toUpperCase()} ${r.path}`)),
    models: new Map(ctx.domain_models.map((m) => [m.name, m.field_count] as const)),
    deps: new Set(ctx.dependency_graph.external_dependencies.map((d) => d.name)),
    imports: new Set(ctx.dependency_graph.internal_imports.map((i) => `${i.source}->${i.target}`)),
  };
}

/**
 * Reason a claim should be DROPPED, or null if it verifies. Pure; the heart of
 * the contract — every branch resolves the claim's evidence against the oracle.
 */
export function claimDropReason(claim: ArchClaim, oracle: FactOracle): string | null {
  const e = claim.evidence;
  switch (claim.type) {
    case "symbol": {
      if (!e.file || !e.symbol) return "symbol claim missing file/symbol";
      const bucket = oracle.symbolsByFile.get(e.file);
      if (!bucket) return `no symbols indexed for file ${e.file}`;
      if (!bucket.has(e.symbol)) return `symbol ${e.symbol} not found in ${e.file}`;
      if (e.line !== undefined) {
        const lines = oracle.symbolLines.get(`${e.file}::${e.symbol}`);
        if (!lines || !lines.has(e.line)) return `symbol ${e.symbol} is not declared at line ${e.line} in ${e.file}`;
      }
      return null;
    }
    case "route": {
      if (!e.route || !e.route.method || !e.route.path) return "route claim missing method/path";
      if (!oracle.routes.has(`${e.route.method.toUpperCase()} ${e.route.path}`)) {
        return `route ${e.route.method} ${e.route.path} not found`;
      }
      return null;
    }
    case "model": {
      if (!e.model) return "model claim missing model name";
      const fc = oracle.models.get(e.model);
      if (fc === undefined) return `model ${e.model} not found`;
      if (e.field_count !== undefined && e.field_count !== fc) {
        return `model ${e.model} has ${fc} fields, claim said ${e.field_count}`;
      }
      return null;
    }
    case "dependency": {
      if (!e.dep) return "dependency claim missing dep name";
      if (!oracle.deps.has(e.dep)) return `dependency ${e.dep} not found`;
      return null;
    }
    case "import": {
      if (!e.import || !e.import.source || !e.import.target) return "import claim missing source/target";
      if (!oracle.imports.has(`${e.import.source}->${e.import.target}`)) {
        return `import ${e.import.source} -> ${e.import.target} not found`;
      }
      return null;
    }
    default:
      return `unknown claim type ${(claim as ArchClaim).type}`;
  }
}

/** Partition claims into verified (kept) and hallucinated (dropped). Pure. */
export function verifyClaims(claims: ArchClaim[], oracle: FactOracle): VerifyResult {
  const kept: ArchClaim[] = [];
  const dropped: DroppedClaim[] = [];
  for (const claim of claims) {
    const reason = claimDropReason(claim, oracle);
    if (reason === null) kept.push(claim);
    else dropped.push({ claim, reason });
  }
  return { kept, dropped };
}
