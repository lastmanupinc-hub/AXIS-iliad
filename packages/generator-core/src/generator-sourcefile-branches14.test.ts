import { describe, it, expect } from "vitest";
import { generateFiles } from "./generate.js";
import { buildContextMap, buildRepoProfile } from "@axis/context-engine";
import { deriveRemotionTheme } from "./generators-remotion.js";
import type { SnapshotRecord, FileEntry } from "@axis/snapshots";
import type { GeneratorInput } from "./types.js";

/* ─── Fixture Helpers ──────────────────────────────────────────── */

function snap(opts: { name?: string; files?: FileEntry[]; frameworks?: string[] } = {}): SnapshotRecord {
  const files = opts.files ?? [{ path: "index.ts", content: 'console.log("hi");', size: 18 }];
  return {
    snapshot_id: "snap-rem14-001",
    project_id: "proj-rem14-001",
    created_at: new Date().toISOString(),
    input_method: "repo_snapshot_upload",
    manifest: {
      project_name: opts.name ?? "rem14-test",
      project_type: "web_application",
      frameworks: opts.frameworks ?? [],
      goals: [],
      requested_outputs: [],
    },
    file_count: files.length,
    total_size_bytes: files.reduce((s, f) => s + f.size, 0),
    files,
    status: "ready",
    account_id: null,
  };
}

function input(s: SnapshotRecord, requested: string[]): GeneratorInput {
  return {
    context_map: buildContextMap(s),
    repo_profile: buildRepoProfile(s),
    requested_outputs: requested,
  };
}

function getFile(result: ReturnType<typeof generateFiles>, path: string) {
  return result.files.find(f => f.path === path);
}

function addFw(inp: GeneratorInput, name: string) {
  inp.context_map.detection.frameworks.push({ name, confidence: 0.95, version: null, evidence: [] });
}

function addLang(inp: GeneratorInput, name: string) {
  inp.context_map.project_identity.primary_language = name;
}

// ─── deriveRemotionTheme unit tests ─────────────────────────────

describe("deriveRemotionTheme", () => {
  it("returns indigo default when no frameworks and no recognised language", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [];
    ctx.project_identity.primary_language = "Unknown";
    const theme = deriveRemotionTheme(ctx);
    expect(theme.bg).toBe("#0f0f23");
    expect(theme.accent).toBe("#6366f1");
  });

  it("React → cyan accent #61dafb", () => {
    const s = snap({ frameworks: ["react"] });
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "React", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#61dafb");
    expect(theme.bg).toBe("#0d1117");
  });

  it("Vue → green accent #41b883", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "Vue", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#41b883");
  });

  it("Svelte → orange accent #ff3e00", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "Svelte", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#ff3e00");
  });

  it("Angular → red accent #dd0031", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "Angular", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#dd0031");
  });

  it("Next.js → black/white palette", () => {
    const s = snap({ frameworks: ["next"] });
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "Next.js", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.bg).toBe("#000000");
    expect(theme.fg).toBe("#ffffff");
  });

  it("FastAPI → teal accent #009688", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [{ name: "FastAPI", confidence: 0.9, version: null, evidence: [] }];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#009688");
  });

  it("Go language fallback → cyan accent #00add8", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.project_identity.primary_language = "Go";
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#00add8");
  });

  it("Python language fallback → yellow accent #ffd343", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.project_identity.primary_language = "Python";
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#ffd343");
  });

  it("TypeScript language fallback → blue accent #3178c6", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.project_identity.primary_language = "TypeScript";
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#3178c6");
  });

  it("theme has all four required keys", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    const theme = deriveRemotionTheme(ctx);
    expect(theme).toHaveProperty("bg");
    expect(theme).toHaveProperty("fg");
    expect(theme).toHaveProperty("accent");
    expect(theme).toHaveProperty("muted");
  });

  it("Svelte takes priority over React if both present", () => {
    const s = snap();
    const ctx = buildContextMap(s);
    ctx.detection.frameworks = [
      { name: "Svelte", confidence: 0.8, version: null, evidence: [] },
      { name: "React",  confidence: 0.6, version: null, evidence: [] },
    ];
    const theme = deriveRemotionTheme(ctx);
    expect(theme.accent).toBe("#ff3e00");
  });
});

// ─── remotion-script.ts — derived theme ─────────────────────────

