#!/usr/bin/env node
// ─── axis-iliad self-contained bundle build ─────────────────────
//
// Produces dist/ with ZERO runtime dependencies: the CLI's own compiled
// modules plus every reachable module of its @axis/* workspace deps,
// vendored under dist/vendor/ with import specifiers rewritten to relative
// paths. No bundler dependency is added — the module graph is walked with
// the TypeScript compiler API (typescript is already a devDependency) and
// packages are compiled with their own tsconfigs via the workspace tsc.
//
// "@axis/snapshots" is special-cased: its package index re-exports the
// Postgres data layer (pg), which the offline CLI must never load. Imports
// of "@axis/snapshots" are redirected to a generated pg-free façade
// (dist/vendor/snapshots-lite.js) that re-exports only the pure modules
// (github.js, symbols.js). The build FAILS if any walked file imports a
// name from "@axis/snapshots" that the façade does not provide, or if any
// non-@axis external package is imported at runtime.
//
// Must run inside the pnpm workspace (dev, CI, prepublishOnly all qualify).

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(cliDir, "..", "..");
const distDir = path.join(cliDir, "dist");
const tscOut = path.join(cliDir, ".tsc-out");
const tscBin = path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");

// Build order matters only for .d.ts cross-references; this is topological.
const WORKSPACE_PKGS = [
  "snapshots",
  "repo-parser",
  "context-engine",
  "ap2",
  "agentic-compliance",
  "generator-core",
];

// The pg-free façade for "@axis/snapshots": only these modules are vendored.
const SNAPSHOTS_LITE_MODULES = ["github.js", "symbols.js"];
const LITE_SPECIFIER = "@axis/snapshots";

const BUILTINS = new Set(builtinModules);

function step(msg) {
  process.stdout.write(`\n[build] ${msg}\n`);
}

function fail(msg) {
  console.error(`\n[build] FAILED: ${msg}`);
  process.exit(1);
}

function runTsc(projectDir, extraArgs = []) {
  const res = spawnSync(process.execPath, [tscBin, "-p", projectDir, ...extraArgs], {
    stdio: "inherit",
    cwd: rootDir,
  });
  if (res.status !== 0) fail(`tsc failed for ${projectDir}`);
}

// ─── 1. Compile everything ──────────────────────────────────────

step("compiling workspace packages (tsc)");
for (const pkg of WORKSPACE_PKGS) {
  runTsc(path.join(rootDir, "packages", pkg));
}

step("compiling CLI sources (tsc)");
rmSync(tscOut, { recursive: true, force: true });
runTsc(cliDir, [
  "--outDir", tscOut,
  "--declaration", "false",
  "--declarationMap", "false",
  "--sourceMap", "false",
]);

// ─── 2. Walk the runtime module graph ───────────────────────────

/** Map "@axis/<name>" → { name, distDir } for workspace packages. */
function workspacePkg(specifier) {
  const m = /^@axis\/([a-z0-9-]+)$/.exec(specifier);
  if (!m) return null;
  const dir = path.join(rootDir, "packages", m[1], "dist");
  return existsSync(dir) ? { name: m[1], distDir: dir } : null;
}

/** Where does a source file land inside dist/? */
function destFor(absFile) {
  if (absFile.startsWith(tscOut + path.sep)) {
    return path.join(distDir, path.relative(tscOut, absFile));
  }
  for (const pkg of WORKSPACE_PKGS) {
    const pkgDist = path.join(rootDir, "packages", pkg, "dist");
    if (absFile.startsWith(pkgDist + path.sep)) {
      return path.join(distDir, "vendor", pkg, path.relative(pkgDist, absFile));
    }
  }
  fail(`cannot map ${absFile} into dist/`);
}

/** Relative ESM specifier from one emitted file to another. */
function relSpecifier(fromDest, toDest) {
  let rel = path.relative(path.dirname(fromDest), toDest).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/**
 * All module-specifier string literals in a file: static import/export-from
 * plus dynamic import(). Uses the REAL parser — ts.preProcessFile is a
 * heuristic scanner and false-positives on `import …` text inside template
 * literals (which generator templates are full of).
 */
function moduleRefs(sourceFile) {
  const refs = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      refs.push(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      refs.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return refs;
}

/** Named bindings imported from `spec` inside a file (for façade verification). */
function importedNames(sourceFile, spec) {
  const names = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === spec) {
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name) names.push("default");
      const b = clause.namedBindings;
      if (b && ts.isNamespaceImport(b)) names.push("*");
      if (b && ts.isNamedImports(b)) for (const el of b.elements) names.push((el.propertyName ?? el.name).text);
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === spec) {
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) names.push((el.propertyName ?? el.name).text);
      } else {
        names.push("*");
      }
    }
  }
  return names;
}

/** All runtime export names of an emitted JS module (no re-export following). */
function exportedNames(absFile) {
  const text = readFileSync(absFile, "utf8");
  const sf = ts.createSourceFile(absFile, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const names = new Set();
  const hasExport = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.add(el.name.text);
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name && hasExport(stmt)) {
      names.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt) && hasExport(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  }
  return names;
}

step("walking module graph from cli.js");

const entry = path.join(tscOut, "cli.js");
if (!existsSync(entry)) fail(`missing compiled entry ${entry}`);

