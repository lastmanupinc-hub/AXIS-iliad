# Socket — `mcp` as a standalone product

**Landing page:** `socket.trustfabric.ai`
**Verdict:** Sellable now (Tier A)
**Ships:** 19 generated files

---

## The problem it closes

Exposing a codebase to agents means hand-writing MCP server config, tool schemas, auth wiring and registry metadata — then maintaining all of it as the code changes. Most teams never start.

The largest program we have (19 generators). Emits mcp-config.json, protocol-spec.md, registry metadata and the surrounding scaffolding, derived from the actual API surface.

## What ships today

Verified against the live generator registry (`listAvailableGenerators()`), not from documentation:

- `capability-registry.json`
- `connector-map.yaml`
- `mcp-config.json`
- `mcp-registry-metadata.json`
- `mcp/README.md`
- `mcp/build-artifacts.md`
- `mcp/core-implementation-artifacts.md`
- `mcp/fintech-domain-schema.yaml`
- `mcp/fintech-mcp-surface-package.md`
- `mcp/monorepo-structure.md`
- `mcp/package-json.package.template.json`
- `mcp/package-json.root.template.json`
- `mcp/project-setup.md`
- `mcp/testing-documentation-polish-artifacts.md`
- `mcp/tsconfig.package.template.json`
- `mcp/tsconfig.root.template.json`
- `protocol-spec.md`
- `server-manifest.yaml`
- `spec.types.ts`

## Standalone verdict

Strongest standalone candidate by output volume and by market timing. 11 of 19 outputs are machine-consumable config, not prose.

## Gap before this can be sold alone

We generate config but do not host or verify the resulting server. A buyer still has to deploy it themselves. The obvious v2 is hosted MCP endpoints — which is a different, larger product.

## Pricing thesis

$29/mo. Justified by the maintenance burden it removes, not the one-time generation.

## Relationship to the Iliad hub

Iliad stays the hub: one call, every program, for buyers who want the whole read.
Socket is the same generators sold to a buyer who has one problem and does not
want the other nineteen. The hub keeps bundle economics; the spoke gets a landing
page, a price and a name someone can search for.

Nothing here forks the generators. A spoke that drifts from the hub's output is a
bug, not a product decision.
