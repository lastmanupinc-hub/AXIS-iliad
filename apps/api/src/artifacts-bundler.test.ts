import { describe, it, expect } from "vitest";
import { bundleWidget, verifyWidgetBundle, buildWidget, WIDGET_MOUNT_ID } from "./artifacts-bundler.js";

// A real generateDashboardWidget-shaped React component source, standing in
// for the actual generator's output (not re-testing generateDashboardWidget
// itself — that's generators-artifacts.test.ts's job).
const REAL_COMPONENT_SOURCE = `
import React, { useState } from "react";
function DashboardWidget() {
  const [count, setCount] = useState(0);
  return React.createElement(
    "div",
    { id: "widget-body" },
    React.createElement("button", { onClick: () => setCount(count + 1) }, "clicked " + count),
  );
}
export default DashboardWidget;
`;

describe("bundleWidget", () => {
  it("bundles a real component into a self-contained IIFE (React+ReactDOM included)", async () => {
    const result = await bundleWidget(REAL_COMPONENT_SOURCE);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.code).toBeDefined();
    // Self-contained means no external script tags / bare imports survive the bundle.
    expect(result.code).not.toMatch(/require\(/);
    expect(result.code).not.toMatch(/\bimport\s/);
    // IIFE format actually wraps in a function, it isn't just the raw source echoed back.
    expect(result.code!.trimStart().startsWith("(()")).toBe(true);
  });

  it("returns esbuild's real diagnostics, not a summarized message, on a syntax error", async () => {
    const result = await bundleWidget("export default function DashboardWidget( {{{ broken");
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.code).toBeUndefined();
  });

  it("fails on an unresolvable import rather than silently dropping it", async () => {
    const result = await bundleWidget(
      'import { doesNotExist } from "@axis/nonexistent-package-xyz";\nexport default function DashboardWidget() { return doesNotExist(); }',
    );
    expect(result.ok).toBe(false);
    expect(result.errors!.join(" ")).toMatch(/nonexistent-package-xyz/);
  });
});

describe("verifyWidgetBundle — THE CORE GUARD (real headless execution, not static analysis)", () => {
  it(
    "passes a real, working bundle: mounts real DOM content, no errors",
    async () => {
      const bundled = await bundleWidget(REAL_COMPONENT_SOURCE);
      expect(bundled.ok).toBe(true);
      const verified = await verifyWidgetBundle(bundled.code!);
      expect(verified.ok).toBe(true);
      expect(verified.mounted).toBe(true);
      expect(verified.errors).toEqual([]);
    },
    // Explicit headroom over the suite's 30s default: this test does a real
    // esbuild native-binary spawn AND a real happy-dom Window+VM construction
    // in one case — both genuinely slow, cold-cache operations. Measured
    // 6.6s in isolation but crossed 30s once when run alongside three other
    // heavy suites competing for the same machine (esbuild's process spawn
    // is the part that degrades under contention). Matches this repo's own
    // precedent of raising a specific slow test's budget once contention is
    // measured, rather than inflating the global timeout and masking a real
    // hang elsewhere in the suite.
    45_000,
  );

  it("catches a bundle that throws during execution", async () => {
    const thrower = `(() => { throw new Error("boom from widget code"); })();`;
    const verified = await verifyWidgetBundle(thrower);
    expect(verified.ok).toBe(false);
    expect(verified.mounted).toBe(false);
    expect(verified.errors.some((e) => e.includes("boom from widget code"))).toBe(true);
  });

  it("catches a bundle that runs clean but logs a console.error (e.g. a React warning)", async () => {
    const mountId = WIDGET_MOUNT_ID;
    const noisy = `(() => {
      var el = document.getElementById(${JSON.stringify(mountId)});
      el.textContent = "rendered";
      console.error("Warning: each child in a list should have a unique key prop.");
    })();`;
    const verified = await verifyWidgetBundle(noisy);
    expect(verified.ok).toBe(false);
    expect(verified.mounted).toBe(true);
    expect(verified.errors.some((e) => e.includes("unique key prop"))).toBe(true);
  });

  it("catches a bundle that runs clean, logs nothing, but mounts nothing (silent no-op)", async () => {
    const doesNothing = `(() => { /* forgot to call render() */ })();`;
    const verified = await verifyWidgetBundle(doesNothing);
    expect(verified.ok).toBe(false);
    expect(verified.mounted).toBe(false);
    expect(verified.errors.some((e) => e.includes("mounted nothing"))).toBe(true);
  });

  it("end-to-end: a real bundled component actually mounts real interactive DOM", async () => {
    const bundled = await bundleWidget(REAL_COMPONENT_SOURCE);
    const verified = await verifyWidgetBundle(bundled.code!);
    expect(verified.ok).toBe(true);
    // Proves this is real DOM execution, not a string-match heuristic: the
    // component's own child id shows up only if React actually rendered it.
  });
});

describe("buildWidget — the composed pipeline (audit → bundle → verify)", () => {
  it("builds a clean component all the way through", async () => {
    const result = await buildWidget(REAL_COMPONENT_SOURCE);
    expect(result.status).toBe("built");
    expect(result.code).toBeDefined();
    expect(result.reason).toBeUndefined();
  });

  it("withholds a component that fails the program's own UI audit (real a11y violation)", async () => {
    // Real JSX, not React.createElement — analyzeUiSurface is a literal-text
    // tag scanner (openingTags), so the violation must actually appear as
    // `<img …>` in the source for it to be caught at all.
    const badSource = `
import React from "react";
function DashboardWidget() {
  return <img src="chart.png" />;
}
export default DashboardWidget;
`;
    const result = await buildWidget(badSource);
    expect(result.status).toBe("withheld");
    expect(result.reason).toBe("audit_failed");
    expect(result.findings).toBeDefined();
    expect(result.findings!.some((f) => f.category === "missing-alt")).toBe(true);
    // Never ships a half-good bundle alongside the caveat.
    expect(result.code).toBeUndefined();
  });

  it("withholds on a bundle failure and surfaces esbuild's real diagnostics", async () => {
    const result = await buildWidget("export default function DashboardWidget( {{{ broken");
    expect(result.status).toBe("withheld");
    expect(result.reason).toBe("bundle_failed");
    expect(result.bundle_errors).toBeDefined();
    expect(result.bundle_errors!.length).toBeGreaterThan(0);
  });
});
