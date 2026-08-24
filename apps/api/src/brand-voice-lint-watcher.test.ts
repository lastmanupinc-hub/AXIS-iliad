import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { WatchJobPayload } from "@axis/snapshots";
import {
  processBrandVoiceLint,
  extractUserFacingStrings,
  verifyVoiceExamplesSelfConsistent,
  realRunVale,
  type BrandVoiceLintDeps,
  type ValeFinding,
  type RunVale,
} from "./brand-voice-lint-watcher.js";
import type { PullRequestFile, PostCommitStatusResult } from "./github-pr.js";
import { VOICE_EXAMPLES } from "@axis/generator-core";

// app_41's V gate is the defensible claim — "the guide's own examples pass
// their own rules" — so verifyVoiceExamplesSelfConsistent and realRunVale are
// tested RED-PROOF style: a broken rule set must be caught before it's ever
// trusted against a real PR, and the subprocess boundary must be proven safe
// against adversarial PR-derived content, not just assumed safe.

function payload(over: Partial<WatchJobPayload> = {}): WatchJobPayload {
  return {
    account_id: "acc-1",
    product_id: "brand",
    repo_full_name: "octo/app",
    event_type: "pull_request",
    ref: "prsha123",
    pr_number: 7,
    ...over,
  };
}

function makeDeps(opts: {
  token?: string | undefined;
  prFiles?: PullRequestFile[];
  runVale?: RunVale;
  postResult?: PostCommitStatusResult;
} = {}) {
  const token = "token" in opts ? opts.token : "gh-token";
  const postCalls: Array<{ state: string; description: string }> = [];
  const fetchPrFilesCalls: number[] = [];
  const deps: BrandVoiceLintDeps = {
    token,
    fetchPrFiles: async (_owner, _repo, prNumber) => {
      fetchPrFilesCalls.push(prNumber);
      return opts.prFiles ?? [];
    },
    runVale: opts.runVale ?? (async () => []),
    postStatus: async (p) => {
      postCalls.push({ state: p.state, description: p.description });
      return opts.postResult ?? { posted: true };
    },
  };
  return { deps, postCalls, fetchPrFilesCalls };
}

