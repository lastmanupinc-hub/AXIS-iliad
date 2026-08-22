import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { mdText } from "./md-sanitize.js";

// ─────────────────────────────────────────────────────────────────────────────
// Redundancy-sweep generator.
//
// WHY THIS EMITS INTO THE CUSTOMER'S REPO INSTEAD OF RUNNING HERE: the point of
// self-propagation (the same reason every generated CLAUDE.md/AGENTS.md carries
// the "⟳ Continue the loop" footer, see autonomy-loop.ts) is that the NEXT unit
// of work runs on whoever's own Claude Code session opens the customer's repo —
// their tokens, their account, not ours. A redundancy sweep that only WE could
// run, on OUR account, against every customer's repo, does not scale and is not
// what this platform sells. Shipping the scanner itself plus the judgment
// method as a playbook makes it something their own agent can pick up and run
// unattended, the same way begin.yaml/continuation.yaml already do for every
// other candidate in the loop.
//
// The scanner (EMBEDDED_SCRIPT_SOURCE below) is a vendored, near-exact copy of
// this repo's own scripts/redundancy-sweep.mjs — dogfooded on axis-iliad itself
// (found the storefront's SEO-boilerplate duplication), then cross-repo on two
// sibling Python/TypeScript codebases, before being productized here. THREE
// substitutions distinguish the generated copy from the source template, each
// because the generated file is placed at the CUSTOMER repo's root (not under
// scripts/, unlike the source): ROOT resolves without the "../" hop, the
// default scan dirs become the whole repo ("." not axis-iliad's own
// packages/apps), and DEFAULT_INCLUDE_EXT is picked from the repo's REAL
// detected languages via a fixed name->extensions lookup table — never by
// interpolating the detected language's name itself, which is untrusted repo
// content (see generators-redundancy-sweep.test.ts's injection-containment
// tests). Everything else in the template is untouched, so this can't quietly
// diverge from the tool's real, dogfooded behavior the way
// packages/iliad-md/src/vendor/ once silently did — that incident is why this
// repo built a vendor-sync guard at all (tool_01_redundancy_sweep in
// begin.yaml).
// ─────────────────────────────────────────────────────────────────────────────