const litePath = path.join(distDir, "vendor", "snapshots-lite.js");
const queue = [entry];
const visited = new Set();
const externals = [];
const liteSites = []; // { file, names }
const emitted = []; // { dest, bytes }

rmSync(distDir, { recursive: true, force: true });

while (queue.length > 0) {
  const file = queue.shift();
  if (visited.has(file)) continue;
  visited.add(file);

  if (!existsSync(file)) fail(`module not found on disk: ${file}`);
  const text = readFileSync(file, "utf8");
  const dest = destFor(file);
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  const edits = []; // { start, end, replacement }
  for (const ref of moduleRefs(parsed)) {
    const spec = ref.text;
    const start = ref.getStart(parsed) + 1; // inside the opening quote
    const end = ref.getEnd() - 1; // before the closing quote
    if (text.slice(start, end) !== spec) fail(`specifier span mismatch in ${file} for "${spec}"`);

    if (spec.startsWith("node:") || BUILTINS.has(spec)) continue;

    if (spec === LITE_SPECIFIER) {
      liteSites.push({ file, names: importedNames(parsed, spec) });
      for (const m of SNAPSHOTS_LITE_MODULES) {
        queue.push(path.join(rootDir, "packages", "snapshots", "dist", m));
      }
      edits.push({ start, end, replacement: relSpecifier(dest, litePath) });
      continue;
    }

    const pkg = workspacePkg(spec);
    if (pkg) {
      const target = path.join(pkg.distDir, "index.js");
      queue.push(target);
      edits.push({ start, end, replacement: relSpecifier(dest, destFor(target)) });
      continue;
    }

    if (spec.startsWith(".")) {
      queue.push(path.resolve(path.dirname(file), spec));
      continue; // same relative layout is preserved in dist/
    }

    externals.push(`"${spec}" imported by ${path.relative(rootDir, file)}`);
  }

  // Apply specifier rewrites (descending offset keeps earlier spans valid).
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  // Vendored copies have no adjacent .map files — drop sourceMappingURL noise.
  out = out.replace(/^\/\/# sourceMappingURL=.*$/gm, "");

  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  emitted.push({ dest, bytes: Buffer.byteLength(out) });
}

if (externals.length > 0) {
  fail(
    `the runtime graph reaches external packages — the bundle would not be self-contained:\n  ${externals.join("\n  ")}`,
  );
}

// ─── 3. Generate + verify the pg-free snapshots façade ──────────

step("generating snapshots-lite façade");

const liteContent =
  `// generated by build.mjs — pg-free façade over @axis/snapshots\n` +
  SNAPSHOTS_LITE_MODULES.map((m) => `export * from "./snapshots/${m}";`).join("\n") +
  "\n";
mkdirSync(path.dirname(litePath), { recursive: true });
writeFileSync(litePath, liteContent);
emitted.push({ dest: litePath, bytes: Buffer.byteLength(liteContent) });

const liteExports = new Set();
for (const m of SNAPSHOTS_LITE_MODULES) {
  for (const n of exportedNames(path.join(rootDir, "packages", "snapshots", "dist", m))) liteExports.add(n);
}
for (const site of liteSites) {
  for (const name of site.names) {
    if (name === "*") continue; // namespace import gets the façade union
    if (name === "default" || !liteExports.has(name)) {
      fail(
        `${path.relative(rootDir, site.file)} imports "${name}" from "@axis/snapshots" but the pg-free façade only provides: ${[...liteExports].sort().join(", ")}.\n` +
        `Either move that export into a pure module (like snapshots/src/symbols.ts) and add it to SNAPSHOTS_LITE_MODULES, or drop the import.`,
      );
    }
  }
}

// ─── 4. Self-check the emitted bundle ───────────────────────────

step("verifying emitted bundle");

function* walkJs(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walkJs(p);
    else if (p.endsWith(".js")) yield p;
  }
}

let checked = 0;
for (const file of walkJs(distDir)) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  for (const ref of moduleRefs(sf)) {
    const spec = ref.text;
    // No import may reference a workspace protocol or a bare external package.
    // (Note: "workspace:*" can legitimately appear in generator template
    // strings/comments — only import SPECIFIERS are load-bearing here.)
    if (spec.includes("workspace:")) fail(`workspace specifier "${spec}" leaked into ${file}`);
    if (spec.startsWith("node:") || BUILTINS.has(spec)) continue;
    if (!spec.startsWith(".")) fail(`bare specifier "${spec}" left in ${file}`);
    const target = path.resolve(path.dirname(file), spec);
    if (!existsSync(target)) fail(`broken relative import "${spec}" in ${file}`);
  }
  checked++;
}

// Smoke-run the bundle (workspace node_modules present here, but the bundle
// itself must resolve every import relatively for this to succeed).
const smoke = spawnSync(process.execPath, [path.join(distDir, "cli.js"), "--version"], {
  cwd: cliDir,
  encoding: "utf8",
});
if (smoke.status !== 0) fail(`bundle smoke test failed:\n${smoke.stderr}`);

const totalBytes = emitted.reduce((s, e) => s + e.bytes, 0);
step(
  `done — ${emitted.length} modules (${(totalBytes / 1024).toFixed(0)} KB) in dist/, ` +
  `${checked} files verified self-contained, smoke: ${smoke.stdout.trim()}`,
);

rmSync(tscOut, { recursive: true, force: true });