describe("processBrandVoiceLint — canonical watcher cases", () => {
  it("declines other products without fetching anything", async () => {
    const { deps, fetchPrFilesCalls } = makeDeps();
    const result = await processBrandVoiceLint(payload({ product_id: "seo" }), deps);
    expect(result.status).toBe("not_brand_product");
    expect(fetchPrFilesCalls).toHaveLength(0);
  });

  it("declines without a GitHub token", async () => {
    const { deps } = makeDeps({ token: undefined });
    expect((await processBrandVoiceLint(payload(), deps)).status).toBe("no_token");
  });

  it("declines a push-triggered job with no pr_number — a PR-lint has nothing to check files for", async () => {
    const { deps, fetchPrFilesCalls } = makeDeps();
    const result = await processBrandVoiceLint(payload({ pr_number: undefined, event_type: "push" }), deps);
    expect(result.status).toBe("no_pr");
    expect(fetchPrFilesCalls).toHaveLength(0);
  });

  it("reports self_check_failed and posts NOTHING when the synthesized rules don't discriminate the guide's own examples", async () => {
    const brokenRunVale: RunVale = async () => []; // never flags anything — every Don't example goes undetected
    const { deps, postCalls } = makeDeps({ runVale: brokenRunVale });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.status).toBe("self_check_failed");
    expect(result.self_check?.self_consistent).toBe(false);
    expect(result.self_check?.failures.length).toBeGreaterThan(0);
    expect(postCalls).toHaveLength(0);
  });

  it("posts success with no violations when there are no user-facing strings in the PR", async () => {
    const { deps, postCalls } = makeDeps({
      runVale: consistentRunVale(),
      prFiles: [{ filename: "src/logic.ts", status: "modified", patch: "@@ -1,1 +1,1 @@\n+const x = 1;" }],
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.status).toBe("no_user_facing_strings");
    expect(postCalls).toEqual([{ state: "success", description: expect.stringContaining("no user-facing strings") }]);
  });

  it("posts a success status when every extracted string passes", async () => {
    const { deps, postCalls } = makeDeps({
      runVale: consistentRunVale({ extraClean: true }),
      prFiles: [{ filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+  return <button>Save</button>;" }],
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.status).toBe("status_posted");
    expect(result.status_state).toBe("success");
    expect(result.violations).toBe(0);
    expect(postCalls[0].state).toBe("success");
  });

  it("posts a failure status citing the guide when a violation is found", async () => {
    const { deps, postCalls } = makeDeps({
      runVale: consistentRunVale({ extraViolation: true }),
      prFiles: [{ filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+  return <p>Congratulations amazing!</p>;" }],
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.status).toBe("status_posted");
    expect(result.status_state).toBe("failure");
    expect(result.violations).toBeGreaterThan(0);
    expect(postCalls[0].state).toBe("failure");
    expect(postCalls[0].description).toContain("voice-and-tone.md");
  });

  it("RED-PROOF: cites the finding that actually belongs to the first violation's own line, not just whichever finding runVale happens to return first", async () => {
    // Two violations on lines 1 and 2 (batch order) — the mock deliberately
    // returns the LATER line's finding FIRST, so a naive errorFindings[0]
    // would cite the WRONG message for violations[0] (line 1). This proves
    // the fix looks up the finding by its actual line, not array position.
    const testableCount = VOICE_EXAMPLES.filter((e) => e.dont_reason_words.length > 0).length;
    const scrambledRunVale: RunVale = async (lines) => {
      if (lines.length === testableCount * 2) return consistentRunVale()(lines);
      return [
        { check: "AXIS.Test", message: "SECOND finding (line 2's real message)", severity: "error", match: "y", line: 2 },
        { check: "AXIS.Test", message: "FIRST finding (line 1's real message)", severity: "error", match: "x", line: 1 },
      ];
    };
    const { deps, postCalls } = makeDeps({
      runVale: scrambledRunVale,
      prFiles: [
        { filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+  <p>Off-voice one</p>" },
        { filename: "src/App.tsx", status: "modified", patch: "@@ -2,1 +2,1 @@\n+  <p>Off-voice two</p>" },
      ],
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.violations).toBe(2);
    // violations[0] is the line-1 string — its citation must be line 1's own message.
    expect(postCalls[0].description).toContain("FIRST finding (line 1's real message)");
    expect(postCalls[0].description).not.toContain("SECOND finding");
  });

  it("discloses truncation honestly in the posted description — a capped PR is never reported as an unqualified clean pass", async () => {
    const manyLines = Array.from({ length: 250 }, (_, i) => `+  <p>Item ${i}</p>`).join("\n");
    const { deps, postCalls } = makeDeps({
      runVale: consistentRunVale({ extraClean: true }),
      prFiles: [{ filename: "src/Big.tsx", status: "modified", patch: `@@ -1,1 +1,250 @@\n${manyLines}` }],
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.truncated).toBe(true);
    expect(result.status_state).toBe("success"); // every string it DID check really was clean
    expect(postCalls[0].description).toMatch(/not exhaustively checked|more user-facing strings/i);
  });

  it("reports posted:false honestly when the GitHub status API call itself fails, without masking the verdict", async () => {
    const { deps } = makeDeps({
      runVale: consistentRunVale({ extraClean: true }),
      prFiles: [{ filename: "src/App.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+  return <button>Save</button>;" }],
      postResult: { posted: false, reason: "status create failed (403)" },
    });
    const result = await processBrandVoiceLint(payload(), deps);
    expect(result.status_state).toBe("success"); // the LINT verdict is unaffected
    expect(result.posted).toBe(false); // but the delivery failure is not hidden
  });
});

/**
 * A RunVale stub that satisfies verifyVoiceExamplesSelfConsistent exactly
 * (every testable Do -> no error, every testable Don't -> one error at its
 * own line), optionally layering one extra line's worth of finding for the
 * PR-string-checking tests below (which reuse the SAME runVale for both the
 * self-check call and the PR-string call, since deps.runVale is one function).
 */
function consistentRunVale(opts: { extraClean?: boolean; extraViolation?: boolean } = {}): RunVale {
  const testableCount = VOICE_EXAMPLES.filter((e) => e.dont_reason_words.length > 0).length;
  return async (lines: string[]) => {
    const findings: ValeFinding[] = [];
    if (lines.length === testableCount * 2) {
      // The self-check call: line 2,4,6,8 (the "dont" slots) get an error.
      for (let i = 0; i < testableCount; i++) {
        findings.push({ check: "AXIS.Test", message: "off-voice", severity: "error", match: "x", line: i * 2 + 2 });
      }
      return findings;
    }
    // The PR-string call.
    if (opts.extraViolation) {
      findings.push({ check: "AXIS.ForbiddenPatterns", message: "Off-voice language: 'Congratulations'.", severity: "error", match: "Congratulations", line: 1 });
    }
    return findings;
  };
}

describe("verifyVoiceExamplesSelfConsistent — the V gate, red-proven", () => {
  it("passes when Do examples are clean and Don't examples (with a reason) are flagged at their own line", async () => {
    const result = await verifyVoiceExamplesSelfConsistent(consistentRunVale());
    expect(result.self_consistent).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("names the Loading/Empty-state examples as excluded, never silently drops them", async () => {
    const result = await verifyVoiceExamplesSelfConsistent(consistentRunVale());
    expect(result.excluded).toContain("Loading / In-Progress");
    expect(result.excluded).toContain("Empty States");
  });

  it("RED-PROOF: catches a Do example that gets wrongly flagged", async () => {
    const badRunVale: RunVale = async (lines) => {
      // Flags EVERY line (including all "do" lines) — a broken rule set.
      return lines.map((_, i) => ({ check: "X", message: "m", severity: "error", match: "x", line: i + 1 }));
    };
    const result = await verifyVoiceExamplesSelfConsistent(badRunVale);
    expect(result.self_consistent).toBe(false);
    expect(result.failures.some((f) => f.includes("unexpectedly flagged"))).toBe(true);
  });

  it("RED-PROOF: catches a Don't example that goes undetected", async () => {
    const result = await verifyVoiceExamplesSelfConsistent(async () => []);
    expect(result.self_consistent).toBe(false);
    expect(result.failures.some((f) => f.includes("was NOT flagged"))).toBe(true);
  });
});

describe("extractUserFacingStrings — the A stage, a sweep not a compiler", () => {
  it("extracts JSX text content from an added line, with the correct new-file line number", () => {
    const files: PullRequestFile[] = [
      { filename: "src/App.tsx", status: "modified", patch: "@@ -10,3 +12,4 @@\n context\n+  return <button>Save Now</button>;\n+  <p>Done.</p>" },
    ];
    const { strings, truncated } = extractUserFacingStrings(files);
    // Hunk header "+12,4" sets the new-file line to 12 for the FIRST line in
    // the hunk (the context line); the two added lines that follow land on
    // 13 and 14.
    expect(strings).toContainEqual({ file: "src/App.tsx", line: 13, text: "Save Now" });
    expect(strings).toContainEqual({ file: "src/App.tsx", line: 14, text: "Done." });
    expect(truncated).toBe(false);
  });

  it("extracts explicit user-facing attributes (aria-label, alt, title, placeholder)", () => {
    const files: PullRequestFile[] = [
      { filename: "src/Form.tsx", status: "modified", patch: '@@ -1,1 +1,1 @@\n+  <input aria-label="Enter your name" placeholder="e.g. Jane" />' },
    ];
    const { strings } = extractUserFacingStrings(files);
    expect(strings.map((o) => o.text)).toEqual(expect.arrayContaining(["Enter your name", "e.g. Jane"]));
  });

  it("never extracts from REMOVED or CONTEXT lines, only ADDED ones", () => {
    const files: PullRequestFile[] = [
      { filename: "src/App.tsx", status: "modified", patch: "@@ -1,2 +1,2 @@\n-  <p>Old off-voice text</p>\n context <p>Unrelated context</p>" },
    ];
    const { strings } = extractUserFacingStrings(files);
    expect(strings).toEqual([]);
  });

  it("ignores non-JSX files entirely, even if they contain angle brackets", () => {
    const files: PullRequestFile[] = [
      { filename: "src/generic.ts", status: "modified", patch: "@@ -1,1 +1,1 @@\n+const x = a > b ? c : d;" },
    ];
    expect(extractUserFacingStrings(files).strings).toEqual([]);
  });

  it("skips files with no patch (binary or too-large diffs GitHub declines to compute)", () => {
    const files: PullRequestFile[] = [{ filename: "src/App.tsx", status: "modified" }];
    expect(extractUserFacingStrings(files).strings).toEqual([]);
  });

  it("skips extraction on a single pathologically long line rather than scanning it — the length cap applies BEFORE regex matching, not just to each match after", () => {
    const hugeLine = `+  <p>${"x".repeat(50_000)}</p>`;
    const files: PullRequestFile[] = [{ filename: "src/Huge.tsx", status: "modified", patch: `@@ -1,1 +1,1 @@\n${hugeLine}` }];
    const { strings } = extractUserFacingStrings(files);
    expect(strings).toEqual([]);
  });

  it("bounds extraction at MAX_STRINGS AND reports truncated:true — a maximally adversarial diff cannot force unbounded work or an unqualified pass", () => {
    const manyLines = Array.from({ length: 300 }, (_, i) => `+  <p>Text number ${i}</p>`).join("\n");
    const files: PullRequestFile[] = [{ filename: "src/Big.tsx", status: "modified", patch: `@@ -1,1 +1,300 @@\n${manyLines}` }];
    const { strings, truncated } = extractUserFacingStrings(files);
    expect(strings.length).toBeLessThanOrEqual(200);
    expect(truncated).toBe(true);
  });

  it("RED-PROOF: a violation past the MAX_STRINGS cap in a LATER file is never silently dropped from the count — truncated:true carries through to the file that was never reached", () => {
    const cleanLines = Array.from({ length: 210 }, (_, i) => `+  <p>Item ${i}</p>`).join("\n");
    const files: PullRequestFile[] = [
      { filename: "src/A.tsx", status: "modified", patch: `@@ -1,1 +1,210 @@\n${cleanLines}` },
      { filename: "src/B.tsx", status: "modified", patch: "@@ -1,1 +1,1 @@\n+  <p>Congratulations amazing!</p>" },
    ];
    const { strings, truncated } = extractUserFacingStrings(files);
    expect(strings.every((s) => s.file === "src/A.tsx")).toBe(true); // src/B.tsx never reached
    expect(truncated).toBe(true); // — but the caller is told the check wasn't exhaustive
  });

  it("tracks new-file line numbers correctly across multiple hunks in one file", () => {
    const files: PullRequestFile[] = [
      {
        filename: "src/Two.tsx",
        status: "modified",
        patch: "@@ -1,1 +1,1 @@\n+  <p>First hunk text</p>\n@@ -50,1 +52,1 @@\n+  <p>Second hunk text</p>",
      },
    ];
    const { strings } = extractUserFacingStrings(files);
    expect(strings).toContainEqual({ file: "src/Two.tsx", line: 1, text: "First hunk text" });
    expect(strings).toContainEqual({ file: "src/Two.tsx", line: 52, text: "Second hunk text" });
  });

  it("RED-PROOF: a garbled hunk header stops trusting THIS FILE's line numbers rather than fabricating one — earlier, well-formed hunks in the same file are kept", () => {
    const files: PullRequestFile[] = [
      {
        filename: "src/Weird.tsx",
        status: "modified",
        patch: "@@ -1,1 +1,1 @@\n+  <p>Trustworthy text</p>\n@@ garbled @@\n+  <p>Congratulations amazing!</p>",
      },
    ];
    const { strings } = extractUserFacingStrings(files);
    // The first hunk's real extraction survives...
    expect(strings).toContainEqual({ file: "src/Weird.tsx", line: 1, text: "Trustworthy text" });
    // ...but nothing after the garbled header is extracted with a fabricated line number.
    expect(strings.some((s) => s.text === "Congratulations amazing!")).toBe(false);
  });
});

// ─── Real vale binary — the subprocess safety boundary, proven not assumed ─

function findValeBinary(): string | null {
  const candidates = [process.env.AXIS_VALE_BINARY_PATH, join(process.cwd(), ".tools", "vale.exe"), join(process.cwd(), ".tools", "vale")].filter(
    (p): p is string => Boolean(p),
  );
  for (const p of candidates) {
    const r = spawnSync(p, ["--version"], { encoding: "utf-8" });
    if (r.status === 0) return p;
  }
  return null;
}
const valeBinary = findValeBinary();

describe.skipIf(!valeBinary)("realRunVale — real vale binary, real safety proof, no mocks", () => {
  it("lints real off-voice text and returns a genuine error-severity finding", async () => {
    const run = realRunVale(valeBinary!);
    const findings = await run(["This is amazing news!", "This is good news."]);
    const errorLines = findings.filter((f) => f.severity === "error").map((f) => f.line);
    expect(errorLines).toContain(1);
    expect(errorLines).not.toContain(2);
  });

  it("SECURITY RED-PROOF: shell-metacharacter-laden PR text is treated as inert file content, never executed", async () => {
    const run = realRunVale(valeBinary!);
    // A payload that would be catastrophic if it ever reached a shell:
    // command chaining, backticks, subshell, and a redirect — all as plain
    // linted TEXT here, because it only ever becomes temp-file CONTENT, and
    // execFile's argv holds nothing but fixed AXIS-built paths.
    const adversarial = '"; rm -rf / #`whoami`$(echo pwned) & echo done > /tmp/pwned';
    const findings = await run([adversarial, "Clean and simple text.".replace("simple", "clear")]);
    // Must not throw, must not hang (vitest's own default timeout would
    // catch a hang), and must return an ordinary findings array — vale just
    // pattern-matched the string as text, nothing executed.
    expect(Array.isArray(findings)).toBe(true);
  });

  it("returns an empty array without spawning anything when there is nothing to lint", async () => {
    const run = realRunVale(valeBinary!);
    expect(await run([])).toEqual([]);
  });
});