const EMBEDDED_SCRIPT_SOURCE =
  "// redundancy-sweep.mjs — finds duplicated code blocks ACROSS files.\n//\n// Why this exists: this repo's own ledger (begin.yaml) names \"hand-duplicated\n// catalog/pricing drift\" and \"REST/MCP twin-implementation divergence\" as\n// recurring bug families — found by hand, repeatedly, after the fact (e.g. the\n// count-extractors.ts consolidation, the storefront billing-honesty guard).\n// This is the general tool that finds the NEXT one before a human has to.\n//\n// Method: seed-and-extend (the same family as CPD/jscpd, simplified).\n//   1. SEED: hash every K-significant-line window per file; a hash shared by\n//      2+ (file, position) pairs is a candidate duplicate seed.\n//   2. EXTEND: for every pair of seed positions, grow the match backward and\n//      forward by comparing exact line text until it breaks — this finds the\n//      MAXIMAL duplicated run, not just the K-line seed window.\n//   3. DEDUPE: many overlapping seeds land on the same maximal run once\n//      extended (a 40-line duplicate produces ~33 overlapping 8-line seeds) —\n//      collapse by the extended (file, startLine, endLine) triple.\n//   4. GROUP: findings anchored at the same primary range are merged into one\n//      N-way report instead of N-choose-2 pairwise rows.\n// A naive \"report every seed\" version was tried first (dogfooding this on\n// axis-iliad itself) and was unusable: one real 40-line duplicate block\n// produced 20+ near-identical overlapping rows. This is the fix.\n//\n// Deliberately dependency-free (node: builtins only), matching every other\n// script in this directory — an offline build must not need the npm registry.\n//\n// LANGUAGE-GENERIC as of 2026-08-20 (dogfooded on axis-iliad TypeScript first,\n// then on AXIS Avatar Foundry — a stdlib-only Python 3.11+ codebase — which is\n// what forced this: the original version hardcoded .ts/.tsx and C-family\n// `//`/`/* */` comments, so pointed at a pure-Python repo it would have found\n// zero files. Comment/string stripping is now a small per-extension PROFILE\n// table (LANG_PROFILES below) instead of one hardcoded JS-shaped rule; unknown\n// extensions fall back to the C-family profile as a reasonable default.\n//\n//   node scripts/redundancy-sweep.mjs [--min-lines=8] [--top=25] [--json=out.json]\n//     [--ext=.ts,.tsx,.py] [--exclude-dir=name1,name2] [dir...]\n//\n// Exit code 0 always (this is a report, not a gate) unless --fail-on-cross-file\n// is passed, for future wiring into a repo's own local gate if it proves its worth.\nimport { readFileSync, readdirSync, writeFileSync } from \"node:fs\";\nimport { join, relative, extname, resolve, dirname } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { createHash } from \"node:crypto\";\n\n// fileURLToPath, not manual URL parsing — a bare regex strip leaves \"%20\" for\n// any space in the path (this repo's own \"No Fate Platform\" parent directory\n// hit exactly that on the first real run; see build-storefront.mjs's identical\n// fileURLToPath usage for the same reason, one Windows-path lesson learned twice).\nconst ROOT = resolve(dirname(fileURLToPath(import.meta.url)), \"..\");\n\nconst DEFAULT_EXCLUDE_DIRS = new Set([\n  // JS/TS-world build & tooling output\n  \"node_modules\", \".git\", \"dist\", \"build\", \"coverage\",\n  \".storefront-dist\", \".ai\", \".ai-output\", \"git-mirrors\",\n  // Python-world caches/venvs — harmless to always exclude even in a JS repo,\n  // and required the first time this ran against a real Python codebase.\n  \".venv\", \"venv\", \".venv-smoke\", \"__pycache__\", \".mypy_cache\", \".ruff_cache\",\n  \".pytest_cache\", \".tox\", \"site-packages\", \".data\",\n]);\n\n/**\n * Per-extension comment/string-stripping profile. `lineComments` are prefixes\n * that blank the rest of a line; `blockPairs` are [open, close] token pairs\n * treated like a block comment (Python has no real block-comment syntax, but\n * triple-quoted strings are used as docstrings so densely — often\n * near-boilerplate \"Args:/Returns:\" prose — that leaving them in would drown\n * real logic duplication in docstring-shape noise; stripping them is a\n * deliberate simplification, not a claim that no Python string constant could\n * ever be worth flagging as duplicated).\n */\nconst LANG_PROFILES = {\n  c_family: { lineComments: [\"//\"], blockPairs: [[\"/*\", \"*/\"]] },\n  python: { lineComments: [\"#\"], blockPairs: [['\"\"\"', '\"\"\"'], [\"'''\", \"'''\"]] },\n  hash_only: { lineComments: [\"#\"], blockPairs: [] },\n};\nconst EXT_TO_PROFILE = {\n  \".ts\": \"c_family\", \".tsx\": \"c_family\", \".js\": \"c_family\", \".jsx\": \"c_family\",\n  \".mjs\": \"c_family\", \".cjs\": \"c_family\", \".java\": \"c_family\", \".go\": \"c_family\",\n  \".rs\": \"c_family\", \".c\": \"c_family\", \".cpp\": \"c_family\", \".cc\": \"c_family\",\n  \".h\": \"c_family\", \".hpp\": \"c_family\", \".cs\": \"c_family\", \".swift\": \"c_family\",\n  \".kt\": \"c_family\", \".php\": \"c_family\",\n  \".py\": \"python\", \".pyi\": \"python\",\n  \".rb\": \"hash_only\", \".sh\": \"hash_only\", \".bash\": \"hash_only\", \".yaml\": \"hash_only\", \".yml\": \"hash_only\",\n};\nconst DEFAULT_INCLUDE_EXT = new Set([\".ts\", \".tsx\", \".py\"]);\n\nfunction profileFor(ext) {\n  return LANG_PROFILES[EXT_TO_PROFILE[ext] ?? \"c_family\"];\n}\n\nfunction parseArgs(argv) {\n  const opts = {\n    minLines: 8, top: 25, json: null, failOnCrossFile: false, includeTests: false,\n    dirs: [], includeExt: null, excludeDirs: null,\n  };\n  for (const a of argv) {\n    if (a.startsWith(\"--min-lines=\")) opts.minLines = Number(a.slice(12));\n    else if (a.startsWith(\"--top=\")) opts.top = Number(a.slice(6));\n    else if (a.startsWith(\"--json=\")) opts.json = a.slice(7);\n    else if (a.startsWith(\"--ext=\")) opts.includeExt = new Set(a.slice(6).split(\",\").map((s) => s.trim()));\n    else if (a.startsWith(\"--exclude-dir=\")) opts.excludeDirs = a.slice(14).split(\",\").map((s) => s.trim());\n    else if (a === \"--fail-on-cross-file\") opts.failOnCrossFile = true;\n    else if (a === \"--include-tests\") opts.includeTests = true;\n    else opts.dirs.push(a);\n  }\n  if (opts.dirs.length === 0) opts.dirs = [\"packages\", \"apps\"];\n  opts.includeExt ??= DEFAULT_INCLUDE_EXT;\n  opts.excludeDirsSet = new Set([...DEFAULT_EXCLUDE_DIRS, ...(opts.excludeDirs ?? [])]);\n  return opts;\n}\n\n/** Test-file naming conventions across languages — extend as new ones show up. */\nfunction isTestFile(basename) {\n  return /\\.test\\.tsx?$/.test(basename) // TS/JS\n    || /^test_.*\\.py$/.test(basename) // pytest convention A\n    || /_test\\.py$/.test(basename); // pytest convention B\n}\n\nfunction walk(dir, opts, out = []) {\n  let entries;\n  try {\n    entries = readdirSync(dir, { withFileTypes: true });\n  } catch {\n    return out; // dir may not exist (e.g. a filtered workspace) — skip, don't crash the sweep\n  }\n  for (const entry of entries) {\n    if (opts.excludeDirsSet.has(entry.name)) continue;\n    const full = join(dir, entry.name);\n    if (entry.isDirectory()) {\n      walk(full, opts, out);\n    } else if (opts.includeExt.has(extname(entry.name))) {\n      if (/\\.d\\.ts$/.test(entry.name)) continue; // generated type declarations, never source\n      if (isTestFile(entry.name) && !opts.includeTests) continue;\n      out.push(full);\n    }\n  }\n  return out;\n}\n\n/** A line counts as \"significant\" if it carries real logic/data, not structure. */\nfunction isSignificant(line) {\n  const t = line.trim();\n  if (t.length === 0) return false;\n  if (/^[{}()[\\];,]+$/.test(t)) return false; // bare punctuation\n  return true;\n}\n\n/**\n * Strip line comments, block comments/docstrings, and blank/bare-punctuation\n * lines for ONE file, using the profile for its extension. Multi-line block\n * constructs (block comments, Python triple-quoted strings) are tracked with\n * a simple open/close scan — good enough for well-formed source; deliberately\n * not a real tokenizer/parser (this is a sweep, not a compiler front-end).\n */\nfunction significantLines(content, ext) {\n  const profile = profileFor(ext);\n  const rawLines = content.split(/\\r?\\n/);\n  const sig = []; // { text, lineNo (1-indexed, original file) }\n  let blockClose = null; // the closing token we're waiting for, or null if not inside a block\n\n  rawLines.forEach((raw, i) => {\n    let text = raw;\n    if (blockClose !== null) {\n      const closeIdx = text.indexOf(blockClose);\n      if (closeIdx === -1) return; // still inside the block; whole line consumed\n      text = text.slice(closeIdx + blockClose.length);\n      blockClose = null;\n    }\n    // A line can open (and possibly also close, same line) a block construct.\n    for (const [open, close] of profile.blockPairs) {\n      const openIdx = text.indexOf(open);\n      if (openIdx === -1) continue;\n      const afterOpen = text.slice(openIdx + open.length);\n      const closeIdx = afterOpen.indexOf(close);\n      if (closeIdx === -1) {\n        text = text.slice(0, openIdx); // opens and doesn't close on this line\n        blockClose = close;\n      } else {\n        text = text.slice(0, openIdx) + afterOpen.slice(closeIdx + close.length); // same-line open+close\n      }\n    }\n    for (const lc of profile.lineComments) {\n      const idx = text.indexOf(lc);\n      if (idx !== -1) text = text.slice(0, idx);\n    }\n    if (isSignificant(text)) sig.push({ text: text.trim(), lineNo: i + 1 });\n  });\n  return sig;\n}\n\nfunction hashWindow(sig, start, k) {\n  const h = createHash(\"sha1\");\n  for (let i = start; i < start + k; i++) h.update(sig[i].text).update(\"\\n\");\n  return h.digest(\"hex\");\n}\n\n/** Extend a seed match [start, start+K) at (fileA,idxA)/(fileB,idxB) to its maximal run. */\nfunction extend(sigA, idxA, sigB, idxB, k) {\n  let back = 0;\n  while (idxA - back - 1 >= 0 && idxB - back - 1 >= 0 && sigA[idxA - back - 1].text === sigB[idxB - back - 1].text) back++;\n  let fwd = 0;\n  const endA0 = idxA + k, endB0 = idxB + k;\n  while (endA0 + fwd < sigA.length && endB0 + fwd < sigB.length && sigA[endA0 + fwd].text === sigB[endB0 + fwd].text) fwd++;\n  return {\n    startA: idxA - back, endA: idxA + k + fwd - 1,\n    startB: idxB - back, endB: idxB + k + fwd - 1,\n  };\n}\n\nfunction main() {\n  const opts = parseArgs(process.argv.slice(2));\n  const K = opts.minLines;\n\n  // resolve(), not join(): join() concatenates even an absolute `d` onto ROOT\n  // instead of using it as-is (caught by dogfooding this against a temp-dir\n  // fixture outside the repo — an absolute --dir arg silently became\n  // <root>/tmp/... and \"found\" zero files instead of erroring or working).\n  const files = opts.dirs.flatMap((d) => walk(resolve(ROOT, d), opts));\n  if (files.length === 0) {\n    console.error(`refusing to sweep: no source files found under ${opts.dirs.join(\", \")} (extensions: ${[...opts.includeExt].join(\", \")})`);\n    process.exit(1);\n  }\n\n  const fileSig = new Map(); // file -> significantLines(content, ext)\n  const byHash = new Map(); // windowHash -> [{file, idx}]\n\n  for (const file of files) {\n    let content;\n    try {\n      content = readFileSync(file, \"utf8\");\n    } catch {\n      continue;\n    }\n    const sig = significantLines(content, extname(file));\n    fileSig.set(file, sig);\n    if (sig.length < K) continue;\n    for (let i = 0; i + K <= sig.length; i++) {\n      const h = hashWindow(sig, i, K);\n      const list = byHash.get(h) ?? [];\n      list.push({ file, idx: i });\n      byHash.set(h, list);\n    }\n  }\n\n  // ── seed -> extend -> dedupe ────────────────────────────────────────────\n  // key: \"fileA\\0startA\\0endA\\0fileB\\0startB\\0endB\" (files ordered so a pair\n  // is only ever keyed one way) -> the extended match. Every one of the many\n  // overlapping seeds inside one true duplicate collapses to the same key.\n  const pairMatches = new Map();\n  for (const occ of byHash.values()) {\n    if (occ.length < 2) continue;\n    for (let a = 0; a < occ.length; a++) {\n      for (let b = a + 1; b < occ.length; b++) {\n        let A = occ[a], B = occ[b];\n        // Canonical order so (A,B) and (B,A) from a different seed collapse\n        // to the same key: by file name, then by index within that file.\n        if (A.file > B.file || (A.file === B.file && A.idx > B.idx)) [A, B] = [B, A];\n        if (A.file === B.file && A.idx === B.idx) continue; // same exact position, not a real pair\n        const sigA = fileSig.get(A.file), sigB = fileSig.get(B.file);\n        const ext = extend(sigA, A.idx, sigB, B.idx, K);\n        const key = [A.file, ext.startA, ext.endA, B.file, ext.startB, ext.endB].join(\"\\0\");\n        if (!pairMatches.has(key)) {\n          pairMatches.set(key, {\n            fileA: A.file, startA: sigA[ext.startA].lineNo, endA: sigA[ext.endA].lineNo,\n            fileB: B.file, startB: sigB[ext.startB].lineNo, endB: sigB[ext.endB].lineNo,\n            lines: ext.endA - ext.startA + 1,\n            sample: sigA.slice(ext.startA, Math.min(ext.startA + 3, ext.endA + 1)).map((l) => l.text),\n          });\n        }\n      }\n    }\n  }\n\n  // ── group pairwise matches sharing the same primary (fileA,startA-endA) ──\n  // range into one N-way finding, so \"this block is duplicated in 5 other\n  // files\" reports as one row, not 5.\n  const byPrimary = new Map(); // \"fileA\\0startA\\0endA\" -> { ...primary, partners: [] }\n  for (const m of pairMatches.values()) {\n    const key = [m.fileA, m.startA, m.endA].join(\"\\0\");\n    const entry = byPrimary.get(key) ?? {\n      file: m.fileA, start: m.startA, end: m.endA, lines: m.lines, sample: m.sample, partners: [],\n    };\n    entry.partners.push({ file: m.fileB, start: m.startB, end: m.endB });\n    byPrimary.set(key, entry);\n  }\n\n  const findings = [...byPrimary.values()].map((f) => {\n    const allFiles = new Set([f.file, ...f.partners.map((p) => p.file)]);\n    const crossFile = allFiles.size > 1;\n    const occurrences = f.partners.length + 1;\n    return {\n      ...f,\n      occurrences,\n      distinct_files: allFiles.size,\n      cross_file: crossFile,\n      impact: (crossFile ? 100 : 1) * occurrences * f.lines,\n    };\n  });\n  findings.sort((a, b) => b.impact - a.impact || b.lines - a.lines);\n\n  const crossFile = findings.filter((f) => f.cross_file);\n  const top = findings.slice(0, opts.top);\n\n  console.log(`redundancy-sweep: ${files.length} files, seed window ${K} significant lines`);\n  console.log(`  ${findings.length} duplicate blocks (after merge+dedupe), ${crossFile.length} cross-file\\n`);\n\n  for (const f of top) {\n    const tag = f.cross_file ? \"CROSS-FILE\" : \"same-file  \";\n    console.log(`[${tag}] ${f.lines} lines, x${f.occurrences} occurrences, impact=${f.impact}`);\n    console.log(`    ${relative(ROOT, f.file).replace(/\\\\/g, \"/\")}:${f.start}-${f.end}`);\n    for (const p of f.partners) console.log(`    ${relative(ROOT, p.file).replace(/\\\\/g, \"/\")}:${p.start}-${p.end}`);\n    console.log(`    \"${f.sample[0]}\"${f.sample.length > 1 ? \" ...\" : \"\"}`);\n    console.log(\"\");\n  }\n\n  if (opts.json) {\n    const out = findings.map((f) => ({\n      file: relative(ROOT, f.file).replace(/\\\\/g, \"/\"), start: f.start, end: f.end, lines: f.lines,\n      occurrences: f.occurrences, distinct_files: f.distinct_files, cross_file: f.cross_file, impact: f.impact,\n      partners: f.partners.map((p) => ({ file: relative(ROOT, p.file).replace(/\\\\/g, \"/\"), start: p.start, end: p.end })),\n    }));\n    writeFileSync(opts.json, JSON.stringify({ files_scanned: files.length, seed_window: K, findings: out }, null, 2), \"utf8\");\n    console.log(`wrote ${opts.json}`);\n  }\n\n  if (opts.failOnCrossFile && crossFile.length > 0) {\n    console.error(`FAIL: ${crossFile.length} cross-file duplicate block(s) found`);\n    process.exit(1);\n  }\n}\n\nmain();\n";

