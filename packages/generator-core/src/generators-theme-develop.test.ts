import { describe, it, expect } from "vitest";
import type { ContextMap } from "@axis/context-engine";
import { detectStyling, componentFileEntries } from "./theme-detect.js";
import { generateDesignTokens, generateThemeGuidelines, generateComponentThemeMap, generateDarkModeTokens } from "./generators-theme.js";

type Dep = ContextMap["dependency_graph"]["external_dependencies"][number];
type Fw = ContextMap["detection"]["frameworks"][number];
type TreeEntry = ContextMap["structure"]["file_tree_summary"][number];

function ctxWith(over: { deps?: string[]; frameworks?: string[]; tree?: TreeEntry[] } = {}): ContextMap {
  return {
    version: "1.0.0", snapshot_id: "s", project_id: "p", generated_at: "2026-01-01T00:00:00Z",
    project_identity: { name: "app", type: "app", primary_language: "TypeScript", description: null, repo_url: null, go_module: null },
    structure: { total_files: 5, total_directories: 2, total_loc: 1000,
      file_tree_summary: (over.tree ?? []) as ContextMap["structure"]["file_tree_summary"], top_level_layout: [] },
    detection: {
      languages: [{ name: "TypeScript", file_count: 5, loc: 1000, loc_percent: 100 }] as ContextMap["detection"]["languages"],
      frameworks: (over.frameworks ?? []).map((name) => ({ name, version: null, confidence: 0.9, evidence: [] })) as Fw[],
      build_tools: [], test_frameworks: [], package_managers: ["pnpm"], ci_platform: null, deployment_target: null,
    },
    dependency_graph: {
      external_dependencies: (over.deps ?? []).map((name) => ({ name, version: "1.0.0" })) as Dep[],
      internal_imports: [], hotspots: [],
    },
    entry_points: [], routes: [], domain_models: [], sql_schema: [],
    architecture_signals: { patterns_detected: [], layer_boundaries: [], separation_score: 0.7 },
    ai_context: { project_summary: "", key_abstractions: [], conventions: [], warnings: [] },
  } as ContextMap;
}
const file = (path: string): TreeEntry => ({ path, type: "file", language: "TypeScript", loc: 10 } as TreeEntry);

describe("detectStyling — one detector, no cross-file disagreement", () => {
  it("detects CSS-in-JS from @emotion/react (previously missed in the guidelines)", () => {
    const s = detectStyling(ctxWith({ deps: ["@emotion/react"] }));
    expect(s.hasStyledComponents).toBe(true);
    expect(s.approach).toBe("css-in-js");
  });
  it("detects Sass from .scss files", () => {
    expect(detectStyling(ctxWith({ tree: [file("src/main.scss")] })).approach).toBe("sass");
  });
  it("detects Tailwind from the framework list even with no config file", () => {
    expect(detectStyling(ctxWith({ frameworks: ["Tailwind CSS"] })).hasTailwind).toBe(true);
  });
  it("detects Tailwind from a config file even when not in the framework list", () => {
    expect(detectStyling(ctxWith({ tree: [file("tailwind.config.ts")] })).hasTailwind).toBe(true);
  });
});

describe("componentFileEntries — canonical predicate", () => {
  const tree = [
    file("src/components/Button.tsx"),
    file("src/Prospect.tsx"),   // contains "spec" as a substring — must NOT be dropped
    file("src/Contest.tsx"),    // contains "test" as a substring — must NOT be dropped
    file("src/Widget.vue"),
    file("src/Foo.test.tsx"),   // real test — dropped
    file("src/Bar.spec.tsx"),   // real spec — dropped
    file("README.md"),          // not a component
    { path: "src/dir", type: "directory", language: null, loc: 0 } as TreeEntry, // not a file
    file("node_modules/pkg/Comp.tsx"), // vendored — dropped
  ];
  it("keeps real components (incl. test/spec-substring names) and drops tests/vendored/non-files", () => {
    const paths = componentFileEntries(ctxWith({ tree })).map((f) => f.path);
    expect(paths).toEqual([
      "src/components/Button.tsx",
      "src/Prospect.tsx",
      "src/Contest.tsx",
      "src/Widget.vue",
    ]);
  });
});

describe("cross-file agreement (the disagreements the HARDEN-1 review flagged)", () => {
  it("guidelines 'Detected N component file(s)' == component-theme-map total_components", () => {
    const ctx = ctxWith({ tree: [
      file("src/pages/HomePage.tsx"), file("src/components/Card.tsx"),
      file("src/Prospect.tsx"), file("src/App.test.tsx"), file("src/Nav.vue"),
    ] });
    const headline = generateThemeGuidelines(ctx).content.match(/Detected (\d+) component file\(s\)/);
    const total = (JSON.parse(generateComponentThemeMap(ctx).content) as { summary: { total_components: number } }).summary.total_components;
    expect(headline).not.toBeNull();
    expect(Number(headline![1])).toBe(total);
    expect(total).toBe(4); // HomePage, Card, Prospect, Nav — App.test.tsx excluded
  });

  it("design-tokens styling_approach agrees with the guidelines Styling Approach section (@emotion/react)", () => {
    const ctx = ctxWith({ deps: ["@emotion/react"] });
    const approach = (JSON.parse(generateDesignTokens(ctx).content) as { styling_approach: string }).styling_approach;
    expect(approach).toBe("css-in-js");
    expect(generateThemeGuidelines(ctx).content).toContain("**Detected: CSS-in-JS**");
  });

  it("Sass repo: tokens say sass AND the guidelines have a Sass section (no 'No CSS framework')", () => {
    const ctx = ctxWith({ tree: [file("src/styles/main.scss")] });
    expect((JSON.parse(generateDesignTokens(ctx).content) as { styling_approach: string }).styling_approach).toBe("sass");
    const md = generateThemeGuidelines(ctx).content;
    expect(md).toContain("**Detected: Sass / SCSS**");
  });

  it("Tailwind-by-framework: tokens, guidelines, and dark-mode all agree", () => {
    const ctx = ctxWith({ frameworks: ["Tailwind CSS"] });
    expect((JSON.parse(generateDesignTokens(ctx).content) as { styling_approach: string }).styling_approach).toBe("tailwind");
    expect(generateThemeGuidelines(ctx).content).toContain("**Detected: Tailwind CSS**");
    const dark = JSON.parse(generateDarkModeTokens(ctx).content) as { implementation: { css_strategy: string } };
    expect(dark.implementation.css_strategy).toBe("tailwind-dark-class");
  });
});
