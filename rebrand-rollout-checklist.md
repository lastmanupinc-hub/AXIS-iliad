# Axis' Iliad Rebrand Rollout Checklist

> **[2026-07-26]** Point-in-time checklist -- open items below remain genuinely
> open, this is not a stale/completed record. Banner added for dating only.

## GitHub
- Repository should use `axis-iliad` as the canonical slug.
- Add repository description with the new name and positioning.
- Update social preview image and About links.
- Add redirect note in repository topics/tags (`axis-iliad`, `agentic-commerce`, `mcp`).

## Package and Registry
- Verify npm package naming strategy before publish (keep `@axis/*` scope unless intentionally changing).
- Confirm MCP registry listing uses `axis-iliad` key/name.
- Update any external package docs that still use legacy naming.

## Deployment and DNS
- Decide whether to keep existing hostnames for continuity or introduce branded domains.
- If introducing domains, add redirects from legacy URLs.
- Confirm health checks and well-known endpoints still resolve after any domain updates.

## Integrations
- Update installation snippets in external docs/blog posts.
- Validate Claude/Cursor/VS Code MCP examples use `axis-iliad` server key.
- Notify any downstream repos that copy AGENTS/CLAUDE templates.

## Announcement
- Publish a short naming statement using only the canonical brand.
- Include migration reassurance: no API break, same endpoint, same account keys.
- Add effective date and link to release/changelog.

## Post-Launch Verification
- Re-run smoke checks on `/`, `/v1/health`, `/v1/docs`, `/for-agents`, `/.well-known/axis.json`.
- Search public docs/site for legacy naming after deployment.
- Monitor error rates and support inbox for rename-related confusion.
