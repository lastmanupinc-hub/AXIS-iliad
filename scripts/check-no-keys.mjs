#!/usr/bin/env node
// check-no-keys — no value from the estate's key file reaches a commit or a deploy (the site standard's eng.secrets,
// AXIS Launch taskgate, 2026-11-04; Print My Design's check-no-keys.mjs is the model). It reads every value of 12 or
// more characters in the key file and looks for each one, as plain text, in the files named below. It prints only
// `label -> file` on a hit (the label only when it is a bare NAME, otherwise the key file's line number) and counts,
// never a value, a fragment or a digest of one.
//
//   node scripts/check-no-keys.mjs                    the staged files (.githooks/pre-commit)
//   node scripts/check-no-keys.mjs --tree [--require] every tracked file in the working tree (scripts/ci-local.sh)
//   node scripts/check-no-keys.mjs --dir <path> [--require]  every file under <path>, e.g. a build about to be uploaded
//   node scripts/check-no-keys.mjs <file...>          the named files
//
// The key file is $AXIS_KEY_FILE, else $ESTATE_KEY_FILE, else key.txt beside the repository (the estate layout)
// or beside the main checkout when this is a worktree.
// Without one the scan warns and passes, so a clone outside the estate is not blocked; --require (the deploy path,
// scripts/ship.sh) refuses instead. This repository is public: a value that lands in a commit is published.
// key-scan-allow.txt beside the key file ($AXIS_KEY_SCAN_ALLOW names another) lists the few labels whose values are
// configuration the code must carry, such as a model's public name: one label per line, `#` starts a reason. It lives
// with the key file, not here, because a label list describes the key file and this repository is public.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const MAX_BYTES = 10 * 1024 * 1024;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/** The key file's values, each with the name it may be printed under. Mirrors the estate's secret guard. */
export function keyValues(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(#|\/\/)/.test(line)) return;
    const m = /^\s*([A-Za-z0-9_.-]+)\s*[:=]\s*(.*)$/.exec(line);
    // A label is printed only when it is a bare name: a malformed line can run a value into the "label".
    const bare = Boolean(m) && /^[A-Z][A-Z0-9_]{1,47}$/.test(m[1]) && !/[0-9]{4}/.test(m[1]);
    const where = `key file line ${i + 1}`;
    const label = bare ? m[1] : where;
    const v = (m ? m[2] : line).trim().replace(/^["']|["']$/g, "");
    if (v.length < 12) return;
    // Public addresses the key file records beside the secrets: a plain URL (no user:pass@, no token in the query),
    // an email address, a bare hostname, a file path.
    if (/^https?:\/\/\S+$/i.test(v) && !/\/\/[^/]*@|[?&](key|token|secret|sig|signature|code)=/i.test(v)) return;
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return;
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return; // a bare hostname
    if (/^[A-Za-z]:[\\/]\S*$|^\/\S*$/.test(v)) return;
    out.push({ label, where, v });
    if (/\s/.test(v)) for (const part of v.split(/\s+/)) if (part.length >= 20) out.push({ label, where, v: part });
  });
  // A label that itself contains a value is named by its line number alone.
  return out.map((s) => (out.some((o) => s.label.includes(o.v)) ? { ...s, label: s.where } : s));
}

function walk(dir) {
  const files = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else if (e.isFile()) files.push(p);
  }
  return files;
}

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** [name, () => text] for each file the mode names. Staged files are read from the index, not the working tree. */
function targets() {
  if (flag("--tree")) {
    return git("ls-files", "-z").split("\0").filter(Boolean)
      .map((f) => [f, () => readFileSync(join(repoRoot, f), "latin1")]);
  }
  if (flag("--dir")) {
    const dir = resolve(argv[argv.indexOf("--dir") + 1] ?? "");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.log(`check-no-keys: --dir ${relative(repoRoot, dir) || dir} is not a directory`);
      process.exit(1);
    }
    return walk(dir).map((f) => [relative(repoRoot, f).replace(/\\/g, "/"), () => readFileSync(f, "latin1")]);
  }
  const named = argv.filter((a) => !a.startsWith("--"));
  if (named.length) return named.map((f) => [f, () => readFileSync(resolve(f), "latin1")]);
  return git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR").split("\0").filter(Boolean)
    .map((f) => [f, () => execFileSync("git", ["show", `:${f}`], { cwd: repoRoot, maxBuffer: MAX_BYTES * 2 }).toString("latin1")]);
}

// A key file named in the environment is the only one looked at: a wrong name is reported, never stepped around.
const named = process.env.AXIS_KEY_FILE || process.env.ESTATE_KEY_FILE;
const keyFile = (named ? [named] : [
  resolve(repoRoot, "..", "key.txt"),
  // From a worktree: beside the main checkout, which holds the shared .git folder.
  resolve(repoRoot, git("rev-parse", "--git-common-dir").trim(), "..", "..", "key.txt"),
]).find((p) => existsSync(p));

if (!keyFile) {
  if (flag("--require")) {
    console.log("check-no-keys: REFUSED: no key file (set AXIS_KEY_FILE); a deploy is never left unscanned");
    process.exit(1);
  }
  console.log("WARN   check-no-keys: no key file found (set AXIS_KEY_FILE); nothing scanned");
  process.exit(0);
}

// Labels whose values are configuration the code must name, not secrets. Only a bare label can be allowed; a
// line-number name never is.
const allowFile = process.env.AXIS_KEY_SCAN_ALLOW || join(dirname(keyFile), "key-scan-allow.txt");
const allowed = new Set(existsSync(allowFile)
  ? readFileSync(allowFile, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean) : []);

// Values are compared as latin1 strings on both sides, so a multi-byte value matches byte for byte.
const values = keyValues(readFileSync(keyFile, "utf8"))
  .filter((s) => !(s.label !== s.where && allowed.has(s.label)))
  .map((s) => ({ ...s, v: Buffer.from(s.v, "utf8").toString("latin1") }));
const files = targets();
const hits = new Set();
let scanned = 0;
for (const [name, read] of files) {
  let text;
  try {
    if (!flag("--tree") || statSync(join(repoRoot, name)).size <= MAX_BYTES) text = read();
  } catch {
    continue; // deleted or unreadable: nothing of it is committed or uploaded
  }
  if (text === undefined || text.length > MAX_BYTES) continue;
  scanned += 1;
  for (const { label, v } of values) if (text.includes(v)) hits.add(`${label} -> ${name}`);
}
for (const h of hits) console.log(`HIT    ${h}`);
console.log(`check-no-keys: ${values.length} value(s) scanned across ${scanned} file(s), ${hits.size} hit(s)`);
process.exit(hits.size ? 1 : 0);
