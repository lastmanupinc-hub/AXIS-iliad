import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { runCli, getVersion, type CliIO } from "./cli.js";
import { MARKDOWN_MARKER, HASH_MARKER } from "./marker.js";
import { fixtureFiles } from "./fixture.test-helper.js";

function makeIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line) => out.push(line), err: (line) => err.push(line) },
    out,
    err,
  };
}

let repoDir: string;

function writeFixtureRepo(dir: string): void {
  for (const f of fixtureFiles()) {
    const full = join(dir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf-8");
  }
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), "iliad-md-test-"));
  writeFixtureRepo(repoDir);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe("iliad generate", () => {
  it("writes all five targets with markers", async () => {
    const { io } = makeIO();
    const code = await runCli(["--dir", repoDir], io);
    expect(code).toBe(0);

    const expected = [
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      ".cursorrules",
      join(".github", "copilot-instructions.md"),
    ];
    for (const rel of expected) {
      const full = join(repoDir, rel);
      expect(existsSync(full), rel).toBe(true);
    }
    expect(readFileSync(join(repoDir, "AGENTS.md"), "utf-8").split("\n")[0]).toBe(MARKDOWN_MARKER);
    expect(readFileSync(join(repoDir, ".cursorrules"), "utf-8").split("\n")[0]).toBe(HASH_MARKER);
  });

  it("--targets writes only the requested files", async () => {
    const { io } = makeIO();
    const code = await runCli(["--dir", repoDir, "--targets", "agents,cursor"], io);
    expect(code).toBe(0);
    expect(existsSync(join(repoDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repoDir, ".cursorrules"))).toBe(true);
    expect(existsSync(join(repoDir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repoDir, "GEMINI.md"))).toBe(false);
  });

  it("--dry-run writes nothing", async () => {
    const { io, out } = makeIO();
    const code = await runCli(["--dir", repoDir, "--dry-run"], io);
    expect(code).toBe(0);
    expect(existsSync(join(repoDir, "AGENTS.md"))).toBe(false);
    expect(out.some((l) => l.includes("[dry-run] would write AGENTS.md"))).toBe(true);
  });

  it("skips a pre-existing unmarked AGENTS.md with a warning", async () => {
    const handWritten = "# My hand-written agents file\n\nDo not clobber me.\n";
    writeFileSync(join(repoDir, "AGENTS.md"), handWritten, "utf-8");

    const { io, err } = makeIO();
    const code = await runCli(["--dir", repoDir], io);
    expect(code).toBe(0);
    expect(readFileSync(join(repoDir, "AGENTS.md"), "utf-8")).toBe(handWritten);
    expect(err.some((l) => l.includes("skipping AGENTS.md") && l.includes("--force"))).toBe(true);
    // the other targets are still written
    expect(existsSync(join(repoDir, "CLAUDE.md"))).toBe(true);
  });

  it("--force overwrites an unmarked AGENTS.md", async () => {
    writeFileSync(join(repoDir, "AGENTS.md"), "# hand-written\n", "utf-8");

    const { io } = makeIO();
    const code = await runCli(["--dir", repoDir, "--force"], io);
    expect(code).toBe(0);
    const content = readFileSync(join(repoDir, "AGENTS.md"), "utf-8");
    expect(content.split("\n")[0]).toBe(MARKDOWN_MARKER);
    expect(content).toContain("fixture-app");
  });

  it("rejects unknown flags and targets", async () => {
    const a = makeIO();
    expect(await runCli(["--bogus"], a.io)).toBe(1);
    expect(a.err.some((l) => l.includes('Unknown flag "--bogus"'))).toBe(true);

    const b = makeIO();
    expect(await runCli(["--dir", repoDir, "--targets", "nope"], b.io)).toBe(1);
    expect(b.err.some((l) => l.includes('Unknown target "nope"'))).toBe(true);
  });
});

describe("iliad check", () => {
  it("exits 0 when files are up to date", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir], gen.io)).toBe(0);

    const { io, out } = makeIO();
    const code = await runCli(["check", "--dir", repoDir], io);
    expect(code).toBe(0);
    expect(out.filter((l) => l.startsWith("ok")).length).toBe(5);
  });

  it("exits 1 when targets are missing", async () => {
    const { io, out } = makeIO();
    const code = await runCli(["check", "--dir", repoDir], io);
    expect(code).toBe(1);
    expect(out.filter((l) => l.startsWith("missing")).length).toBe(5);
  });

  it("exits 1 after a meaningful source change", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir], gen.io)).toBe(0);

    // add a new domain model — changes the Domain Models table and summary
    const modelsPath = join(repoDir, "src", "models.ts");
    const updated =
      readFileSync(modelsPath, "utf-8") +
      "\nexport interface Invoice {\n  id: string;\n  order_id: string;\n}\n";
    writeFileSync(modelsPath, updated, "utf-8");

    const { io, out, err } = makeIO();
    const code = await runCli(["check", "--dir", repoDir], io);
    expect(code).toBe(1);
    expect(out.some((l) => l.startsWith("drift"))).toBe(true);
    expect(err.some((l) => l.includes("out of date"))).toBe(true);
  });

  it("check respects --targets", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir, "--targets", "agents"], gen.io)).toBe(0);

    const { io } = makeIO();
    expect(await runCli(["check", "--dir", repoDir, "--targets", "agents"], io)).toBe(0);
  });
});

