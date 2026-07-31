// ─── Verify-harness substrate (docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md
// substrate table) — every program's V stage drives off this. Runs a
// structural self-check per generated file (is it non-empty, does the content
// actually parse as what its content_type claims) and groups the evidence by
// program, so the output bundle carries its own pass/fail proof instead of
// asking the user to trust it.
//
// No external dep, full stop — including generator-core's own existing `yaml`
// package.json dependency. apps/cli/build.mjs walks the real runtime module
// graph reachable from generator-core's index.ts and hard-fails the offline
// CLI build if anything in it imports a non-@axis external package (the CLI
// ships as a zero-runtime-dependency bundle). `yaml` was only ever imported
// by *.test.ts files before this substrate — using it here for real broke
// that build the first time it was tried. yamlLooksWellFormed below is a
// hand-rolled structural heuristic instead of a real parse, matching the
// same "no SDK, hand-rolled REST" choice already made in github-pr.ts.
//
// Deliberately does NOT flag "{{...}}"-shaped content as an unresolved
// template placeholder: several real programs (e.g. superpowers'
// automation-pipeline.yaml) legitimately emit "{{branch}}"/"{{stage}}"-style
// notification templates meant for the USER's downstream tooling to fill in,
// not a sign AXIS forgot to interpolate its own output.
//
// The application/json check also tolerates leading whole-line "//" comments:
// deploy/vscode-launch.json.template is real, valid JSONC (VS Code's own
// launch.json format allows comments) with a 3-line "// AXIS ..." banner
// before the JSON payload — stripping only whole-line comments (never an
// inline "//" inside a string value, e.g. a "http://" URL) keeps this check
// honest for genuinely malformed JSON elsewhere while not penalizing this
// legitimate case.
//
// Both exceptions above were found by running this harness against real
// output from all 20 programs (generate-programs.test.ts) before landing —
// not hypothesized in advance.

import type { GeneratedFile } from "./types.js";

export interface VerifyEvidence {
  path: string;
  check: string;
  pass: boolean;
  detail: string;
}

export interface ProgramVerifyResult {
  program: string;
  pass: boolean;
  evidence: VerifyEvidence[];
}

/** Strips whole-line "//" comments (JSONC-style) so a legitimate commented
 *  banner ahead of a JSON payload doesn't trip JSON.parse. Never touches an
 *  inline "//" that isn't at the start of its line (e.g. inside a string). */
function stripWholeLineComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

/**
 * Structural YAML sanity check without a real parser: balanced flow-style
 * brackets/braces across the whole document, and no tab-indented lines (YAML
 * forbids tabs for indentation). Not a full grammar check — real corruption
 * that stays bracket-balanced and tab-free can still slip through — but it
 * catches the failure modes a broken generator would actually produce
 * (a truncated flow sequence/mapping, or a stray tab from a copy-pasted
 * snippet), with zero risk of a false positive from content this codebase
 * actually emits.
 */
function yamlLooksWellFormed(content: string): { ok: boolean; reason?: string } {
  const opens = (content.match(/[[{]/g) ?? []).length;
  const closes = (content.match(/[\]}]/g) ?? []).length;
  if (opens !== closes) {
    return { ok: false, reason: `unbalanced brackets: ${opens} opening vs ${closes} closing` };
  }
  if (/^\t/m.test(content)) {
    return { ok: false, reason: "tab-indented line found — YAML forbids tabs for indentation" };
  }
  return { ok: true };
}

function verifyFile(file: GeneratedFile): VerifyEvidence[] {
  const evidence: VerifyEvidence[] = [];
  const nonEmpty = file.content.trim().length > 0;

  evidence.push({
    path: file.path,
    check: "non-empty",
    pass: nonEmpty,
    detail: nonEmpty ? `${file.content.length} bytes` : "content is empty or whitespace-only",
  });

  switch (file.content_type) {
    case "application/json": {
      try {
        JSON.parse(stripWholeLineComments(file.content));
        evidence.push({ path: file.path, check: "valid-json", pass: true, detail: "parsed successfully" });
      } catch (err) {
        evidence.push({ path: file.path, check: "valid-json", pass: false, detail: err instanceof Error ? err.message : String(err) });
      }
      break;
    }
    case "application/yaml":
    case "text/yaml": {
      const check = yamlLooksWellFormed(file.content);
      evidence.push({
        path: file.path,
        check: "yaml-structural-heuristic",
        pass: check.ok,
        detail: check.ok ? "balanced brackets, no tab-indentation" : (check.reason ?? "malformed"),
      });
      break;
    }
    case "text/x-shellscript": {
      const hasShebang = file.content.startsWith("#!");
      evidence.push({
        path: file.path,
        check: "has-shebang",
        pass: hasShebang,
        detail: hasShebang ? "starts with a shebang line" : "missing a leading #! shebang line",
      });
      break;
    }
    case "text/x-dockerfile": {
      const hasFrom = /^FROM\s+\S+/m.test(file.content);
      evidence.push({
        path: file.path,
        check: "has-from-instruction",
        pass: hasFrom,
        detail: hasFrom ? "has a FROM instruction" : "missing a FROM instruction",
      });
      break;
    }
    default:
      break;
  }

  return evidence;
}

/**
 * Groups a generator run's files by the program that produced them and runs
 * each file's structural self-check, so every program's evidence — pass/fail
 * per file, with a reason — is available with no per-program opt-in required.
 * Programs that need a deeper, domain-specific check (e.g. a real Dockerfile
 * build) register their own stronger verifier elsewhere; this is the floor
 * every program gets for free.
 */
export function verifyGeneratedFiles(files: GeneratedFile[]): ProgramVerifyResult[] {
  const byProgram = new Map<string, GeneratedFile[]>();
  for (const file of files) {
    const list = byProgram.get(file.program) ?? [];
    list.push(file);
    byProgram.set(file.program, list);
  }

  const results: ProgramVerifyResult[] = [];
  for (const [program, programFiles] of byProgram) {
    const evidence = programFiles.flatMap(verifyFile);
    results.push({ program, pass: evidence.every((e) => e.pass), evidence });
  }
  return results.sort((a, b) => a.program.localeCompare(b.program));
}
