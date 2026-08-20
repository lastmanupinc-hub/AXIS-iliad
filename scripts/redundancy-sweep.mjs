// redundancy-sweep.mjs — finds duplicated code blocks ACROSS files.
//
// Why this exists: this repo's own ledger (begin.yaml) names "hand-duplicated
// catalog/pricing drift" and "REST/MCP twin-implementation divergence" as
// recurring bug families — found by hand, repeatedly, after the fact (e.g. the
// count-extractors.ts consolidation, the storefront billing-honesty guard).
// This is the general tool that finds the NEXT one before a human has to.
//
// Method: seed-and-extend (the same family as CPD/jscpd, simplified).
//   1. SEED: hash every K-significant-line window per file; a hash shared by
//      2+ (file, position) pairs is a candidate duplicate seed.
//   2. EXTEND: for every pair of seed positions, grow the match backward and
//      forward by comparing exact line text until it breaks — this finds the
//      MAXIMAL duplicated run, not just the K-line seed window.
//   3. DEDUPE: many overlapping seeds land on the same maximal run once
//      extended (a 40-line duplicate produces ~33 overlapping 8-line seeds) —
//      collapse by the extended (file, startLine, endLine) triple.
//   4. GROUP: findings anchored at the same primary range are merged into one
//      N-way report instead of N-choose-2 pairwise rows.
// A naive "report every seed" version was tried first (dogfooding this on
// axis-iliad itself) and was unusable: one real 40-line duplicate block
// produced 20+ near-identical overlapping rows. This is the fix.
//
// Deliberately dependency-free (node: builtins only), matching every other
// script in this directory — an offline build must not need the npm registry.
//
//   node scripts/redundancy-sweep.mjs [--min-lines=8] [--top=25] [--json=out.json] [dir...]
//
// Exit code 0 always (this is a report, not a gate) unless --fail-on-cross-file
// is passed, for future wiring into scripts/ship.sh gate if it proves its worth.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// fileURLToPath, not manual URL parsing — a bare regex strip leaves "%20" for
// any space in the path (this repo's own "No Fate Platform" parent directory
// hit exactly that on the first real run; see build-storefront.mjs's identical
// fileURLToPath usage for the same reason, one Windows-path lesson learned twice).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage",
  ".storefront-dist", ".ai", ".ai-output", "git-mirrors",
]);
const INCLUDE_EXT = new Set([".ts", ".tsx"]);

function parseArgs(argv) {
  const opts = { minLines: 8, top: 25, json: null, failOnCrossFile: false, includeTests: false, dirs: [] };
  for (const a of argv) {
    if (a.startsWith("--min-lines=")) opts.minLines = Number(a.slice(12));
    else if (a.startsWith("--top=")) opts.top = Number(a.slice(6));
    else if (a.startsWith("--json=")) opts.json = a.slice(7);
    else if (a === "--fail-on-cross-file") opts.failOnCrossFile = true;
    else if (a === "--include-tests") opts.includeTests = true;
    else opts.dirs.push(a);
  }
  if (opts.dirs.length === 0) opts.dirs = ["packages", "apps"];
  return opts;
}

function walk(dir, includeTests, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir may not exist (e.g. a filtered workspace) — skip, don't crash the sweep
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, includeTests, out);
    } else if (INCLUDE_EXT.has(extname(entry.name))) {
      if (/\.d\.ts$/.test(entry.name)) continue; // generated type declarations, never source
      const isTest = /\.test\.tsx?$/.test(entry.name);
      if (isTest && !includeTests) continue;
      out.push(full);
    }
  }
  return out;
}

/** A line counts as "significant" if it carries real logic/data, not structure. */
function isSignificant(line) {
  const t = line.trim();
  if (t.length === 0) return false;
  if (/^[{}()[\];,]+$/.test(t)) return false; // bare punctuation
  if (t.startsWith("//")) return false;
  if (t.startsWith("*") || t.startsWith("/*")) return false; // block-comment interior/open
  return true;
}

function significantLines(content) {
  const rawLines = content.split(/\r?\n/);
  const sig = []; // { text, lineNo (1-indexed, original file) }
  rawLines.forEach((text, i) => {
    if (isSignificant(text)) sig.push({ text: text.trim(), lineNo: i + 1 });
  });
  return sig;
}

function hashWindow(sig, start, k) {
  const h = createHash("sha1");
  for (let i = start; i < start + k; i++) h.update(sig[i].text).update("\n");
  return h.digest("hex");
}

