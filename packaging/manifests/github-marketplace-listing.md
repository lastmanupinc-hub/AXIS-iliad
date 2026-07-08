# GitHub Marketplace Listing — Axis Iliad Compliance

**Status:** draft copy for the App listing (WO-G7). This file is submission content, not
executable config — the machine-readable source of truth for the App itself is
`.github/app-manifest.json`. Update both together if scope changes.

## Listing name

Axis Iliad Compliance

## Tagline (one line, shown in search results)

Automatic AP2/Visa agentic-commerce compliance grading on every push and pull request.

## Description

Axis Iliad Compliance watches your repository's `push` and `pull_request` events and posts an
"Axis Compliance: `<grade>`" Check Run on the head commit — no workflow file, no repository
secret, and no change to your CI required. Install it once; every commit after that gets graded
automatically.

The grade comes from the same AP2/TAP/UCP mandate codecs, SCA-exemption engine, and dispute
compliance logic that back Axis Iliad's CLI and MCP tools — not a keyword scan. It looks for real
signals of agentic-commerce readiness (payment integration, checkout/dispute handling, mandate
and network-tokenization patterns) in the files that changed, and reports where the repository
stands against an 8-check compliance rubric.

The Check Run is informational by default — it will not block a merge unless you configure a
required-status-check rule on it yourself in your repository's branch protection settings.

**Prefer not to install an App?** The same grading is available as a standalone [Axis Compliance
Check GitHub Action](../../.github/actions/compliance-check/action.yml) — add one step to your
own workflow, bring your own `AXIS_API_KEY`, no installation required. The App exists for
repositories that want the check running with zero configuration; the Action exists for everyone
else. Both call the same grading engine and produce the same Check Run shape.

## Why each permission is requested

A security-conscious installer should be able to see exactly what an App can touch before
granting it. Axis Iliad Compliance requests four permissions, all read-only except the one that
posts the result:

| Permission | Access | What it's used for |
|---|---|---|
| `checks` | write | Posts the "Axis Compliance: `<grade>`" Check Run. This is the only write permission requested. |
| `contents` | read | Reads the changed files on the commit/PR being graded — nothing is written back to your repository. |
| `metadata` | read | Baseline access GitHub requires of every App; used only to resolve repository/installation identity. |
| `pull_requests` | read | Resolves the PR's head commit so the Check Run attaches to the right SHA and shows up in the PR's Checks tab. |

The App never requests `contents: write`, never opens commits or PRs on its own, and never reads
anything outside the two events it subscribes to (`push`, `pull_request`).

## Plans

**Free** — grading and Check Runs on every push and pull request, no seat or repository limit at
launch. This is the only plan offered while the listing is new; see the note below on paid plans.

*A paid plan (higher-frequency grading, custom minimum-grade gating, organization-wide policy) is
planned but not yet submitted — GitHub requires 100 installs on the free plan before a paid plan
can be submitted for review. This section will be updated once that happens; nothing here should
be read as implying a paid tier is live today.*

## Installation

Install from this listing, choose the repositories to grant access to, and authorize. The first
Check Run appears on the next push or pull request — no further setup.

## Support

Issues, questions, or a permission you don't understand: open an issue on the source repository,
or contact **axis@trustfabric.ai**. We respond to installer security questions before anything
else in the queue.

## Screenshots

*Placeholder — attach at submission time:*
1. A passing "Axis Compliance: A" Check Run in a PR's Checks tab.
2. The Check Run's summary detail view (grade, checks-passed count, minimum-grade line).
3. The App's permission-request screen during install.
