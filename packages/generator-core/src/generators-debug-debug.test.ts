import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import type { SourceFile } from "./types.js";
import {
  analyzeFailureSurface,
  renderFailureSurface,
  renderFailureSurfaceChecklist,
  generateRootCauseChecklist,
} from "./generators-debug.js";

// ─── DEBUG sweep (Program 3 = Debug): 8 concrete bugs ───────────────────
// A deep-debug pass on the failure-surface scanner found it green-checking a
// side-effect swallow as cleanup, never reporting @ts-ignore, flagging code
// INSIDE strings + block comments, using host-locale sort, too narrow a catch
// window, disagreeing caps across the two artifacts, and over-counting hotspots.

const sf = (path: string, content: string): SourceFile => ({ path, content, size: content.length });
const byFile = (fs: ReturnType<typeof analyzeFailureSurface>) => Object.fromEntries(fs.map(x => [x.file, x]));

// ── Bug 1: side-effect verb dominates a co-located cleanup verb ──
describe("swallow classification — a side-effect verb wins over a cleanup verb", () => {
  it("chargeAndClose().catch(()=>{}) is SILENT (money loss), not ACCEPTABLE cleanup", () => {
    const f = analyzeFailureSurface([sf("src/pay.ts", "await chargeAndClose(card).catch(() => {});")]);
    expect(byFile(f)["src/pay.ts"].klass).toBe("SILENT");
  });
  it("a pure cleanup swallow is still ACCEPTABLE", () => {
    const f = analyzeFailureSurface([sf("src/c.ts", "await disconnect(sock).catch(() => {});")]);
    expect(byFile(f)["src/c.ts"].klass).toBe("ACCEPTABLE");
  });
});

// ── Bug 2: @ts-ignore / @ts-expect-error are reported (they live in comments) ──
describe("type-net holes — comment directives are flagged", () => {
  it("a `// @ts-expect-error` directive is surfaced as a TYPE_HOLE", () => {
    const f = analyzeFailureSurface([sf("src/t.ts", "// @ts-expect-error legacy shape\nconst x = load();")]);
    expect(f.some(x => x.category === "type-hole" && x.klass === "TYPE_HOLE")).toBe(true);
  });
});

// ── Bug 3: code inside a string literal is NOT a live finding ──
describe("string-literal awareness — code inside a string isn't flagged", () => {
  it("a generator that emits `console.log(...)` as a STRING is not flagged in itself", () => {
    const f = analyzeFailureSurface([sf("src/gen.ts", 'lines.push("  console.log(`[${m}]`);");')]);
    expect(f.filter(x => x.category === "unstructured-log")).toEqual([]);
  });
  it("a real console.log IS still flagged", () => {
    const f = analyzeFailureSurface([sf("src/real.ts", "console.log(user.id);")]);
    expect(f.some(x => x.category === "unstructured-log")).toBe(true);
  });
});

// ── Bug 4: block comment whose body has no leading `*` isn't scanned ──
describe("block-comment awareness — commented-out code isn't flagged", () => {
  it("a multi-line /* … */ block with un-starred body lines is skipped", () => {
    const f = analyzeFailureSurface([sf("src/b.ts", "/*\nconst cfg = loadConfig() as any;\n*/\nconst ok = 1;")]);
    expect(f.filter(x => x.category === "type-hole")).toEqual([]);
  });
});

// ── Bug 5: host-locale-independent (code-unit) ordering ──
describe("render ordering is code-unit (not localeCompare)", () => {
  it("orders 'rate-limiter.ts' before 'rateLimiter.ts' ('-' 0x2D < 'L' 0x4C)", () => {
    const f = analyzeFailureSurface([
      sf("src/rateLimiter.ts", "console.log(1);"),
      sf("src/rate-limiter.ts", "console.log(2);"),
    ]);
    const rows = renderFailureSurface(f).filter(l => l.includes("rate"));
    const dashIdx = rows.findIndex(l => l.includes("rate-limiter.ts"));
    const camelIdx = rows.findIndex(l => l.includes("rateLimiter.ts"));
    expect(dashIdx).toBeLessThan(camelIdx);
  });
});

// ── Bug 6: catch window reaches the enclosing try body ──
describe("empty-catch severity — a side-effect a few lines up still classifies SILENT", () => {
  it("finds chargeCard 2 lines above the } catch {}", () => {
    const src = "try {\n  const inv = await buildInvoice(order);\n  await chargeCard(inv);\n  finalize();\n} catch {}";
    const f = analyzeFailureSurface([sf("src/flow.ts", src)]);
    expect(byFile(f)["src/flow.ts"].klass).toBe("SILENT");
  });
});

// ── Bug 7: both artifacts share ONE truncation cap + honest overflow note ──
describe("failure-surface renderers agree on the cap", () => {
  const many = Array.from({ length: 62 }, (_, i) => ({
    file: `src/f${String(i).padStart(2, "0")}.ts`, line: 1,
    category: "unstructured-log" as const, klass: "OBSERVABILITY" as const, note: "n",
  }));
  it("playbook + checklist truncate at the same count", () => {
    const table = renderFailureSurface(many).join("\n");
    const check = renderFailureSurfaceChecklist(many).join("\n");
    const tMore = table.match(/\+(\d+) more/);
    const cMore = check.match(/\+(\d+) more/);
    expect(tMore?.[1]).toBe(cMore?.[1]); // same remainder
  });
  it("the checklist overflow note doesn't claim the playbook holds the rest", () => {
    expect(renderFailureSurfaceChecklist(many).join("\n")).not.toContain("see debug-playbook.md");
  });
});

// ── Bug 8: hotspot review question counts only what was listed ──
describe("root-cause checklist — hotspot count matches the rows shown", () => {
  it("says 10 (the number listed), not the full hotspots.length", () => {
    const hotspots = Array.from({ length: 20 }, (_, i) => ({
      path: `src/h${i}.ts`, risk_score: 0.5, inbound_count: 3, outbound_count: 3,
    }));
    const ctx = {
      version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
      project_identity: { name: "acme", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
      structure: { total_files: 10, total_directories: 3, total_loc: 1000, file_tree_summary: [], top_level_layout: [] },
      detection: { languages: [], frameworks: [], build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null },
      dependency_graph: { external_dependencies: [], internal_imports: [], hotspots },
      entry_points: [], routes: [], domain_models: [], sql_schema: [],
      architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
      ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
    } as unknown as ContextMap;
    const out = generateRootCauseChecklist(ctx).content;
    expect(out).toContain("10 coupled hotspot files");
    expect(out).not.toContain("20 coupled hotspot files");
  });
});