/** Extend a seed match [start, start+K) at (fileA,idxA)/(fileB,idxB) to its maximal run. */
function extend(sigA, idxA, sigB, idxB, k) {
  let back = 0;
  while (idxA - back - 1 >= 0 && idxB - back - 1 >= 0 && sigA[idxA - back - 1].text === sigB[idxB - back - 1].text) back++;
  let fwd = 0;
  const endA0 = idxA + k, endB0 = idxB + k;
  while (endA0 + fwd < sigA.length && endB0 + fwd < sigB.length && sigA[endA0 + fwd].text === sigB[endB0 + fwd].text) fwd++;
  return {
    startA: idxA - back, endA: idxA + k + fwd - 1,
    startB: idxB - back, endB: idxB + k + fwd - 1,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const K = opts.minLines;

  // resolve(), not join(): join() concatenates even an absolute `d` onto ROOT
  // instead of using it as-is (caught by dogfooding this against a temp-dir
  // fixture outside the repo — an absolute --dir arg silently became
  // <root>/tmp/... and "found" zero files instead of erroring or working).
  const files = opts.dirs.flatMap((d) => walk(resolve(ROOT, d), opts.includeTests));
  if (files.length === 0) {
    console.error(`refusing to sweep: no source files found under ${opts.dirs.join(", ")}`);
    process.exit(1);
  }

  const fileSig = new Map(); // file -> significantLines(content)
  const byHash = new Map(); // windowHash -> [{file, idx}]

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const sig = significantLines(content);
    fileSig.set(file, sig);
    if (sig.length < K) continue;
    for (let i = 0; i + K <= sig.length; i++) {
      const h = hashWindow(sig, i, K);
      const list = byHash.get(h) ?? [];
      list.push({ file, idx: i });
      byHash.set(h, list);
    }
  }

  // ── seed -> extend -> dedupe ────────────────────────────────────────────
  // key: "fileA\0startA\0endA\0fileB\0startB\0endB" (files ordered so a pair
  // is only ever keyed one way) -> the extended match. Every one of the many
  // overlapping seeds inside one true duplicate collapses to the same key.
  const pairMatches = new Map();
  for (const occ of byHash.values()) {
    if (occ.length < 2) continue;
    for (let a = 0; a < occ.length; a++) {
      for (let b = a + 1; b < occ.length; b++) {
        let A = occ[a], B = occ[b];
        // Canonical order so (A,B) and (B,A) from a different seed collapse
        // to the same key: by file name, then by index within that file.
        if (A.file > B.file || (A.file === B.file && A.idx > B.idx)) [A, B] = [B, A];
        if (A.file === B.file && A.idx === B.idx) continue; // same exact position, not a real pair
        const sigA = fileSig.get(A.file), sigB = fileSig.get(B.file);
        const ext = extend(sigA, A.idx, sigB, B.idx, K);
        const key = [A.file, ext.startA, ext.endA, B.file, ext.startB, ext.endB].join("\0");
        if (!pairMatches.has(key)) {
          pairMatches.set(key, {
            fileA: A.file, startA: sigA[ext.startA].lineNo, endA: sigA[ext.endA].lineNo,
            fileB: B.file, startB: sigB[ext.startB].lineNo, endB: sigB[ext.endB].lineNo,
            lines: ext.endA - ext.startA + 1,
            sample: sigA.slice(ext.startA, Math.min(ext.startA + 3, ext.endA + 1)).map((l) => l.text),
          });
        }
      }
    }
  }

  // ── group pairwise matches sharing the same primary (fileA,startA-endA) ──
  // range into one N-way finding, so "this block is duplicated in 5 other
  // files" reports as one row, not 5.
  const byPrimary = new Map(); // "fileA\0startA\0endA" -> { ...primary, partners: [] }
  for (const m of pairMatches.values()) {
    const key = [m.fileA, m.startA, m.endA].join("\0");
    const entry = byPrimary.get(key) ?? {
      file: m.fileA, start: m.startA, end: m.endA, lines: m.lines, sample: m.sample, partners: [],
    };
    entry.partners.push({ file: m.fileB, start: m.startB, end: m.endB });
    byPrimary.set(key, entry);
  }

  const findings = [...byPrimary.values()].map((f) => {
    const allFiles = new Set([f.file, ...f.partners.map((p) => p.file)]);
    const crossFile = allFiles.size > 1;
    const occurrences = f.partners.length + 1;
    return {
      ...f,
      occurrences,
      distinct_files: allFiles.size,
      cross_file: crossFile,
      impact: (crossFile ? 100 : 1) * occurrences * f.lines,
    };
  });
  findings.sort((a, b) => b.impact - a.impact || b.lines - a.lines);

  const crossFile = findings.filter((f) => f.cross_file);
  const top = findings.slice(0, opts.top);

  console.log(`redundancy-sweep: ${files.length} files, seed window ${K} significant lines`);
  console.log(`  ${findings.length} duplicate blocks (after merge+dedupe), ${crossFile.length} cross-file\n`);

  for (const f of top) {
    const tag = f.cross_file ? "CROSS-FILE" : "same-file  ";
    console.log(`[${tag}] ${f.lines} lines, x${f.occurrences} occurrences, impact=${f.impact}`);
    console.log(`    ${relative(ROOT, f.file).replace(/\\/g, "/")}:${f.start}-${f.end}`);
    for (const p of f.partners) console.log(`    ${relative(ROOT, p.file).replace(/\\/g, "/")}:${p.start}-${p.end}`);
    console.log(`    "${f.sample[0]}"${f.sample.length > 1 ? " ..." : ""}`);
    console.log("");
  }

  if (opts.json) {
    const out = findings.map((f) => ({
      file: relative(ROOT, f.file).replace(/\\/g, "/"), start: f.start, end: f.end, lines: f.lines,
      occurrences: f.occurrences, distinct_files: f.distinct_files, cross_file: f.cross_file, impact: f.impact,
      partners: f.partners.map((p) => ({ file: relative(ROOT, p.file).replace(/\\/g, "/"), start: p.start, end: p.end })),
    }));
    writeFileSync(opts.json, JSON.stringify({ files_scanned: files.length, seed_window: K, findings: out }, null, 2), "utf8");
    console.log(`wrote ${opts.json}`);
  }

  if (opts.failOnCrossFile && crossFile.length > 0) {
    console.error(`FAIL: ${crossFile.length} cross-file duplicate block(s) found`);
    process.exit(1);
  }
}

main();