// ── the three deliberate substitutions ──────────────────────────────────────
const TEMPLATE_ROOT_LINE = 'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");';
const GENERATED_ROOT_LINE = "const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));";
const TEMPLATE_DIRS_LINE = 'if (opts.dirs.length === 0) opts.dirs = ["packages", "apps"];';
const GENERATED_DIRS_LINE = 'if (opts.dirs.length === 0) opts.dirs = ["."];';
const TEMPLATE_EXT_LINE = 'const DEFAULT_INCLUDE_EXT = new Set([".ts", ".tsx", ".py"]);';

/**
 * Extensions the scanner has a real comment/string-stripping profile for,
 * keyed by the language name repo-parser's own detection reports — restricted
 * to actual programming languages. Markup/config/style languages (Markdown,
 * YAML, CSS, ...) are excluded on purpose: they'd mostly surface
 * boilerplate-shape noise, not logic duplication, for this specific sweep.
 * FALLBACK_EXTENSIONS is the tool's own original default (TS/JS/Python) —
 * used only when nothing detected maps to a known language, so a repo the
 * detector doesn't recognize still gets a broadly useful starting point
 * rather than an empty, useless scanner.
 */
const LANGUAGE_TO_EXTENSIONS: Record<string, string[]> = {
  TypeScript: [".ts", ".tsx"],
  JavaScript: [".js", ".jsx"],
  Python: [".py"],
  Go: [".go"],
  Rust: [".rs"],
  Ruby: [".rb"],
  Java: [".java"],
  Kotlin: [".kt"],
  Swift: [".swift"],
  C: [".c", ".h"],
  "C++": [".cpp", ".hpp"],
  "C#": [".cs"],
  PHP: [".php"],
  Shell: [".sh", ".bash"],
};
const FALLBACK_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py"];