describe("iliad --version / --help", () => {
  it("--version prints the package.json version", async () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    expect(getVersion()).toBe(pkg.version);

    const { io, out } = makeIO();
    const code = await runCli(["--version"], io);
    expect(code).toBe(0);
    expect(out).toEqual([pkg.version]);
  });

  it("--help prints usage", async () => {
    const { io, out } = makeIO();
    const code = await runCli(["--help"], io);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Usage:");
    expect(out.join("\n")).toContain("iliad check");
  });

  it("github command requires a URL", async () => {
    const { io, err } = makeIO();
    expect(await runCli(["github"], io)).toBe(1);
    expect(err.some((l) => l.includes("requires a repository URL"))).toBe(true);
  });
});

describe("github url parsing", () => {
  it("parses owner/repo/ref from common URL shapes", async () => {
    const { parseGitHubUrl } = await import("./vendor/snapshots/github.js");
    expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo", ref: "HEAD" });
    expect(parseGitHubUrl("github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo", ref: "HEAD" });
    expect(parseGitHubUrl("https://github.com/owner/repo/tree/main")).toEqual({ owner: "owner", repo: "repo", ref: "main" });
    expect(() => parseGitHubUrl("https://example.com/owner/repo")).toThrowError(/Invalid GitHub URL/);
  });
});

describe("generated files do not feed back into analysis", () => {
  it("running generate twice leaves files unchanged", async () => {
    const first = makeIO();
    expect(await runCli(["--dir", repoDir], first.io)).toBe(0);
    const snapshot = readFileSync(join(repoDir, "AGENTS.md"), "utf-8");

    const second = makeIO();
    expect(await runCli(["--dir", repoDir], second.io)).toBe(0);
    expect(readFileSync(join(repoDir, "AGENTS.md"), "utf-8")).toBe(snapshot);
    expect(second.out.filter((l) => l.startsWith("unchanged")).length).toBe(5);
  });
});

describe("CRLF tolerance (Windows checkouts)", () => {
  it("check exits 0 when on-disk targets were converted to CRLF", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir], gen.io)).toBe(0);

    // Simulate git core.autocrlf=true / .gitattributes eol=crlf checkout:
    // identical content, CRLF line endings.
    const agentsPath = join(repoDir, "AGENTS.md");
    const lf = readFileSync(agentsPath, "utf-8");
    writeFileSync(agentsPath, lf.replace(/\n/g, "\r\n"), "utf-8");

    const { io, out } = makeIO();
    expect(await runCli(["check", "--dir", repoDir], io)).toBe(0);
    expect(out.filter((l) => l.startsWith("ok")).length).toBe(5);
  });

  it("generate treats a CRLF copy as unchanged instead of rewriting it", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir], gen.io)).toBe(0);

    const agentsPath = join(repoDir, "AGENTS.md");
    const crlf = readFileSync(agentsPath, "utf-8").replace(/\n/g, "\r\n");
    writeFileSync(agentsPath, crlf, "utf-8");

    const second = makeIO();
    expect(await runCli(["--dir", repoDir], second.io)).toBe(0);
    expect(second.out.some((l) => l === "unchanged AGENTS.md")).toBe(true);
    // No rewrite churn — the CRLF bytes are left alone.
    expect(readFileSync(agentsPath, "utf-8")).toBe(crlf);
  });

  it("check still reports drift for real content changes in a CRLF file", async () => {
    const gen = makeIO();
    expect(await runCli(["--dir", repoDir], gen.io)).toBe(0);

    const agentsPath = join(repoDir, "AGENTS.md");
    const tampered =
      readFileSync(agentsPath, "utf-8").replace(/\n/g, "\r\n") + "manual edit\r\n";
    writeFileSync(agentsPath, tampered, "utf-8");

    const { io, out } = makeIO();
    expect(await runCli(["check", "--dir", repoDir], io)).toBe(1);
    expect(out.some((l) => l.startsWith("drift") && l.includes("AGENTS.md"))).toBe(true);
  });
});

describe("MAX_FILES cap vs generated outputs", () => {
  it("generate → check round-trips cleanly on a repo larger than the scan cap", async () => {
    // 511 scannable files (> MAX_FILES=500). Before the fix, the generated
    // root .md outputs consumed scan slots on the second pass and displaced
    // source files, so check reported false drift right after generate.
    const bigDir = mkdtempSync(join(tmpdir(), "iliad-md-big-"));
    try {
      writeFileSync(
        join(bigDir, "package.json"),
        JSON.stringify({ name: "big-app", version: "1.0.0" }),
        "utf-8",
      );
      mkdirSync(join(bigDir, "src"), { recursive: true });
      for (let i = 0; i < 510; i++) {
        const n = String(i).padStart(4, "0");
        writeFileSync(join(bigDir, "src", `mod-${n}.ts`), `export const value${n} = ${i};\n`, "utf-8");
      }

      const gen = makeIO();
      expect(await runCli(["--dir", bigDir], gen.io)).toBe(0);

      // First check immediately after generate must pass.
      const chk = makeIO();
      expect(await runCli(["check", "--dir", bigDir], chk.io)).toBe(0);
      expect(chk.out.filter((l) => l.startsWith("ok")).length).toBe(5);

      // Second generate is a pure no-op.
      const second = makeIO();
      expect(await runCli(["--dir", bigDir], second.io)).toBe(0);
      expect(second.out.filter((l) => l.startsWith("unchanged")).length).toBe(5);
    } finally {
      rmSync(bigDir, { recursive: true, force: true });
    }
  }, 60000);
});
