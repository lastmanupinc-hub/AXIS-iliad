# Context Freshness Action

A composite GitHub Action that checks whether a repo's agent-context files have
drifted from the codebase, and can open a pull request to refresh them.

Managed files (selected via the `targets` input):

| Target    | File                              |
| --------- | --------------------------------- |
| `agents`  | `AGENTS.md`                       |
| `claude`  | `CLAUDE.md`                       |
| `cursor`  | `.cursorrules`                    |
| `copilot` | `.github/copilot-instructions.md` |
| `gemini`  | `GEMINI.md`                       |

The action wraps the `iliad` CLI (npm package `iliad-md`): `iliad check` exits
non-zero when the generated files no longer match what the current codebase
would produce, and the default `iliad` command regenerates them. Generated files carry an
HTML-comment marker so the CLI never silently overwrites hand-written files
(use the CLI's `--force` flag locally if you want to adopt an existing file).

## Usage

```yaml
name: Context Freshness

on:
  pull_request:

jobs:
  context-freshness:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v5

      - name: Check agent-context freshness
        uses: lastmanupinc-hub/AXIS-iliad/.github/actions/context-freshness@main
        with:
          targets: "agents,claude,cursor,copilot,gemini"
          fail-on-drift: "true"
```

When drift is detected the job fails with instructions to run `npx iliad-md`
locally and commit the refreshed files.

### Auto-PR mode

Instead of failing, the action can regenerate the files and open a pull
request on branch `chore/refresh-agent-context` (via
`peter-evans/create-pull-request@v7`). This requires write permissions:

```yaml
name: Refresh agent context

on:
  schedule:
    - cron: "0 6 * * 1" # weekly, Monday 06:00 UTC
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v5

      - name: Refresh agent-context files
        uses: lastmanupinc-hub/AXIS-iliad/.github/actions/context-freshness@main
        with:
          auto-pr: "true"
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Note: PRs created with the default `GITHUB_TOKEN` do not trigger other
workflows (`on: pull_request`). Pass a PAT or GitHub App token as
`github-token` if you need CI to run on the refresh PR.

## Inputs

| Input           | Default                               | Description                                                                                                            |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `targets`       | `agents,claude,cursor,copilot,gemini` | Comma-separated list of context files to manage.                                                                       |
| `fail-on-drift` | `true`                                | Fail the job when drift is detected and `auto-pr` is disabled. Set to `false` for a warn-only check.                   |
| `auto-pr`       | `false`                               | Regenerate drifted files and open a PR on `chore/refresh-agent-context` instead of failing.                            |
| `package-spec`  | `iliad-md@latest`                     | How to invoke the CLI: an npm spec run via `npx --yes <spec>`, or `local` to run `node packages/iliad-md/dist/cli.js`. |
| `github-token`  | `${{ github.token }}`                 | Token used by the auto-PR step.                                                                                        |

## Outputs

| Output    | Description                                                   |
| --------- | ------------------------------------------------------------- |
| `drift`   | `true` when the context files drifted from the codebase.      |
| `summary` | Diff summary reported by `iliad check` (empty when fresh).    |

## Local / dogfood variant

When the `iliad-md` package lives inside the repo being checked (as it does
here, at `packages/iliad-md`), set `package-spec: "local"` and build the CLI
before running the action:

```yaml
      - name: Build iliad CLI
        run: pnpm --filter iliad-md build

      - name: Check agent-context freshness
        uses: ./.github/actions/context-freshness
        with:
          package-spec: "local"
          fail-on-drift: "false" # warn-only until the root artifacts stabilize
```

See `.github/workflows/context-freshness.yml` in this repo for the full
dogfood workflow.

## Behavior matrix

| Drift | `auto-pr` | `fail-on-drift` | Result                                          |
| ----- | --------- | --------------- | ----------------------------------------------- |
| no    | any       | any             | Pass.                                           |
| yes   | `true`    | any             | Regenerate files, open/update refresh PR, pass. |
| yes   | `false`   | `true`          | Fail with instructions to run `npx iliad-md`.   |
| yes   | `false`   | `false`         | Warn only, pass.                                |

A drift report is always written to the job's step summary.
