# axis-iliad

Fully-offline CLI for Axis' Iliad: point it at any codebase and it generates
the full deterministic artifact set — `AGENTS.md`, `CLAUDE.md`, `.cursorrules`,
debug playbooks, design tokens, compliance kits, and 100+ more — with **zero
runtime dependencies** and **no network calls** (except the explicit `github`
and `status` commands).

> **Publish status:** this package is not on the public npm registry yet
> (publish is owner-gated). Until then, install it from a repo checkout —
> see below. Do not claim it is published until `npm publish` has run.

## Install

From the npm registry (once published):

```bash
npm install -g axis-iliad
axis-iliad --help          # `axis` is installed as an alias
```

From a repo checkout (works today):

```bash
pnpm install
pnpm --filter axis-iliad build   # bundles a self-contained dist/
npm install -g ./apps/cli
```

Or prove it with a local tarball:

```bash
cd apps/cli && node build.mjs && npm pack
npm install -g ./axis-iliad-1.0.0.tgz
```

## Commands

| Command | Description |
| --- | --- |
| `analyze <path>` | Scan a directory and generate artifacts (default command) |
| `export <path>` | Same pipeline, written as a file tree or ZIP (`--format zip`) |
| `github <url>` | Fetch a public GitHub repo and generate |
| `list-programs` | All 20 programs with FREE/PRO tier and category (`programs` is an alias) |
| `auth --key <api_key>` | Save an API key to `~/.axis/config.json` (`auth login <key>` still works) |
| `status` | API reachability, auth, plan, and usage — degrades honestly offline |
| `help`, `version` | The usual |

## Options

| Flag | Alias | Meaning |
| --- | --- | --- |
| `--output <path>` | `-o` | Output directory (analyze: `.ai-output`, export: `output`) or ZIP path |
| `--programs <a,b,c>` | `-p` | Comma-separated program filter (`--program <name>` repeatable form works too) |
| `--format <dir\|zip>` | `-f` | Export format; a `-o *.zip` path implies `zip` |
| `--api-key <key>` | | API key override for `status` (and saves via `auth`) |
| `--quiet` | | Suppress progress output |
| `--verbose` | | Per-file listing + timing (`-v` is **version**, not verbose) |

## Environment

| Variable | Meaning |
| --- | --- |
| `AXIS_API_KEY` | API key (used if `--api-key` not set) |
| `AXIS_API_URL` | Custom API server URL for `status` |
| `AXIS_OUTPUT_DIR` | Default output directory |
| `AXIS_VERBOSE` | `1` or `true` enables verbose mode |

## Examples

```bash
axis-iliad analyze . --programs search,skills,debug
axis-iliad export ./my-project --format zip -o my-project-output.zip
axis-iliad github https://github.com/user/repo --programs search
axis-iliad auth --key axis_your_key_here
axis-iliad status
```

Two runs over unchanged input produce **byte-identical** output (fixed
sentinel timestamps, content-derived snapshot identity) — safe to diff, cache,
and commit.

## Honesty notes

- `status` reports real plan/usage **only** against a reachable API with a
  valid key. Offline or unauthenticated it prints an explicit
  unreachable/not-configured line and still exits 0.
- The generated artifacts are deterministic; the quality report records that
  no LLM design verdict ran (the CLI is model-free).

## How the self-contained build works

`build.mjs` compiles this package and its `@axis/*` workspace deps with the
workspace TypeScript, then walks the real ESM module graph from `cli.js`
(TypeScript compiler API — no bundler dependency) and vendors every reachable
module into `dist/vendor/` with import specifiers rewritten to relative paths.
Imports of `@axis/snapshots` are redirected to a generated pg-free façade
(`dist/vendor/snapshots-lite.js`) so the Postgres data layer is never pulled
into the offline CLI. The build fails if any external package or unprovided
export is reached, and self-checks that every emitted import resolves inside
`dist/`. It must run inside the pnpm workspace (`prepublishOnly` does).
