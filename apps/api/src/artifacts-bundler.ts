// ─── app_23_artifacts_embed_platform: bundle + verify ──────────────
//
// OWNER DECISION (recorded in begin.yaml, verbatim: "react high end"): ship
// the React runtime bundled in, do not downgrade to vanilla-JS widgets to
// dodge this. generateDashboardWidget's React branch already emits a real
// component (`export default DashboardWidget`) — what was missing is
// everything that turns "a component module" into "a file a customer can
// drop into a <script> tag": a real DOM mount call, React/ReactDOM bundled
// in (not assumed present on the host page), and proof it actually runs.
//
// Deliberately does NOT modify generateDashboardWidget itself — that is a
// core, deterministic generator with its own existing tests and consumers;
// widening its blast radius for an Apply-time concern is the wrong layer.
// Mirrors frontend-apply-watcher.ts's shape instead: the raw generator's
// output is an INPUT to a separate pipeline that owns "make it real".
// buildSync, not build: esbuild's async build() spawns a long-lived duplex-pipe
// service process to amortize cost across repeated calls. That service model
// deadlocks under this repo's vitest pool ("threads" / worker_threads) — confirmed
// by isolating the hang: identical code passed instantly under --pool=forks and
// hung indefinitely under the real config. buildSync shells out synchronously
// per call (no persistent service to coordinate with a worker thread), which is
// the correct tradeoff here anyway: this runs at Apply-time, not on a hot path.
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { analyzeUiSurface, type UiFinding } from "@axis/generator-core";

// react/react-dom are apps/api's OWN dependencies (package.json), not the
// workspace root's. pnpm's strict linking means resolution only works from a
// directory that actually depends on the package — process.cwd() is wrong
// whenever this runs from a different cwd (e.g. the whole monorepo's test
// runner launches from the repo root). Resolve from this module's own
// location instead, which is always apps/api/src regardless of caller cwd.
const RESOLVE_DIR = dirname(fileURLToPath(import.meta.url));

export interface BundleWidgetResult {
  ok: boolean;
  /** The final browser-loadable IIFE, React+ReactDOM included. Undefined on failure. */
  code?: string;
  /** esbuild's own diagnostics, verbatim — never summarized into a vaguer message. */
  errors?: string[];
}

/** Every widget mounts here — documented, fixed, so an embed snippet never has to guess. */
export const WIDGET_MOUNT_ID = "axis-widget-root";

/**
 * Wraps a component module's source with a real mount call, then bundles it
 * (component + React + ReactDOM) into one self-contained IIFE via esbuild —
 * no CDN fetch, no assumption the host page already has React loaded.
 *
 * Not async: buildSync (see the import comment above) is fully synchronous.
 * Callers may still `await` this — awaiting a non-Promise value is a no-op
 * in JS — kept that way so this composes unchanged with buildWidget below.
 */
export function bundleWidget(componentSource: string): BundleWidgetResult {
  const entry = [
    componentSource,
    "",
    "import { createRoot } from \"react-dom/client\";",
    `const __axisMountEl = document.getElementById(${JSON.stringify(WIDGET_MOUNT_ID)});`,
    "if (__axisMountEl) {",
    "  createRoot(__axisMountEl).render(React.createElement(DashboardWidget));",
    "} else {",
    `  console.error("AXIS widget: no element with id=${WIDGET_MOUNT_ID} found on the page.");`,
    "}",
  ].join("\n");

  try {
    const result = buildSync({
      stdin: { contents: entry, loader: "tsx", resolveDir: RESOLVE_DIR },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      jsx: "automatic",
      logLevel: "silent",
    });
    if (result.errors.length > 0) {
      return { ok: false, errors: result.errors.map((e) => e.text) };
    }
    const code = result.outputFiles?.[0]?.text;
    if (!code) return { ok: false, errors: ["esbuild produced no output"] };
    return { ok: true, code };
  } catch (err) {
    // esbuild throws (rather than returning .errors) on some failure classes
    // (e.g. a syntax error it cannot even parse to enter the build pipeline).
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [message] };
  }
}

export interface VerifyWidgetBundleResult {
  ok: boolean;
  /** Real diagnostics: a thrown error, any console.error call, or "did not mount". */
  errors: string[];
  /** True only if the mount element gained at least one real child node. */
  mounted: boolean;
}

/** Where a caught in-context error is stashed — see verifyWidgetBundle's wrapping. */
const VERIFY_ERROR_SLOT = "__axisVerifyError";

