import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextMap } from "@axis/context-engine";
import {
  generateValeConfig,
  generateValeForbiddenTermsStyle,
  generateValePreferredTermsStyle,
  valeForbiddenTokens,
  TERMINOLOGY_TABLE,
  VOICE_EXAMPLES,
} from "./generators-brand.js";

// app_41's rule-synthesis half — pure, deterministic, no external process.
// The V gate itself (running these rules against the real vale binary) is
// tested twice: once here at the generator level (proving the SYNTHESIZED
// rules are self-consistent, independent of the watcher), and again in
// apps/api/src/brand-voice-lint-watcher.test.ts (proving the watcher's own
// runtime self-check calls through correctly). Both skip cleanly if the
// vale binary isn't available locally — same convention as
// canvas-diagram-watcher.test.ts's d2Available probe.

const ctx = {} as ContextMap;

describe("generateValeConfig", () => {
  it("points StylesPath at the styles this program also generates", () => {
    const file = generateValeConfig(ctx);
    expect(file.path).toBe(".vale.ini");
    expect(file.content).toContain("StylesPath = styles");
    expect(file.content).toContain("BasedOnStyles = AXIS");
  });
});

describe("generateValeForbiddenTermsStyle", () => {
  it("is a valid existence rule at error level", () => {
    const file = generateValeForbiddenTermsStyle(ctx);
    expect(file.path).toBe("styles/AXIS/ForbiddenPatterns.yml");
    expect(file.content).toContain("extends: existence");
    expect(file.content).toContain("level: error");
  });

  it("includes every VOICE_EXAMPLES reason word, not a hand-copied subset", () => {
    const file = generateValeForbiddenTermsStyle(ctx);
    for (const ex of VOICE_EXAMPLES) {
      for (const word of ex.dont_reason_words) {
        // Tokens are word-bounded regex, not the literal phrase — check the
        // phrase's first word appears (good enough to prove it was included,
        // without re-implementing literalToToken's escaping here).
        const firstWord = word.split(/\s+/)[0].toLowerCase();
        expect(file.content.toLowerCase()).toContain(firstWord);
      }
    }
  });
});

describe("generateValePreferredTermsStyle", () => {
  it("is a valid substitution rule covering every TERMINOLOGY_TABLE entry", () => {
    const file = generateValePreferredTermsStyle(ctx);
    expect(file.path).toBe("styles/AXIS/PreferredTerms.yml");
    expect(file.content).toContain("extends: substitution");
    for (const t of TERMINOLOGY_TABLE) {
      for (const bad of t.not) {
        expect(file.content).toContain(`${bad}: ${t.use}`);
      }
    }
  });
});

describe("valeForbiddenTokens", () => {
  it("is deterministic and deduped across calls", () => {
    const a = valeForbiddenTokens();
    const b = valeForbiddenTokens();
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

// ─── Real vale binary — proves the V gate empirically, not just structurally ─

function findValeBinary(): string | null {
  const candidates = [
    process.env.AXIS_VALE_BINARY_PATH,
    join(process.cwd(), ".tools", "vale.exe"),
    join(process.cwd(), ".tools", "vale"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    const r = spawnSync(p, ["--version"], { encoding: "utf-8" });
    if (r.status === 0) return p;
  }
  return null;
}

const valeBinary = findValeBinary();

describe.skipIf(!valeBinary)("V gate, real vale binary: the guide's own examples pass their own rules", () => {
  it("every Do example produces zero error-severity findings; every Don't example with a reason word produces at least one", () => {
    const dir = mkdtempSync(join(tmpdir(), "axis-vale-gentest-"));
    try {
      const stylesDir = join(dir, "styles", "AXIS");
      mkdirSync(stylesDir, { recursive: true });
      writeFileSync(join(dir, ".vale.ini"), generateValeConfig(ctx).content, "utf-8");
      writeFileSync(join(stylesDir, "ForbiddenPatterns.yml"), generateValeForbiddenTermsStyle(ctx).content, "utf-8");
      writeFileSync(join(stylesDir, "PreferredTerms.yml"), generateValePreferredTermsStyle(ctx).content, "utf-8");

      const testable = VOICE_EXAMPLES.filter((e) => e.dont_reason_words.length > 0);
      const lines: string[] = [];
      const kinds: Array<"do" | "dont"> = [];
      for (const ex of testable) {
        lines.push(ex.do.replace(/\s+/g, " ").trim());
        kinds.push("do");
        lines.push(ex.dont.replace(/\s+/g, " ").trim());
        kinds.push("dont");
      }
      const inputPath = join(dir, "examples.txt");
      writeFileSync(inputPath, lines.join("\n") + "\n", "utf-8");

      const r = spawnSync(valeBinary!, ["--config", join(dir, ".vale.ini"), "--output=JSON", inputPath], { encoding: "utf-8" });
      const parsed = JSON.parse(r.stdout || "{}") as Record<string, Array<{ Line: number; Severity: string }>>;
      const findings = Object.values(parsed).flat();
      const errorLines = new Set(findings.filter((f) => f.Severity === "error").map((f) => f.Line));

      kinds.forEach((kind, i) => {
        const lineNo = i + 1;
        if (kind === "do") {
          expect(errorLines.has(lineNo), `Do example at line ${lineNo} was unexpectedly flagged`).toBe(false);
        } else {
          expect(errorLines.has(lineNo), `Don't example at line ${lineNo} was NOT flagged`).toBe(true);
        }
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("RED-PROOF: a Don't example stripped of its off-voice word no longer triggers — proving the rule checks the word, not something adjacent", () => {
    const dir = mkdtempSync(join(tmpdir(), "axis-vale-gentest-red-"));
    try {
      const stylesDir = join(dir, "styles", "AXIS");
      mkdirSync(stylesDir, { recursive: true });
      writeFileSync(join(dir, ".vale.ini"), generateValeConfig(ctx).content, "utf-8");
      writeFileSync(join(stylesDir, "ForbiddenPatterns.yml"), generateValeForbiddenTermsStyle(ctx).content, "utf-8");
      writeFileSync(join(stylesDir, "PreferredTerms.yml"), generateValePreferredTermsStyle(ctx).content, "utf-8");

      const inputPath = join(dir, "clean.txt");
      writeFileSync(inputPath, "Something went wrong.\n", "utf-8"); // "Oops!" removed
      const r = spawnSync(valeBinary!, ["--config", join(dir, ".vale.ini"), "--output=JSON", inputPath], { encoding: "utf-8" });
      const parsed = JSON.parse(r.stdout || "{}") as Record<string, Array<{ Severity: string }>>;
      const errorFindings = Object.values(parsed).flat().filter((f) => f.Severity === "error");
      expect(errorFindings).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
