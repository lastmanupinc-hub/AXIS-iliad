import type { ContextMap } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { findEntryPoints, renderExcerpts } from "./file-excerpt-utils.js";
import { hasFw, getFw } from "./fw-helpers.js";

export function generateDebugPlaybook(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const ai = ctx.ai_context;
  const lines: string[] = [];

  lines.push(`# Debug Playbook — ${id.name}`);
  lines.push("");
  lines.push(`> Structured debugging guide for a ${id.type.replace(/_/g, " ")} built with ${id.primary_language}`);
  if (id.description) { lines.push(""); lines.push(`> ${id.description}`); }
  lines.push("");

  // ─── Project Overview ──────────────────────────────────
  lines.push("## Project Overview");
  lines.push("");
  lines.push(ai.project_summary);
  lines.push("");

  // Quick Reference — enriched with versions, deploy target, Go module
  lines.push("## Quick Reference");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("|------|-------|");
  lines.push(`| Language | ${id.primary_language} |`);
  const fwList = ctx.detection.frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""} (${(f.confidence * 100).toFixed(0)}%)`).join(", ");
  lines.push(`| Frameworks | ${fwList || "none"} |`);
  lines.push(`| Test Runner | ${ctx.detection.test_frameworks.join(", ") || "none"} |`);
  lines.push(`| Build Tools | ${ctx.detection.build_tools.join(", ") || "none"} |`);
  lines.push(`| CI | ${ctx.detection.ci_platform ?? "none"} |`);
  lines.push(`| Deploy Target | ${ctx.detection.deployment_target ?? "none"} |`);
  const pm = ctx.detection.package_managers[0] ?? "npm";
  lines.push(`| Package Manager | ${pm} |`);
  lines.push(`| Files | ${ctx.structure.total_files} files, ${ctx.structure.total_loc.toLocaleString()} LOC |`);
  if (id.go_module) lines.push(`| Go Module | ${id.go_module} |`);
  lines.push(`| Separation Score | ${ctx.architecture_signals.separation_score}/1.0 |`);
  lines.push("");

  // ─── Language Distribution ─────────────────────────────
  if (ctx.detection.languages.length > 0) {
    lines.push("## Language Distribution");
    lines.push("");
    lines.push("| Language | Files | LOC | % |");
    lines.push("|----------|-------|-----|---|");
    for (const lang of ctx.detection.languages.slice(0, 10)) {
      lines.push(`| ${lang.name} | ${lang.file_count} | ${lang.loc.toLocaleString()} | ${lang.loc_percent}% |`);
    }
    lines.push("");
  }

  // ─── Framework Evidence ────────────────────────────────
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack (with evidence)");
    lines.push("");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`### ${fw.name}${fw.version ? ` v${fw.version}` : ""} — ${(fw.confidence * 100).toFixed(0)}% confidence`);
      lines.push("");
      for (const e of fw.evidence ?? []) {
        lines.push(`- ${e}`);
      }
      lines.push("");
    }
  }

  // ─── Key Abstractions ──────────────────────────────────
  if (ai.key_abstractions.length > 0) {
    lines.push("## Project Structure");
    lines.push("");
    for (const a of ai.key_abstractions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // ─── Triage Steps ─────────────────────────────────────
  lines.push("## Triage Steps");
  lines.push("");
  lines.push("### 1. Reproduce");
  lines.push("");
  lines.push("```bash");
  if (id.go_module) {
    lines.push("go build ./...");
    lines.push("go test ./...");
    lines.push("go run ./cmd/api");
  } else {
    lines.push(`${pm} install`);
    if (ctx.detection.test_frameworks.length > 0) {
      lines.push(`${pm} test           # run existing tests (${ctx.detection.test_frameworks.join(", ")})`);
    }
    lines.push(`${pm} run dev         # start dev server`);
  }
  if (hasFw(ctx, "Prisma")) {
    lines.push(`${pm === "pnpm" ? "pnpm exec" : "npx"} prisma migrate dev   # sync database`);
  }
  lines.push("```");
  lines.push("");

  lines.push("### 2. Isolate");
  lines.push("");
  lines.push("Check these files first based on the dependency graph:");
  lines.push("");

  for (const ep of ctx.entry_points.slice(0, 8)) {
    lines.push(`- \`${ep.path}\` — ${ep.description}`);
  }
  lines.push("");

  // Hotspots
  if (ctx.dependency_graph.hotspots.length > 0) {
    lines.push("### High-Risk Files (Dependency Hotspots)");
    lines.push("");
    lines.push("These files have many inbound or outbound imports — changes here cascade:");
    lines.push("");
    lines.push("| File | Inbound | Outbound | Risk |");
    lines.push("|------|---------|----------|------|");
    for (const h of ctx.dependency_graph.hotspots.slice(0, 10)) {
      lines.push(`| \`${h.path}\` | ${h.inbound_count} | ${h.outbound_count} | ${(h.risk_score * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  // ─── Framework-Specific Debugging ─────────────────────
  lines.push("### 3. Framework-Specific Debugging");
  lines.push("");

  if (hasFw(ctx, "Next.js", "next")) {
    const nextFw = getFw(ctx, "Next.js") ?? getFw(ctx, "next")!;
    lines.push(`#### Next.js ${nextFw.version ?? ""}`);
    lines.push("");
    lines.push("- **Build errors:** `next build` — check for missing exports or type errors");
    lines.push("- **Hydration mismatches:** Check Server vs Client component boundaries");
    lines.push("- **API route errors:** Check `app/api/` route handlers — ensure proper Response returns");
    lines.push("- **Data fetching:** Verify `fetch()` calls in Server Components aren't cached unexpectedly");
    lines.push("- **Middleware:** Check `middleware.ts` for request interception issues");
    lines.push("");
  }

  if (hasFw(ctx, "SvelteKit", "sveltekit")) {
    const skFw = getFw(ctx, "SvelteKit") ?? getFw(ctx, "sveltekit")!;
    lines.push(`#### SvelteKit ${skFw.version ?? ""}`);
    lines.push("");
    lines.push("- **Build errors:** `vite build` — check for SSR-incompatible imports");
    lines.push("- **Load functions:** Check `+page.ts` / `+page.server.ts` load() return types");
    lines.push("- **Form actions:** Verify `+page.server.ts` action handlers return correct responses");
    lines.push("- **Hooks:** Check `hooks.server.ts` for request interception issues");
    lines.push("- **SSR vs CSR:** Look for browser-only APIs (`window`, `document`) in server code");
    lines.push("- **Adapter issues:** Verify adapter config matches deployment target");
    lines.push("");
  }

  if (hasFw(ctx, "Svelte")) {
    const svFw = getFw(ctx, "Svelte")!;
    lines.push(`#### Svelte ${svFw.version ?? ""}`);
    lines.push("");
    lines.push("- **Reactivity bugs:** Ensure state mutations use `$state` (Svelte 5) or `$:` (Svelte 4)");
    lines.push("- **Component lifecycle:** Check `onMount`, `onDestroy` for cleanup issues");
    lines.push("- **Props:** Verify `$props()` types match parent component expectations");
    lines.push("- **Store subscriptions:** Check for unsubscribed stores causing memory leaks");
    lines.push("");
  }

  if (hasFw(ctx, "React", "react")) {
    lines.push("#### React");
    lines.push("");
    lines.push("- **State bugs:** Check for stale closures in `useEffect` and `useCallback`");
    lines.push("- **Re-render loops:** Add `React.StrictMode` (already on if using Next.js)");
    lines.push("- **Props drilling:** Check component hierarchy for unnecessary prop chains");
    lines.push("");
  }

  if (hasFw(ctx, "Prisma")) {
    lines.push("#### Prisma");
    lines.push("");
    lines.push("- **Migration issues:** `prisma migrate dev --name <name>`");
    lines.push("- **Query errors:** Enable `log: ['query']` in PrismaClient constructor");
    lines.push("- **Connection errors:** Check `DATABASE_URL` in `.env`");
    lines.push("- **Schema drift:** `prisma db pull` to check production schema matches");
    if (ctx.sql_schema.length > 0) {
      lines.push(`- **Tables in schema:** ${ctx.sql_schema.map(t => `\`${t.name}\` (${t.column_count} cols, ${t.foreign_key_count} FKs)`).join(", ")}`);
    }
    lines.push("");
  }

  // Go framework debugging
  if (hasFw(ctx, "Echo", "echo")) {
    const fw = getFw(ctx, "Echo") ?? getFw(ctx, "echo")!;
    lines.push(`#### Echo ${fw.version ?? ""} (Go HTTP)`);
    lines.push("");
    lines.push("- **Route 404:** Check group registration order — groups must be registered before routes");
    lines.push("- **Middleware:** Verify `e.Use()` ordering — auth before CORS before logging");
    lines.push("- **Context:** Don't pass `echo.Context` across goroutines — extract values first");
    lines.push("- **Binding errors:** Check `c.Bind()` struct tags match JSON/form field names");
    lines.push("- **Error handler:** Customize `e.HTTPErrorHandler` for structured error responses");
    lines.push("");
  }

  if (hasFw(ctx, "Chi", "chi")) {
    lines.push("#### Chi (Go Router)");
    lines.push("");
    lines.push("- **Route conflicts:** Chi matches first registered route — check ordering");
    lines.push("- **URL params:** Use `chi.URLParam(r, \"id\")` not `r.URL.Query().Get(\"id\")`");
    lines.push("- **Middleware stack:** `r.Use()` applies to all sub-routes — verify scope");
    lines.push("- **Subrouters:** Ensure `r.Mount(\"/api\", subRouter)` paths don't double-prefix");
    lines.push("");
  }

  if (hasFw(ctx, "Gin", "gin")) {
    lines.push("#### Gin (Go HTTP)");
    lines.push("");
    lines.push("- **Mode:** Set `gin.SetMode(gin.ReleaseMode)` in production to suppress debug logs");
    lines.push("- **Binding:** Use `ShouldBind` not `Bind` to avoid automatic 400 responses");
    lines.push("- **Context abort:** After `c.AbortWithStatusJSON()`, always `return`");
    lines.push("- **Groups:** Route groups share middleware — check auth scope on groups");
    lines.push("");
  }

  if (hasFw(ctx, "Express", "express", "Fastify", "fastify")) {
    lines.push("#### API Server");
    lines.push("");
    lines.push("- **Route 404:** Verify route registration order — catch-all routes must be last");
    lines.push("- **Middleware errors:** Check error-handling middleware order");
    lines.push("- **CORS:** Verify origin whitelist and preflight handling");
    lines.push("");
  }

  // Go stdlib
  if (id.go_module && !hasFw(ctx, "Echo", "echo", "Chi", "chi", "Gin", "gin", "Fiber", "fiber")) {
    lines.push("#### Go stdlib HTTP");
    lines.push("");
    lines.push("- **Handler panics:** Use `recover()` middleware to prevent server crashes");
    lines.push("- **Context cancellation:** Check `r.Context().Err()` for cancelled requests");
    lines.push("- **Goroutine leaks:** Ensure spawned goroutines have exit conditions");
    lines.push("- **Connection pooling:** Check `http.Transport.MaxIdleConnsPerHost` settings");
    lines.push("");
  }

  // ─── Domain Models ────────────────────────────────────
  if (ctx.domain_models.length > 0) {
    lines.push("## Domain Model Inventory");
    lines.push("");
    lines.push("Key entities — bugs often involve state transitions or relationship integrity:");
    lines.push("");
    lines.push("| Model | Kind | Language | Fields | Source |");
    lines.push("|-------|------|----------|--------|--------|");
    for (const m of ctx.domain_models) {
      lines.push(`| ${m.name} | ${m.kind} | ${m.language} | ${m.field_count} | \`${m.source_file}\` |`);
    }
    lines.push("");
  }

  // ─── SQL Schema Reference ─────────────────────────────
  if (ctx.sql_schema.length > 0) {
    lines.push("## Database Schema Reference");
    lines.push("");
    lines.push("| Table | Columns | Foreign Keys | Source |");
    lines.push("|-------|---------|--------------|--------|");
    for (const t of ctx.sql_schema) {
      lines.push(`| ${t.name} | ${t.column_count} | ${t.foreign_key_count} | \`${t.source_file}\` |`);
    }
    lines.push("");
    const totalFKs = ctx.sql_schema.reduce((s, t) => s + t.foreign_key_count, 0);
    if (totalFKs > 0) {
      lines.push(`> **${totalFKs} foreign keys** — check referential integrity when debugging data issues.`);
      lines.push("");
    }
  }

  // ─── Route Map ────────────────────────────────────────
  if (ctx.routes.length > 0) {
    lines.push("## Route Map");
    lines.push("");
    lines.push("| Method | Path | Source |");
    lines.push("|--------|------|--------|");
    for (const r of ctx.routes) {
      lines.push(`| ${r.method} | \`${r.path}\` | ${r.source_file} |`);
    }
    lines.push("");
  }

  // ─── Architecture Boundaries ──────────────────────────
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("## Architecture Layer Boundaries");
    lines.push("");
    const score = ctx.architecture_signals.separation_score;
    if (score < 0.5) {
      lines.push(`> ⚠️ **Low separation score (${score})** — layers are tightly coupled. Cross-layer bugs are highly likely.`);
    } else if (score < 0.7) {
      lines.push(`> ⚡ **Moderate separation (${score})** — some coupling exists between layers.`);
    } else {
      lines.push(`> ✅ **Good separation (${score})** — layers are well-isolated.`);
    }
    lines.push("");
    lines.push("Bugs often occur at layer boundaries. Verify data flow between:");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      lines.push(`- **${l.layer}**: ${l.directories.join(", ")}`);
    }
    lines.push("");
    if (ctx.architecture_signals.patterns_detected.length > 0) {
      lines.push(`**Architecture patterns:** ${ctx.architecture_signals.patterns_detected.join(", ")}`);
      lines.push("");
    }
  }

  // ─── Deployment-Specific Debugging ────────────────────
  if (ctx.detection.deployment_target) {
    lines.push("## Deployment Debugging");
    lines.push("");
    const target = ctx.detection.deployment_target;
    if (target.includes("docker") || target.includes("container")) {
      lines.push("- **Container crashes:** Check `docker logs <container>` for OOM kills or startup failures");
      lines.push("- **Network issues:** Verify container port mapping and inter-service DNS resolution");
      lines.push("- **Volume mounts:** Ensure persistent data paths match Dockerfile WORKDIR");
      lines.push("- **Build caching:** Clear Docker cache with `docker builder prune` if stale layers suspected");
    }
    if (target.includes("vercel") || target.includes("netlify")) {
      lines.push("- **Build logs:** Check deployment platform build output for missing env vars");
      lines.push("- **Edge functions:** Verify runtime compatibility (no Node.js-only APIs in edge)");
      lines.push("- **Cache invalidation:** Purge CDN cache if stale content is served");
    }
    if (target.includes("lambda") || target.includes("serverless")) {
      lines.push("- **Cold starts:** Check timeout settings — Lambda default is 3s, may need 15-30s");
      lines.push("- **Memory limits:** Increase memory allocation if OOM errors occur");
      lines.push("- **Connection pooling:** Reuse DB connections across invocations (module-level init)");
    }
    lines.push("");
  }

  // ─── Common Traps ─────────────────────────────────────
  lines.push("## Common Traps");
  lines.push("");
  for (const w of ai.warnings) {
    lines.push(`- ⚠️ ${w}`);
  }
  for (const c of ai.conventions) {
    lines.push(`- ✅ ${c}`);
  }
  const hasLinter = ai.conventions.some(c => /linter/i.test(c));
  const hasFormatter = ai.conventions.some(c => /formatter/i.test(c));
  if (!hasLinter) lines.push("- ⚠️ No linter configured");
  if (!hasFormatter) lines.push("- ⚠️ No formatter configured");
  if (ai.warnings.length === 0 && hasLinter && hasFormatter) {
    lines.push("- No critical warnings detected — project health looks good");
  }
  lines.push("");

  // ─── External Dependencies ────────────────────────────
  const prodDeps = ctx.dependency_graph.external_dependencies.filter(d => d.type === "production");
  if (prodDeps.length > 0) {
    lines.push("## Production Dependencies");
    lines.push("");
    lines.push(`${prodDeps.length} production dependencies. Key packages:`);
    lines.push("");
    for (const d of prodDeps.slice(0, 20)) {
      lines.push(`- \`${d.name}\`${d.version ? ` @ ${d.version}` : ""}`);
    }
    if (prodDeps.length > 20) lines.push(`- ... and ${prodDeps.length - 20} more`);
    lines.push("");
  }

  // ─── Source File Excerpts ─────────────────────────────
  if (files && files.length > 0) {
    const entries = findEntryPoints(files);
    lines.push(...renderExcerpts("Entry Point Source (for tracing)", entries.slice(0, 3), 25));
  }

  lines.push("---");
  lines.push("*Generated by Axis Debug*");
  lines.push("");

  return {
    path: ".ai/debug-playbook.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "debug",
    description: "Structured debugging playbook with framework-specific steps, hotspots, and common traps",
  };
}

export function generateIncidentTemplate(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Incident Report — ${id.name}`);
  lines.push("");

  // Environment table
  lines.push("## Environment");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("|------|-------|");
  lines.push(`| Project | ${id.name} (${id.type.replace(/_/g, " ")}) |`);
  lines.push(`| Language | ${id.primary_language} |`);
  const fwStr = ctx.detection.frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""}`).join(", ");
  lines.push(`| Stack | ${fwStr || "none"} |`);
  if (ctx.detection.ci_platform) lines.push(`| CI | ${ctx.detection.ci_platform} |`);
  if (ctx.detection.deployment_target) lines.push(`| Deployment | ${ctx.detection.deployment_target} |`);
  if (id.go_module) lines.push(`| Go Module | ${id.go_module} |`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("**Date:** YYYY-MM-DD");
  lines.push("**Severity:** P0 / P1 / P2 / P3");
  lines.push("**Status:** investigating / identified / resolved");
  lines.push("**Reporter:**");
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push("<!-- What happened? What was the expected behavior? -->");
  lines.push("");
  lines.push("## Reproduction Steps");
  lines.push("");
  lines.push("1. ");
  lines.push("2. ");
  lines.push("3. ");
  lines.push("");

  // Layer-aware impact assessment
  lines.push("## Impact");
  lines.push("");
  lines.push("- **Users affected:**");
  lines.push("- **Features affected:**");
  lines.push("- **Data impact:**");
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("");
    lines.push("### Affected Layers");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      lines.push(`- [ ] **${l.layer}** — ${l.directories.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("## Root Cause");
  lines.push("");
  lines.push("<!-- What went wrong? Which file/function? -->");
  lines.push("");

  if (ctx.dependency_graph.hotspots.length > 0) {
    lines.push("### Likely Suspect Files (by coupling risk)");
    lines.push("");
    for (const h of ctx.dependency_graph.hotspots.slice(0, 8)) {
      lines.push(`- [ ] \`${h.path}\` — ${h.inbound_count} inbound, ${h.outbound_count} outbound (risk ${(h.risk_score * 100).toFixed(0)}%)`);
    }
    lines.push("");
  }

  // Entry points as suspects
  if (ctx.entry_points.length > 0) {
    lines.push("### Entry Points to Trace");
    lines.push("");
    for (const ep of ctx.entry_points.slice(0, 6)) {
      lines.push(`- [ ] \`${ep.path}\` — ${ep.description}`);
    }
    lines.push("");
  }

  // Domain entities to check
  if (ctx.domain_models.length > 0) {
    lines.push("### Domain Entities to Check");
    lines.push("");
    for (const m of ctx.domain_models) {
      lines.push(`- [ ] \`${m.name}\` (${m.kind}, ${m.field_count} fields) — ${m.source_file}`);
    }
    lines.push("");
  }

  // SQL tables to verify
  if (ctx.sql_schema.length > 0) {
    lines.push("### Database Tables to Verify");
    lines.push("");
    for (const t of ctx.sql_schema) {
      lines.push(`- [ ] \`${t.name}\` — ${t.column_count} columns, ${t.foreign_key_count} FKs (${t.source_file})`);
    }
    lines.push("");
  }

  lines.push("## Fix");
  lines.push("");
  lines.push("- **Commit:**");
  lines.push("- **PR:**");
  lines.push("- **Test added:** yes / no");
  lines.push("");
  lines.push("## Timeline");
  lines.push("");
  lines.push("| Time | Event |");
  lines.push("|------|-------|");
  lines.push("| | Issue reported |");
  lines.push("| | Investigation started |");
  lines.push("| | Root cause identified |");
  lines.push("| | Fix deployed |");
  lines.push("| | Verified resolved |");
  lines.push("");
  lines.push("## Follow-up");
  lines.push("");
  lines.push("- [ ] Post-mortem completed");
  lines.push("- [ ] Monitoring added");
  lines.push("- [ ] Documentation updated");
  if (ctx.detection.test_frameworks.length > 0) {
    lines.push(`- [ ] Regression test added (${ctx.detection.test_frameworks.join(", ")})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("*Generated by Axis Debug*");
  lines.push("");

  return {
    path: "incident-template.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "debug",
    description: "Incident report template with project-aware suspect files and domain entities",
  };
}

export function generateTracingRules(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const lines: string[] = [];

  lines.push(`# Tracing Rules — ${id.name}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(`Define which code paths should be traced, logged, or monitored in this ${id.type.replace(/_/g, " ")} (${id.primary_language}).`);
  lines.push("");

  // Stack context
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Stack");
    lines.push("");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`- ${fw.name}${fw.version ? ` ${fw.version}` : ""} (${(fw.confidence * 100).toFixed(0)}%)`);
    }
    lines.push("");
  }

  // Entry points to trace
  lines.push("## Trace Points");
  lines.push("");

  if (ctx.routes.length > 0) {
    lines.push("### API Routes");
    lines.push("");
    lines.push("All API routes should log: request method, path, status code, duration (ms).");
    lines.push("");
    lines.push("| Method | Path | Source | Trace Priority |");
    lines.push("|--------|------|--------|----------------|");
    for (const r of ctx.routes) {
      const priority = r.path.includes("auth") || r.path.includes("login") || r.path.includes("payment") ? "HIGH" : "NORMAL";
      lines.push(`| ${r.method} | \`${r.path}\` | ${r.source_file} | ${priority} |`);
    }
    lines.push("");
  }

  if (ctx.entry_points.length > 0) {
    lines.push("### Entry Points");
    lines.push("");
    for (const ep of ctx.entry_points) {
      lines.push(`- \`${ep.path}\` (${ep.type}) — ${ep.description}`);
    }
    lines.push("");
  }

  // Framework-specific tracing
  if (hasFw(ctx, "Prisma")) {
    lines.push("### Database Queries (Prisma)");
    lines.push("");
    lines.push("Enable Prisma query logging in development:");
    lines.push("");
    lines.push("```typescript");
    lines.push("const prisma = new PrismaClient({");
    lines.push("  log: [");
    lines.push("    { level: 'query', emit: 'event' },");
    lines.push("    { level: 'warn', emit: 'stdout' },");
    lines.push("    { level: 'error', emit: 'stdout' },");
    lines.push("  ],");
    lines.push("});");
    lines.push("```");
    lines.push("");
  }

  // Go-specific tracing
  if (hasFw(ctx, "Echo", "echo")) {
    lines.push("### Echo Middleware Tracing (Go)");
    lines.push("");
    lines.push("```go");
    lines.push("e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{");
    lines.push('  LogURI:      true,');
    lines.push('  LogStatus:   true,');
    lines.push('  LogLatency:  true,');
    lines.push('  LogMethod:   true,');
    lines.push("  LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {");
    lines.push('    log.Printf("[%s] %s %d %v", v.Method, v.URI, v.Status, v.Latency)');
    lines.push("    return nil");
    lines.push("  },");
    lines.push("}))");
    lines.push("```");
    lines.push("");
  }

  if (hasFw(ctx, "Chi", "chi")) {
    lines.push("### Chi Middleware Tracing (Go)");
    lines.push("");
    lines.push("```go");
    lines.push("r.Use(middleware.Logger)    // structured request logging");
    lines.push("r.Use(middleware.Recoverer) // panic recovery with stack trace");
    lines.push("r.Use(middleware.RequestID) // X-Request-Id for trace correlation");
    lines.push("```");
    lines.push("");
  }

  if (hasFw(ctx, "SvelteKit", "sveltekit")) {
    lines.push("### SvelteKit Hooks Tracing");
    lines.push("");
    lines.push("Add request tracing in `hooks.server.ts`:");
    lines.push("");
    lines.push("```typescript");
    lines.push("export const handle: Handle = async ({ event, resolve }) => {");
    lines.push("  const start = Date.now();");
    lines.push("  const response = await resolve(event);");
    lines.push("  const duration = Date.now() - start;");
    lines.push("  console.log(`[${event.request.method}] ${event.url.pathname} ${response.status} ${duration}ms`);");
    lines.push("  return response;");
    lines.push("};");
    lines.push("```");
    lines.push("");
  }

  // SQL table integrity
  if (ctx.sql_schema.length > 0) {
    lines.push("### Database Table Monitoring");
    lines.push("");
    lines.push("Log queries affecting these tables, especially writes:");
    lines.push("");
    for (const t of ctx.sql_schema) {
      const fkNote = t.foreign_key_count > 0 ? ` — ${t.foreign_key_count} FK constraints, check cascades` : "";
      lines.push(`- \`${t.name}\` (${t.column_count} columns${fkNote})`);
    }
    lines.push("");
  }

  // Domain model watchlist
  if (ctx.domain_models.length > 0) {
    lines.push("### Domain Model Watch List");
    lines.push("");
    lines.push("State transitions on these entities should be logged:");
    lines.push("");
    for (const m of ctx.domain_models) {
      lines.push(`- \`${m.name}\` (${m.kind}, ${m.field_count} fields) — \`${m.source_file}\``);
    }
    lines.push("");
  }

  // Hotspot monitoring
  if (ctx.dependency_graph.hotspots.length > 0) {
    lines.push("### Hotspot Monitoring");
    lines.push("");
    lines.push("These high-connectivity files should be monitored for regressions:");
    lines.push("");
    for (const h of ctx.dependency_graph.hotspots.slice(0, 8)) {
      lines.push(`- \`${h.path}\` — ${h.inbound_count} inbound, ${h.outbound_count} outbound — watch for: import changes, export signature changes`);
    }
    lines.push("");
  }

  // Layer boundary monitoring
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("### Layer Boundary Rules");
    lines.push("");
    lines.push(`Separation score: **${ctx.architecture_signals.separation_score}**/1.0`);
    lines.push("");
    lines.push("Monitor for layer violations:");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      if (l.layer === "data") {
        lines.push(`- **${l.layer}** (${l.directories.join(", ")}): Only business_logic layer should import directly`);
      } else if (l.layer === "presentation") {
        lines.push(`- **${l.layer}** (${l.directories.join(", ")}): Should not import from data layer directly`);
      } else {
        lines.push(`- **${l.layer}** (${l.directories.join(", ")}): Standard import rules apply`);
      }
    }
    lines.push("");
  }

  lines.push("## Log Format");
  lines.push("");
  if (id.go_module) {
    lines.push("```");
    lines.push("[TIMESTAMP] [LEVEL] [request_id] [component] message key=value");
    lines.push("```");
    lines.push("");
    lines.push("Use structured logging (zerolog, zap, or slog).");
  } else {
    lines.push("```");
    lines.push("[TIMESTAMP] [LEVEL] [TRACE_ID] [COMPONENT] message");
    lines.push("```");
  }
  lines.push("");
  lines.push("## Retention");
  lines.push("");
  lines.push("- **Debug logs:** 7 days");
  lines.push("- **Info logs:** 30 days");
  lines.push("- **Error logs:** 90 days");
  lines.push("- **Audit logs:** 1 year");
  lines.push("");
  lines.push("---");
  lines.push("*Generated by Axis Debug*");
  lines.push("");

  return {
    path: "tracing-rules.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "debug",
    description: "Tracing and logging rules derived from project architecture, routes, and domain models",
  };
}