describe("remotion-script.ts — framework-derived theme", () => {
  it("default (no frameworks, unknown language) uses indigo accent", () => {
    const s = snap();
    const inp = input(s, ["remotion-script.ts"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.project_identity.primary_language = "Unknown";
    const result = generateFiles(inp);
    const content = getFile(result, "remotion-script.ts")!.content;
    expect(content).toContain("#6366f1");
    expect(content).toContain("#0f0f23");
  });

  it("React project uses cyan accent", () => {
    const s = snap();
    const inp = input(s, ["remotion-script.ts"]);
    addFw(inp, "React");
    const result = generateFiles(inp);
    const content = getFile(result, "remotion-script.ts")!.content;
    expect(content).toContain("#61dafb");
    expect(content).not.toContain("#6366f1");
  });

  it("Vue project uses green accent", () => {
    const s = snap();
    const inp = input(s, ["remotion-script.ts"]);
    addFw(inp, "Vue");
    const result = generateFiles(inp);
    const content = getFile(result, "remotion-script.ts")!.content;
    expect(content).toContain("#41b883");
  });

  it("THEME object is present in script output", () => {
    const s = snap();
    const inp = input(s, ["remotion-script.ts"]);
    const result = generateFiles(inp);
    const content = getFile(result, "remotion-script.ts")!.content;
    expect(content).toContain("const THEME = {");
    expect(content).toContain("bg:");
    expect(content).toContain("accent:");
  });
});

// ─── render-config.json — derived theme ─────────────────────────

describe("render-config.json — framework-derived theme", () => {
  it("default theme uses indigo accent (no frameworks, unknown language)", () => {
    const s = snap();
    const inp = input(s, ["render-config.json"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.project_identity.primary_language = "Unknown";
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "render-config.json")!.content);
    expect(data.theme.accent).toBe("#6366f1");
    expect(data.theme.background).toBe("#0f0f23");
  });

  it("React project theme uses cyan accent", () => {
    const s = snap();
    const inp = input(s, ["render-config.json"]);
    addFw(inp, "React");
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "render-config.json")!.content);
    expect(data.theme.accent).toBe("#61dafb");
  });

  it("Vue project theme uses green accent", () => {
    const s = snap();
    const inp = input(s, ["render-config.json"]);
    addFw(inp, "Vue");
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "render-config.json")!.content);
    expect(data.theme.accent).toBe("#41b883");
  });

  it("theme block has background, foreground, accent, muted, fontFamily keys", () => {
    const s = snap();
    const inp = input(s, ["render-config.json"]);
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "render-config.json")!.content);
    expect(data.theme).toHaveProperty("background");
    expect(data.theme).toHaveProperty("foreground");
    expect(data.theme).toHaveProperty("accent");
    expect(data.theme).toHaveProperty("muted");
    expect(data.theme).toHaveProperty("fontFamily");
  });

  it("Svelte project theme uses orange accent", () => {
    const s = snap();
    const inp = input(s, ["render-config.json"]);
    addFw(inp, "Svelte");
    const result = generateFiles(inp);
    const data = JSON.parse(getFile(result, "render-config.json")!.content);
    expect(data.theme.accent).toBe("#ff3e00");
  });
});

// ─── asset-checklist.md — derived colors ────────────────────────

describe("asset-checklist.md — framework-derived colors", () => {
  it("default shows indigo accent in color list (no frameworks, unknown language)", () => {
    const s = snap();
    const inp = input(s, ["asset-checklist.md"]);
    inp.context_map.detection.frameworks = [];
    inp.context_map.project_identity.primary_language = "Unknown";
    const result = generateFiles(inp);
    const content = getFile(result, "asset-checklist.md")!.content;
    expect(content).toContain("#6366f1");
    expect(content).toContain("derived from detected stack");
  });

  it("React project shows cyan accent in color list", () => {
    const s = snap();
    const inp = input(s, ["asset-checklist.md"]);
    addFw(inp, "React");
    const result = generateFiles(inp);
    const content = getFile(result, "asset-checklist.md")!.content;
    expect(content).toContain("#61dafb");
    expect(content).not.toContain("#6366f1");
  });

  it("color entries marked [x] with 'derived from detected stack' label", () => {
    const s = snap();
    const inp = input(s, ["asset-checklist.md"]);
    const result = generateFiles(inp);
    const content = getFile(result, "asset-checklist.md")!.content;
    const lines = content.split("\n").filter(l => l.includes("derived from detected stack"));
    expect(lines.length).toBe(4); // bg, fg, accent, muted
  });
});

// ─── scene-plan.md — domain models scene ────────────────────────

// The composition renders exactly 4 scenes (deriveScenePlan). scene-plan
// describes those four and no longer invents a conditional "Scene 5: Domain
// Models" that contradicted its own "Total Scenes: 4" summary and the video.
describe("scene-plan.md — canonical 4-scene breakdown (no phantom Domain Models scene)", () => {
  it("never adds a Domain Models scene, even when models exist", () => {
    const s = snap();
    const inp = input(s, ["scene-plan.md"]);
    inp.context_map.domain_models = [
      { name: "User",  kind: "interface", language: "TypeScript", field_count: 6, source_file: "src/user.ts" },
      { name: "Order", kind: "class",     language: "TypeScript", field_count: 9, source_file: "src/order.ts" },
    ];
    const result = generateFiles(inp);
    const content = getFile(result, "scene-plan.md")!.content;
    // No 5th scene HEADING in the breakdown (the "Add Scene 5: …" suggestions in
    // the future-enhancements list are proposals, not a claim the video has one).
    expect(content).not.toContain("### Scene 5");
    expect(content).not.toContain("Scene 5: Domain Models");
    expect(content).toContain("| Total Scenes | 4 |");
    expect(content).toContain("### Scene 4: Key Abstractions");
  });
});
