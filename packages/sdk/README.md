# @axis/sdk

Typed TypeScript client for the [Axis' Iliad](https://iliad.trustfabric.ai) API — turn any
codebase into AGENTS.md, CLAUDE.md, MCP configs, and 140+ other structured AI-agent
artifacts with one API call.

## Install

```bash
npm install @axis/sdk
```

## Usage

```ts
import { AxisClient } from "@axis/sdk";

const axis = new AxisClient({ apiKey: "axis_..." });

// Analyze a set of files directly
const snap = await axis.analyzeFiles({
  project_name: "my-project",
  project_type: "web-app",
  frameworks: ["react", "express"],
  goals: ["onboard AI coding agents faster"],
  files: [{ path: "package.json", content: "..." }],
});

// Or analyze a public GitHub repo by URL
const snap2 = await axis.analyzeRepo({ github_url: "https://github.com/you/your-repo" });

// Fetch a generated artifact
const agentsMd = await axis.getArtifact(snap.snapshot_id, "AGENTS.md");
```

No API key is required for discovery calls:

```ts
const axis = new AxisClient();
await axis.listPrograms();
await axis.searchTools("SEO rules generator");
await axis.discoverCommerceTools();
```

## API

- `health()` / `healthLive()` / `healthReady()` — service health checks.
- `analyzeFiles(input)` — analyze an explicit file list, returns a `SnapshotResult`.
- `analyzeRepo(input)` — analyze a public GitHub repo by URL.
- `getSnapshot(snapshotId)` — fetch a previous analysis snapshot.
- `getArtifact(snapshotId, path)` — fetch one generated artifact's contents.
- `listPrograms()` / `searchTools(query?)` / `discoverCommerceTools()` — free, no-auth discovery.
- `docs()` — the live OpenAPI spec.
- `probeIntent(description, focusAreas?)` — describe a need in plain language and get back
  matching tools/programs.

All authenticated calls take a Bearer `apiKey` (`axis_...`) passed to the `AxisClient`
constructor. See [iliad.trustfabric.ai](https://iliad.trustfabric.ai) to get a key.

## License

MIT
