import type { ContextMap } from "@axis/context-engine";
import { hasFw } from "./fw-helpers.js";

type FileTreeEntry = ContextMap["structure"]["file_tree_summary"][number];

export type StylingApproach = "tailwind" | "css-in-js" | "css-modules" | "sass" | "plain-css";

export interface StylingSignals {
  hasTailwind: boolean;
  hasCssModules: boolean;
  hasStyledComponents: boolean;
  hasSass: boolean;
  approach: StylingApproach;
}

/**
 * Unified styling-approach detection shared by every theme generator so the
 * design-tokens JSON, the guidelines doc, and the dark-mode tokens can never
 * disagree about the same repo.
 *
 * Two disagreements this closes:
 *  - Tailwind was detected by a `tailwind.config` file in some generators but by
 *    the framework list in others; here it's EITHER (config-less Tailwind v4 and
 *    truncated file trees both resolve the same).
 *  - CSS-in-JS previously omitted `@emotion/react` in the guidelines while the
 *    tokens JSON included it. Here the full dependency set is used everywhere.
 *
 * `approach` precedence: tailwind > css-in-js > css-modules > sass > plain-css.
 * Pure + deterministic.
 */
export function detectStyling(ctx: ContextMap): StylingSignals {
  const treeFiles = ctx.structure.file_tree_summary;
  const hasTailwind =
    treeFiles.some(f => f.path.includes("tailwind.config")) ||
    hasFw(ctx, "Tailwind CSS", "tailwind");
  const hasCssModules = treeFiles.some(
    f => f.path.endsWith(".module.css") || f.path.endsWith(".module.scss"),
  );
  const hasStyledComponents = ctx.dependency_graph.external_dependencies.some(
    d => d.name === "styled-components" || d.name === "@emotion/styled" || d.name === "@emotion/react",
  );
  const hasSass = treeFiles.some(f => f.path.endsWith(".scss") || f.path.endsWith(".sass"));
  const approach: StylingApproach = hasTailwind ? "tailwind"
    : hasStyledComponents ? "css-in-js"
    : hasCssModules ? "css-modules"
    : hasSass ? "sass"
    : "plain-css";
  return { hasTailwind, hasCssModules, hasStyledComponents, hasSass, approach };
}

/**
 * The component source files in the repo tree — ONE canonical predicate shared by
 * the guidelines "Detected N component file(s)" headline and the
 * component-theme-map's `total_components`, so the two artifacts can never report
 * different counts for the same repo.
 *
 * A component is a real `.tsx`/`.vue`/`.svelte` FILE that isn't a test. Uses the
 * `.test.`/`.spec.` infixes (not the bare substrings "test"/"spec", which wrongly
 * drop legitimately-named components like `Prospect.tsx`, `Contest.tsx`,
 * `Latest.tsx`). Pages/layouts count as components (the map classifies them by
 * type); the headline reflects the same total.
 */
export function componentFileEntries(ctx: ContextMap): FileTreeEntry[] {
  return ctx.structure.file_tree_summary.filter(f =>
    f.type === "file" &&
    /\.(tsx|vue|svelte)$/.test(f.path) &&
    !f.path.includes(".test.") && !f.path.includes(".spec.") &&
    !f.path.includes("node_modules"),
  );
}
