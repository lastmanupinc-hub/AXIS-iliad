# WO-16 · axis-iliad-cli

**Claim it makes true:** DocsPage: "npm install -g axis-iliad" + "npx axis-iliad analyze/export/github".

**Tier:** B_client_external_gated · **Effort:** L · **Package:** apps/cli (rename to `axis-iliad`); minor edits in apps/web (DocsPage) and packaging/manifests

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** Three unstated decisions block a no-further-design build: (1) a program->category taxonomy/source for list-programs, since no category data exists in listAvailableGenerators or generator metadata; (2) an explicit field mapping from the real GET /v1/account payload (account/quota/entitlements/usage_credits) to the AccountStatus{plan,usage} the status command prints; (3) an approved bundler choice (esbuild vs reuse existing toolchain vs publishing the four @axis/* packages) plus owner sign-off, since adding esbuild violates the no-deps rule. Also unspecified: whether legacy 'auth login <positional>' and '--program' are retained alongside 'auth --key'/'--programs' so the existing cli*.test.ts suites stay green.
**Spec overclaims flagged:** 'DONE for the buildable portion = npm pack + local install of self-contained dist' is framed as doable-now but is itself blocked on esbuild dep approval; list-programs acceptance requires a per-line 'category' label, but listAvailableGenerators() returns only {path, program} and generator metadata has no category field -- the taxonomy must be invented; spec hand-waves 'now labelled tier+category'; status.ts AccountStatus{plan, usage} does not match the real GET /v1/account response {account, quota, entitlements, usage_credits}; the mapping needed for 'real plan/usage' is unspecified; Claims zip.ts 'mirrors apps/api/src/export.ts ZipEntry approach ... method=0' but export.ts actually uses DEFLATE (method 8/zlib), not STORE -- minor mischaracterization (STORE is simpler and still valid); 'Existing suites pass unchanged' while changing auth from positional axis_* to --key and adding --programs -- requires retaining legacy branches the spec does not explicitly mandate
**Hidden external gates:** esbuild (or equivalent) build-time devDependency requires owner sign-off per CLAUDE.md 'no deps without discussion' -- this blocks the self-contained dist, which is itself the spec's 'buildable-now proxy', so a core acceptance item is gated on human approval the agent cannot self-clear; Public npm name 'axis-iliad' availability/ownership is unverified -- publish fails if the name is already taken by another owner; npm publish credential (owner) -- disclosed by spec; Reachable axis-api + valid AXIS_API_KEY for status to show real plan/usage -- disclosed by spec

## Current state
DocsPage `CliSection` (apps/web/src/pages/DocsPage.tsx:1069-1156) documents `npm install -g axis-iliad`, `npx axis-iliad --help`, and subcommands `analyze <path>`, `export <path>` (incl. `--format zip -o file.zip`), `list-programs`, `auth --key axis_...`, `status`, `github <url>`, with flags `--programs`/`-p`, `--output`/`-o`. No installable `axis-iliad` exists. Three artifacts diverge: (1) packaging/manifests/npm-package.json:2 is named `axis-iliad` v1.0.0 but has NO `bin` and ships nothing runnable; (2) apps/cli (package.json:2,4,6) is `@axis/cli`, `"private": true`, bin `axis` -- a fully-offline generator CLI (dispatch cli.ts:158-183; pipeline runner.ts:21 via listAvailableGenerators/generateFiles; writer.ts:14 writeGeneratedFiles; creds credential-store.ts loadConfig/saveConfig). Its real commands are analyze|github|programs|auth login|auth status|help|version; `export`/account-`status`/`list-programs` do NOT exist; `-v`=version (cli.ts:52) not verbose; auth is `login <positional axis_*>` (cli.ts:127) not `--key`; flag is `--program` (singular, repeatable) not `--programs`/`-p`; no `-o`. (3) packages/iliad-md is a separate real, non-private, publishable zero-dep CLI (bin `iliad`, commands generate/check/github) that emits only agent config files. apps/cli depends on four `workspace:*` private packages (@axis/snapshots, @axis/repo-parser, @axis/context-engine, @axis/generator-core), so it is not publishable to the public registry as-is. A live `GET /v1/account` endpoint exists (agent-discovery.test.ts:303) that `status` can call.

## Target state (== the claim is literally true)
apps/cli is republished AS `axis-iliad` with a self-contained bundle and a command surface matching DocsPage exactly, so `npm install -g axis-iliad` + `npx axis-iliad analyze|export|github|list-programs|status|auth --key` become literally real. Concretely: package renamed to `axis-iliad`, `private` removed, bin `axis-iliad` (keep `axis` alias), add `files`+`publishConfig.access:"public"`+`prepublishOnly`; the four workspace deps bundled into a self-contained `dist/` (no `workspace:*` at runtime); new subcommands `export` (dir + `--format zip`), `list-programs` (alias of the existing programs printer, now labelled tier+category), account `status` (calls live `GET /v1/account`, degrades honestly offline), plus `--programs a,b,c`/`-p`, `-o`, and `auth --key <key>`. The one doc/impl conflict that can't both hold (docs line 1142 uses `-v` for "verbose logging" but `-v`=version) is reconciled by editing the doc example to `--verbose` and adding a real `--verbose` flag. packaging/manifests/npm-package.json is deleted or repointed so only one thing is named `axis-iliad`. DONE for the buildable portion = `npm pack` + local `npm i -g ./axis-iliad-1.0.0.tgz` yields a working `axis-iliad` binary exercising every documented subcommand from a self-contained dist. Residual external gates: the actual public `npm publish` (owner npm credential) and a reachable axis-api + valid key for `status` to show REAL plan/usage. TIER RATIONALE: B not A because (a) the install/`npx` lines are only true after a public publish (registry credential the code can't supply; buildable-now proxy is `npm pack` + local global install) and (b) `status`'s "plan, usage, API health" is only real against the live API with a key -- everything else is pure software buildable now.

## Files to create / edit
- apps/cli/package.json
- apps/cli/src/cli.ts
- apps/cli/src/zip.ts
- apps/cli/src/status.ts
- apps/cli/src/writer.ts
- apps/cli/bin/axis.js
- apps/cli/build.mjs
- apps/cli/src/cli-export.test.ts
- apps/cli/src/cli-status.test.ts
- apps/cli/README.md
- apps/web/src/pages/DocsPage.tsx
- packaging/manifests/npm-package.json

## Interfaces
```ts
// apps/cli/src/cli.ts -- extend CliArgs + dispatch (currently cli.ts:11-17, 158-183)
type Command = "analyze" | "export" | "github" | "list-programs" | "status" | "auth" | "help" | "version";
interface CliArgs {
  command: Command | string;
  target: string;            // path | url | auth subcommand
  output: string;            // -o/--output; default ".ai-output" (analyze) / "output" (export dir)
  programs: string[];        // --programs a,b,c (split ",") merged with repeated --program; -p alias
  format: "dir" | "zip";     // --format; default "dir" (export only)
  apiKey?: string;           // auth --key <axis_...>
  quiet: boolean;            // --quiet
  verbose: boolean;          // --verbose (docs example switches from -v to --verbose)
}
export function main(): void;
async function runExport(args: CliArgs): Promise<void>;   // run() pipeline -> writeGeneratedFiles OR buildZip
async function runStatus(args: CliArgs): Promise<void>;   // loadConfig() -> fetchAccountStatus -> print

// apps/cli/src/zip.ts -- zero runtime dep, STORE method (mirrors apps/api/src/export.ts ZipEntry approach)
export interface ZipInput { path: string; content: string; }
export function buildZip(entries: ZipInput[]): Buffer;    // local file headers + CRC32 + central directory, method=0

// apps/cli/src/writer.ts -- add alongside existing writeGeneratedFiles (writer.ts:14)
export function writeZip(files: { path: string; content: string }[], zipPath: string): { entries: number; bytes: number };

// apps/cli/src/status.ts -- uses global fetch (Node 20+, zero dep)
export interface AccountStatus {
  reachable: boolean;
  authenticated: boolean;
  plan?: string;
  usage?: { calls?: number; period?: string };
  api_url: string;
  error?: string;
}
export async function fetchAccountStatus(apiUrl: string, apiKey?: string): Promise<AccountStatus>;
// GET `${apiUrl}/v1/account`, header Authorization: `Bearer ${apiKey}`, AbortSignal.timeout(3000);
// never throws -- network/timeout/401 -> { reachable, authenticated:false, error } so `status` exits 0 honestly.

// apps/cli/package.json (target shape)
// { "name":"axis-iliad", "version":"1.0.0", "type":"module",
//   "bin": { "axis-iliad":"./bin/axis.js", "axis":"./bin/axis.js" },
//   "files": ["dist","bin","README.md"], "publishConfig": { "access":"public" },
//   "scripts": { "build":"node build.mjs", "prepublishOnly":"node build.mjs" } }
// build.mjs bundles src/cli.ts + all @axis/* workspace deps into dist/cli.js (self-contained, platform=node, format=esm).
// NEW DEP FLAG: build.mjs needs esbuild (or tsup) as a build-time devDependency -- requires owner sign-off per CLAUDE.md; runtime deps stay zero.
```

## Acceptance tests (DONE == claim true)
- apps/cli/package.json: name === "axis-iliad", no "private":true, bin["axis-iliad"] === "./bin/axis.js", files includes "dist" and "bin", publishConfig.access === "public".
- In a clean temp dir: `npm pack` in apps/cli emits axis-iliad-1.0.0.tgz; `npm i -g ./axis-iliad-1.0.0.tgz` then `axis-iliad --help` exits 0 and lists analyze, export, github, list-programs, status, auth.
- Self-contained bundle: after `node build.mjs`, `grep -R "workspace:\*" dist` finds nothing and `node dist/cli.js --help` runs with apps/cli/node_modules absent (exit 0).
- `axis-iliad analyze <fixture> --programs search,skills,debug -o <out> --quiet` exits 0 and writes >=1 file under <out>; a second identical run produces byte-identical output (determinism.test.ts still green).
- `axis-iliad export <fixture> --format zip -o <out>/pkg.zip` exits 0; <out>/pkg.zip exists, begins with the 0x504B0304 local-header signature, contains the 0x504B0102 central-directory signature, and lists >=1 generated entry (verified via unzip -l or reading the central directory).
- `axis-iliad export <fixture> -o <out>` (no --format) writes the same file tree as analyze to <out> (dir mode).
- `axis-iliad list-programs` exits 0; the number of program lines equals the distinct programs from listAvailableGenerators() grouping, and each line carries a FREE/PRO tier label and a category.
- `axis-iliad auth --key axis_testkey123` persists the key (loadConfig().api_key === "axis_testkey123"); `axis-iliad status` with an unreachable/unset api_url prints an explicit not-configured/unreachable line and exits 0; against a stub server returning {plan,usage} at GET /v1/account, status prints the plan and usage (fetchAccountStatus returns reachable:true, authenticated:true).
- `axis-iliad github <url>` (using the existing github fetch test harness/mocks) writes >=1 file and exits 0.
- DocsPage.tsx: the verbose usage example uses `--verbose` (no `-v` meaning verbose); every subcommand named in the CliSection table (analyze, export, list-programs, auth, status, github) resolves to a real branch in cli.ts main() dispatch (asserted by a doc-vs-cli parity test).
- Existing suites pass unchanged: apps/cli/src/cli*.test.ts, runner.test.ts, credential-store.test.ts, determinism.test.ts; repo typecheck (tsc strict) is clean.
- packaging/manifests/npm-package.json is deleted or its name no longer collides with the published axis-iliad (no two publishable manifests share the name).

## External gates (code alone can't satisfy)
- npm registry publish credential (owner) -- required for `npm install -g axis-iliad` / `npx axis-iliad` to resolve from the public registry; until then only local-tarball install is provable.
- Reachable axis-api (https://axis-api-6c7z.onrender.com) + a valid AXIS_API_KEY -- required for `status` to display real plan/usage/health; offline it degrades to an honest not-configured/unreachable message.

## New runtime deps (project forbids w/o discussion)
- esbuild (or tsup) as a NEW build-time devDependency to bundle the four @axis/* workspace packages into a self-contained dist -- flagged per CLAUDE.md 'no deps without discussion'. Runtime deps stay zero (published dist is self-contained). Cheaper alternative to evaluate first: reuse the repo's existing vite/rollup toolchain, or publish the four @axis/* packages instead of bundling (larger blast radius; they are currently private).

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes DocsPage CliSection (apps/web/src/pages/DocsPage.tsx:1069-1156) literally true: `npm install -g axis-iliad`, `npx axis-iliad analyze|export|github|list-programs|status|auth --key`, and the `--programs`/`-p`, `--output`/`-o`, `--format zip` flags all resolve to real behavior. Requires editing one doc example (line 1142) from `-v` to `--verbose` to remove the only unresolvable flag conflict. RESIDUAL HONESTY CAVEAT that must remain until the gates clear: the install/`npx` lines are only true once the package is actually published to npm (owner credential), and `status` shows real plan/usage only against the live API with a valid key -- otherwise it must print an explicit offline/unauthenticated state, and the docs must not imply status works with no key/network. Do not claim 'published' until `npm publish` has run.