/**
 * Actually EXECUTES the bundle in a real (headless) DOM — happy-dom, already
 * a project dependency (the vitest test environment), so this needs nothing
 * new. "Loads without console errors" is checked by really loading it, not
 * by static analysis of the bundle text.
 *
 * Three ways this can fail, all real and distinguished in the result:
 *   1. The bundle throws during evaluation.
 *   2. It runs clean but calls console.error (React's own way of surfacing
 *      a problem it recovered from, e.g. a key warning or a failed effect).
 *   3. It runs clean, logs nothing, but never actually mounts anything into
 *      the target element — silently doing nothing is not success.
 *
 * The code under test is NOT eval'd directly — it is wrapped in a try/catch
 * that runs INSIDE happy-dom's vm context and stashes any caught error onto
 * a global slot read back afterward. This was not a style choice: a bare
 * `win.eval(code)` around throwing code, wrapped in Node's own try/catch,
 * measurably hangs this repo's vitest run (pool: "threads") and crashes it
 * outright under `--pool=forks`. happy-dom's Window.eval re-surfaces an
 * uncaught in-context exception asynchronously (as a window `error` event),
 * which escapes the synchronous try/catch entirely and lands on vitest's own
 * global exception handling. Catching it before it ever leaves the vm context
 * sidesteps that path completely — confirmed by direct reproduction under
 * both pool modes before landing on this shape.
 */
export async function verifyWidgetBundle(code: string): Promise<VerifyWidgetBundleResult> {
  const { Window } = await import("happy-dom");
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `<div id="${WIDGET_MOUNT_ID}"></div>`;

  const consoleErrors: string[] = [];
  const originalError = win.console.error.bind(win.console);
  win.console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map((a) => String(a)).join(" "));
    originalError(...(args as []));
  };

  const wrapped = [
    `globalThis.${VERIFY_ERROR_SLOT} = null;`,
    "try {",
    code,
    "} catch (__axisErr) {",
    `  globalThis.${VERIFY_ERROR_SLOT} = (__axisErr && __axisErr.stack) ? __axisErr.stack : String(__axisErr);`,
    "}",
  ].join("\n");

  const errors: string[] = [];
  win.eval(wrapped);

  // React 19's createRoot does NOT commit the initial mount synchronously
  // within eval — its scheduler defers the first commit to a real task tick
  // even for a trivial component with no Suspense/concurrency in play.
  // Measured directly: immediately after eval() the mount div is still
  // empty; happy-dom's own `waitUntilComplete()` (meant for exactly this)
  // hangs forever here instead of resolving, so a bounded real-time wait is
  // the reliable option — confirmed this is enough for React's commit to
  // land before checking, not a guess.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const captured = (win as unknown as Record<string, unknown>)[VERIFY_ERROR_SLOT];
  if (typeof captured === "string") errors.push(captured);
  errors.push(...consoleErrors);

  const mountEl = doc.getElementById(WIDGET_MOUNT_ID);
  const mounted = !!mountEl && mountEl.childNodes.length > 0;
  if (!mounted && errors.length === 0) {
    errors.push(`bundle ran without error but mounted nothing into #${WIDGET_MOUNT_ID}`);
  }

  await win.happyDOM.close();
  return { ok: errors.length === 0 && mounted, errors, mounted };
}

// ─── Composed pipeline: audit → bundle → verify ──────────────────
// Same gate shape as frontend-components.ts's verifyGeneratedComponent (the
// program that writes the component is the program that judges it): a widget
// that fails ANY stage is withheld with the real reason, never shipped with
// a caveat attached.

export type BuildWidgetReason = "audit_failed" | "bundle_failed" | "verify_failed";

export interface BuildWidgetResult {
  status: "built" | "withheld";
  reason?: BuildWidgetReason;
  code?: string;
  /** analyzeUiSurface findings on the pre-bundle component source, if that's what failed. */
  findings?: UiFinding[];
  /** esbuild diagnostics, if bundling is what failed. */
  bundle_errors?: string[];
  /** Real headless-execution diagnostics, if execution is what failed. */
  verify_errors?: string[];
}

/**
 * componentSource is the RAW generator output (generateDashboardWidget's
 * `.code`) — pre-bundle, still real JSX/TSX, which is what analyzeUiSurface's
 * static scan needs (the minified IIFE afterward has no JSX left to scan).
 */
export async function buildWidget(componentSource: string): Promise<BuildWidgetResult> {
  const findings = analyzeUiSurface([
    { path: "AxisGenerated/dashboard-widget.tsx", content: componentSource, content_type: "text/plain" } as never,
  ]);
  if (findings.length > 0) {
    return { status: "withheld", reason: "audit_failed", findings };
  }

  const bundled = bundleWidget(componentSource);
  if (!bundled.ok || !bundled.code) {
    return { status: "withheld", reason: "bundle_failed", bundle_errors: bundled.errors };
  }

  const verified = await verifyWidgetBundle(bundled.code);
  if (!verified.ok) {
    return { status: "withheld", reason: "verify_failed", verify_errors: verified.errors };
  }

  return { status: "built", code: bundled.code };
}