// ─── root-cause-checklist.md ────────────────────────────────────

export function generateRootCauseChecklist(ctx: ContextMap): GeneratedFile {
  const id = ctx.project_identity;
  const hotspots = ctx.dependency_graph.hotspots;
  const frameworks = ctx.detection.frameworks;
  const patterns = ctx.architecture_signals.patterns_detected;

  const lines: string[] = [];
  lines.push(`# Root Cause Checklist — ${id.name}`);
  lines.push("");
  lines.push(`> ${id.type.replace(/_/g, " ")} | ${id.primary_language} | ${ctx.structure.total_files} files | ${ctx.structure.total_loc.toLocaleString()} LOC`);
  lines.push("");

  // Stack summary
  if (frameworks.length > 0) {
    lines.push(`**Stack:** ${frameworks.map(f => `${f.name}${f.version ? ` ${f.version}` : ""}`).join(", ")}`);
    lines.push("");
  }

  lines.push("## Triage Workflow");
  lines.push("");
  lines.push("```");
  lines.push("1. Reproduce → 2. Isolate → 3. Trace → 4. Root Cause → 5. Fix → 6. Verify → 7. Prevent");
  lines.push("```");
  lines.push("");

  const pm = ctx.detection.package_managers[0] ?? "npm";

  lines.push("## Step 1: Reproduction");
  lines.push("");
  lines.push("- [ ] Can you reproduce the issue consistently?");
  lines.push("- [ ] What is the minimum input/state to trigger it?");
  lines.push("- [ ] Does it reproduce in all environments (dev, staging, prod)?");
  lines.push("- [ ] Is it timing-dependent (race condition, timeout)?");
  if (id.go_module) {
    lines.push("- [ ] `go test ./...` — do unit tests pass?");
    lines.push("- [ ] `go vet ./...` — any static analysis warnings?");
  } else if (ctx.detection.test_frameworks.length > 0) {
    lines.push(`- [ ] \`${pm} test\` — do existing tests pass? (${ctx.detection.test_frameworks.join(", ")})`);
  }
  lines.push("");

  lines.push("## Step 2: Isolation");
  lines.push("");
  if (ctx.architecture_signals.layer_boundaries.length > 0) {
    lines.push("Which layer does the error surface in?");
    lines.push("");
    for (const l of ctx.architecture_signals.layer_boundaries) {
      lines.push(`- [ ] **${l.layer}** — ${l.directories.join(", ")}`);
    }
    lines.push("");
  } else {
    lines.push("- [ ] Which layer does the error surface in? (UI / API / DB / External)");
  }
  if (patterns.length > 0) {
    lines.push(`- [ ] Which architectural pattern is involved? (Detected: ${patterns.join(", ")})`);
  }
  lines.push("- [ ] Can you remove middleware/plugins to narrow the source?");
  lines.push("- [ ] Does the issue persist with mocked dependencies?");
  if (ctx.entry_points.length > 0) {
    lines.push("");
    lines.push("### Entry points to trace through:");
    lines.push("");
    for (const ep of ctx.entry_points.slice(0, 6)) {
      lines.push(`- [ ] \`${ep.path}\` — ${ep.description}`);
    }
  }
  lines.push("");

  lines.push("## Step 3: Trace");
  lines.push("");
  for (const fw of frameworks) {
    const n = fw.name.toLowerCase();
    if (n === "next.js" || n === "next" || n === "react") {
      lines.push(`- [ ] Check React DevTools for component re-render loops (${fw.name} ${fw.version ?? ""} detected)`);
      lines.push("- [ ] Check Network tab for failed API calls");
      lines.push("- [ ] Check for hydration mismatches (SSR vs client)");
    }
    if (n === "sveltekit" || n === "svelte") {
      lines.push(`- [ ] Check browser DevTools Network tab (${fw.name} ${fw.version ?? ""} detected)`);
      lines.push("- [ ] Verify load() function data in $page.data");
      lines.push("- [ ] Check for SSR vs CSR discrepancies");
    }
    if (n === "express" || n === "fastify") {
      lines.push(`- [ ] Add request-level logging to ${fw.name} middleware`);
      lines.push("- [ ] Check error-handling middleware order");
    }
    if (n === "echo" || n === "chi" || n === "gin") {
      lines.push(`- [ ] Add request logging middleware (${fw.name} detected)`);
      lines.push("- [ ] Check goroutine stack traces: `runtime.Stack()` or `pprof`");
      lines.push("- [ ] Verify context propagation across goroutine boundaries");
    }
    if (n === "prisma") {
      lines.push("- [ ] Enable Prisma query logging (`log: ['query', 'error']`)");
      lines.push("- [ ] Check for N+1 queries in related models");
    }
  }
  if (id.go_module && !hasFw(ctx, "Echo", "echo", "Chi", "chi", "Gin", "gin")) {
    lines.push("- [ ] Check `go tool pprof` for CPU/memory profiling");
    lines.push("- [ ] Look for goroutine leaks with `runtime.NumGoroutine()`");
  }
  lines.push("- [ ] Add breakpoints in suspected code paths");
  lines.push("- [ ] Check for unhandled promise rejections / panics");
  lines.push("- [ ] Review recent git changes (`git log --oneline -20`)");
  lines.push("");

  lines.push("## Step 4: Root Cause Categories");
  lines.push("");
  lines.push("| Category | Check | Typical Fix |");
  lines.push("|----------|-------|-------------|");
  lines.push("| State mutation | Shared mutable state modified concurrently | Immutable updates, copy-on-write |");
  lines.push("| Race condition | Async operations with unguarded order | Mutex, semaphore, serial queue |");
  lines.push("| Type mismatch | Runtime type differs from expected | Input validation, zod/yup schema |");
  lines.push("| Null reference | Accessing property of undefined | Optional chaining, null guards |");
  lines.push("| Resource leak | Connections/handles not released | try/finally, disposal pattern |");
  lines.push("| Configuration | Wrong env var, missing secret | Environment diff, config validation |");
  lines.push("| Dependency | Breaking change in library update | Lock versions, review changelogs |");
  lines.push("| Data integrity | Corrupt/stale data in store | Migration, cache invalidation |");
  if (id.go_module) {
    lines.push("| Goroutine leak | Spawned goroutines never exit | Context cancellation, timeout |");
    lines.push("| Channel deadlock | Blocked send/receive on channel | Buffer sizing, select with default |");
  }
  lines.push("");

  // Domain model integrity
  if (ctx.domain_models.length > 0) {
    lines.push("### Domain Entity Integrity");
    lines.push("");
    lines.push("Check these entities for state corruption or relationship violations:");
    lines.push("");
    for (const m of ctx.domain_models) {
      lines.push(`- [ ] \`${m.name}\` (${m.kind}, ${m.field_count} fields) — \`${m.source_file}\``);
    }
    lines.push("");
  }

  // SQL FK integrity
  if (ctx.sql_schema.length > 0) {
    lines.push("### Database Table Integrity");
    lines.push("");
    for (const t of ctx.sql_schema) {
      const fkNote = t.foreign_key_count > 0 ? ` — **${t.foreign_key_count} FK constraints** (check cascade/restrict rules)` : "";
      lines.push(`- [ ] \`${t.name}\` (${t.column_count} columns${fkNote})`);
    }
    lines.push("");
  }

  lines.push("## Step 5: Suspect Files (by coupling)");
  lines.push("");
  if (hotspots.length > 0) {
    lines.push("High-coupling files are more likely to be involved in cross-cutting bugs:");
    lines.push("");
    lines.push("| File | Risk | Inbound | Outbound |");
    lines.push("|------|------|---------|----------|");
    for (const h of hotspots.slice(0, 10)) {
      lines.push(`| \`${h.path}\` | ${(h.risk_score * 100).toFixed(0)}% | ${h.inbound_count} | ${h.outbound_count} |`);
    }
  } else {
    lines.push("No high-coupling files detected.");
  }
  lines.push("");

  lines.push("## Step 6: Verification");
  lines.push("");
  lines.push("- [ ] Does the fix resolve the original reproduction case?");
  if (ctx.detection.test_frameworks.length > 0) {
    lines.push(`- [ ] Do all existing tests still pass? (\`${pm} test\`)`);
  } else if (id.go_module) {
    lines.push("- [ ] Do all existing tests still pass? (`go test ./...`)");
  }
  lines.push("- [ ] Is a new test added for this specific failure mode?");
  if (hotspots.length > 0) {
    lines.push(`- [ ] Has the fix been reviewed for side effects on ${hotspots.length} coupled hotspot files?`);
  }
  if (ctx.detection.ci_platform) {
    lines.push(`- [ ] Does CI pass? (${ctx.detection.ci_platform})`);
  }
  lines.push("");

  lines.push("## Step 7: Prevention");
  lines.push("");
  lines.push("- [ ] Add regression test");
  lines.push("- [ ] Add monitoring/alerting for this failure class");
  lines.push("- [ ] Update incident template if this is a new category");
  lines.push("- [ ] Document root cause in team knowledge base");
  if (!ctx.detection.ci_platform) {
    lines.push("- [ ] ⚠️ **No CI detected** — consider adding automated checks to catch regressions");
  }
  lines.push("");

  return {
    path: "root-cause-checklist.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "debug",
    description: "Systematic root cause analysis checklist with project-specific trace steps and entity integrity checks",
  };
}
