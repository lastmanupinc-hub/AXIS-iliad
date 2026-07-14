import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_COMMANDS } from "./cli.js";

// ─── Doc ↔ CLI parity ───────────────────────────────────────────
//
// DocsPage's CliSection is the public claim; this suite pins it to reality:
//  * every subcommand named in the Commands table resolves to a real branch
//    in cli.ts main() dispatch (via CLI_COMMANDS),
//  * every documented flag/env var exists in the CLI source,
//  * -v never means verbose (it is version),
//  * install docs stay flag-gated until npm publish has actually run,
//  * no second publishable manifest claims the name "axis-iliad".

const srcDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(srcDir, "..", "..", "..");
const docsPath = resolve(repoRoot, "apps", "web", "src", "pages", "DocsPage.tsx");
const cliSource = readFileSync(resolve(srcDir, "cli.ts"), "utf-8");
const docsSource = readFileSync(docsPath, "utf-8");

/** The CliSection component body (from its declaration to the next top-level function). */
function cliSection(): string {
  const start = docsSource.indexOf("function CliSection()");
  expect(start).toBeGreaterThan(-1);
  const rest = docsSource.slice(start + 1);
  const nextFn = rest.search(/\nfunction [A-Z]/);
  return nextFn === -1 ? docsSource.slice(start) : docsSource.slice(start, start + 1 + nextFn);
}

describe("DocsPage CliSection ↔ cli.ts parity", () => {
  const section = cliSection();

  it("every documented subcommand is a real cli.ts dispatch branch", () => {
    const commandsTable = section.slice(
      section.indexOf(">Commands</h2>"),
      section.indexOf("</table>", section.indexOf(">Commands</h2>")),
    );
    const documented = [...commandsTable.matchAll(/<td className="mono"[^>]*>([a-z][a-z-]*)/g)].map((m) => m[1]);

    // The claim: these six exist in the docs …
    for (const cmd of ["analyze", "export", "list-programs", "auth", "status", "github"]) {
      expect(documented).toContain(cmd);
    }
    // … and every documented one is implemented.
    for (const cmd of documented) {
      expect(CLI_COMMANDS as readonly string[]).toContain(cmd);
    }
  });

  it("every documented long flag has a parse branch in cli.ts", () => {
    const optionsTable = section.slice(
      section.indexOf(">CLI Options</h2>"),
      section.indexOf("</table>", section.indexOf(">CLI Options</h2>")),
    );
    const flags = [...optionsTable.matchAll(/<td className="mono"[^>]*>(--[a-z-]+)</g)].map((m) => m[1]);
    expect(flags.length).toBeGreaterThanOrEqual(5);
    for (const flag of flags) {
      expect(cliSource, `documented flag ${flag} missing from cli.ts`).toContain(`"${flag}"`);
    }
  });

  it("every documented env var is honored by the CLI", () => {
    for (const envVar of ["AXIS_API_KEY", "AXIS_API_URL", "AXIS_OUTPUT_DIR", "AXIS_VERBOSE"]) {
      expect(section).toContain(envVar);
      expect(cliSource, `documented env var ${envVar} missing from cli.ts`).toContain(envVar);
    }
  });

  it("-v never means verbose in the docs (it is version)", () => {
    // No table cell offers -v as an alias …
    expect(section).not.toMatch(/className="mono"[^>]*>-v</);
    // … and no example command line passes a bare -v.
    expect(section).not.toMatch(/\{CLI\}[^<]*\s-v(?![a-zA-Z-])/);
    // The verbose example uses the long flag.
    expect(section).toContain("--verbose");
    // And in the CLI itself, -v is version:
    expect(cliSource).toContain('args[i] === "--version" || args[i] === "-v"');
  });

  it("install docs stay flag-gated until npm publish has run", () => {
    const gate = docsSource.match(/const CLI_PUBLISHED = (true|false);/);
    expect(gate, "DocsPage must declare the CLI_PUBLISHED gate").not.toBeNull();
    if (gate![1] === "false") {
      // Dark mode: the registry install line must only render behind the gate,
      // and the honest fallback must be visible.
      expect(section).toContain("not published yet");
      expect(section).toContain("npm install -g ./apps/cli");
    } else {
      expect(section).toContain("npm install -g axis-iliad");
    }
  });
});

describe("publishable manifest uniqueness", () => {
  interface Manifest {
    name?: string;
    private?: boolean;
    bin?: Record<string, string>;
    files?: string[];
    publishConfig?: { access?: string };
    version?: string;
  }

  const cliPkg = JSON.parse(readFileSync(resolve(srcDir, "..", "package.json"), "utf-8")) as Manifest;

  it("apps/cli is the publishable axis-iliad package", () => {
    expect(cliPkg.name).toBe("axis-iliad");
    expect(cliPkg.private).toBeUndefined();
    expect(cliPkg.bin?.["axis-iliad"]).toBe("./bin/axis.js");
    expect(cliPkg.bin?.["axis"]).toBe("./bin/axis.js");
    expect(cliPkg.files).toContain("dist");
    expect(cliPkg.files).toContain("bin");
    expect(cliPkg.publishConfig?.access).toBe("public");
  });

  it("no OTHER publishable manifest claims the name axis-iliad", () => {
    // Root package.json may share the name but must be private.
    const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8")) as Manifest;
    if (rootPkg.name === "axis-iliad") expect(rootPkg.private).toBe(true);

    // The old packaging sample (packaging/manifests/npm-package.json) collided —
    // it must stay deleted, renamed, or private. This also guards against the
    // closer program's regenerate re-introducing it silently.
    const samplePath = resolve(repoRoot, "packaging", "manifests", "npm-package.json");
    if (existsSync(samplePath)) {
      const sample = JSON.parse(readFileSync(samplePath, "utf-8")) as Manifest;
      const publishable = sample.name === "axis-iliad" && sample.private !== true;
      expect(publishable, "packaging/manifests/npm-package.json must not be a second publishable 'axis-iliad'").toBe(false);
    }
  });
});