/**
 * Pick --ext defaults from the REAL detected language mix, never from the
 * language NAME itself — only ever a lookup result from the fixed table
 * above ever reaches the generated script body, so a hostile/injected
 * language name (repo-derived, untrusted) has nothing to land in.
 */
export function pickIncludeExtensions(ctx: ContextMap): string[] {
  const matched = (ctx.detection?.languages ?? [])
    .map((l) => LANGUAGE_TO_EXTENSIONS[l.name])
    .filter((exts): exts is string[] => Array.isArray(exts))
    .flat();
  const deduped = [...new Set(matched)];
  return deduped.length > 0 ? deduped : FALLBACK_EXTENSIONS;
}

export function generateRedundancySweepScript(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  const extensions = pickIncludeExtensions(ctx);
  const extLine = `const DEFAULT_INCLUDE_EXT = new Set([${extensions.map((e) => JSON.stringify(e)).join(", ")}]);`;

  const content = EMBEDDED_SCRIPT_SOURCE
    .replace(TEMPLATE_ROOT_LINE, GENERATED_ROOT_LINE)
    .replace(TEMPLATE_DIRS_LINE, GENERATED_DIRS_LINE)
    .replace(TEMPLATE_EXT_LINE, extLine);

  return {
    path: "redundancy-sweep.mjs",
    content,
    content_type: "text/javascript",
    program: "superpowers",
    description: "Cross-file duplicate-code scanner (Node, dependency-free), defaults tuned to this repo's real detected languages — the mechanical half; see redundancy-sweep-playbook.md for the judgment method",
  };
}

export function generateRedundancySweepPlaybook(
  ctx: ContextMap,
  _profile: RepoProfile,
  _files?: SourceFile[],
): GeneratedFile {
  // Inline within a sentence, never as the sole content of its own line: a
  // heading-injection payload's embedded newline collapses under mdText's
  // whitespace-collapse, but only stays defanged if real text precedes it on
  // the rendered line (see generators-redundancy-sweep.test.ts's hostile-ctx
  // suite — every hostile fixture there prefixes the payload with real
  // content for exactly this reason).
  const topLanguage = mdText(ctx.detection?.languages?.[0]?.name ?? "the language this repo mostly uses");

  const lines: string[] = [];
  lines.push("# Redundancy Sweep — Playbook");
  lines.push("");
  lines.push(
    mdText(
      `This is the judgment half of redundancy-sweep.mjs. Running the scanner is free and mechanical; ` +
        `everything below is what turns a raw finding into a safe fix. This repo's dominant detected ` +
        `language is ${topLanguage} — the scanner's own defaults are already tuned to that, so no flags ` +
        `should be needed for a first pass.`,
    ),
  );
  lines.push("");
  lines.push("## 1. Run the scanner");
  lines.push("");
  lines.push("```");
  lines.push("node redundancy-sweep.mjs .");
  lines.push("```");
  lines.push("");
  lines.push(
    "Cross-file findings matter most — the scanner ranks them above same-file repeats, which are frequently a deliberate per-item loop pattern, not a defect.",
  );
  lines.push("");
  lines.push("## 2. A finding is a question, not an instruction to consolidate");
  lines.push("");
  lines.push(
    "Do not mechanically fix every finding the scanner reports. Before touching anything, read the surrounding class/function docstring — if it explains a deliberate reason the two things look similar but aren't the same, leave it alone.",
  );
  lines.push("");
  lines.push(
    "Concrete example from building this tool: a scanner flagged two services as duplicates because their method shapes matched almost exactly. The class comment on one of them read \"SIBLING TO X, NOT A MERGE INTO IT\" — an explicit, reasoned design decision that two things should stay separate. Consolidating it anyway would have silently reverted a decision someone already made and reasoned through. That is the failure mode this step exists to prevent.",
  );
  lines.push("");
  lines.push("## 3. If it's genuinely accidental");
  lines.push("");
  lines.push("- Extract the shared logic into one module both call.");
  lines.push(
    "- If the copies have already diverged — one fixed a bug the other didn't — keep the fix, don't pick a copy arbitrarily. Diff them; understand why they differ before merging.",
  );
  lines.push("- Add a regression test that would have caught the divergence, not just a test that the merge compiles.");
  lines.push("");
  lines.push("## 4. Verify before committing");
  lines.push("");
  lines.push(
    "Run this repo's own real build/test commands — read them from its own manifest (package.json/pyproject.toml/go.mod/etc.), never assume. A fix that isn't verified against the repo's actual gate is a guess wearing a commit message.",
  );
  lines.push("");
  lines.push("## 5. If more than one agent may be active in this repo");
  lines.push("");
  lines.push(
    "Check recent file-modification times and git log before editing a file that looks like it's mid-change. Coordinate rather than overwrite. A branch switch changes the checked-out ref for the whole working directory, not just your own session — avoid it if anything else might be relying on the current checkout.",
  );
  lines.push("");
  lines.push(
    "None of this needs to run on any account but this repo's own — the scan is a script, and whichever agent reads this file next is the one that does the judgment work, on its own turn.",
  );

  return {
    path: "redundancy-sweep-playbook.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "superpowers",
    description: "How to triage and fix redundancy-sweep.mjs's findings safely — the judgment method, not just the scanner",
  };
}
