import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { buildZip, writeZip, crc32 } from "./zip.js";
import { main } from "./cli.js";

// ─── Fixtures ───────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `axis-cli-export-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFixtureProject(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{ "name": "export-fixture", "dependencies": { "react": "^19.0.0" } }', "utf-8");
  writeFileSync(join(root, "src", "index.ts"), "export const greet = (n: string) => `hi ${n}`;\n", "utf-8");
}

/** Recursively collect { relPath → content } for tree comparison. */
function snapshotTree(dir: string, base = dir): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      for (const [k, v] of snapshotTree(p, base)) out.set(k, v);
    } else {
      out.set(p.slice(base.length + 1).replace(/\\/g, "/"), readFileSync(p, "utf-8"));
    }
  }
  return out;
}

let tmp: string;
const savedArgv = process.argv;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmp = makeTempDir();
  process.exitCode = undefined;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = savedArgv;
  process.exitCode = undefined;
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(tmp, { recursive: true, force: true });
});

// ─── crc32 ──────────────────────────────────────────────────────

describe("crc32", () => {
  it("matches known vectors", () => {
    // Standard IEEE CRC-32 test vectors
    expect(crc32(Buffer.from(""))).toBe(0);
    expect(crc32(Buffer.from("hello"))).toBe(0x3610a686);
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("agrees with node:zlib crc32 when available", async () => {
    const zlib = await import("node:zlib");
    const zcrc = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32;
    if (typeof zcrc !== "function") return; // Node < 20.15
    for (const s of ["", "axis", "the quick brown fox", "éèê unicode"]) {
      const buf = Buffer.from(s, "utf-8");
      expect(crc32(buf)).toBe(zcrc(buf) >>> 0);
    }
  });
});

// ─── buildZip ───────────────────────────────────────────────────

describe("buildZip", () => {
  it("emits local header, central directory, and EOCD signatures", () => {
    const zip = buildZip([{ path: "a.md", content: "hello" }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true); // central dir
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50); // EOCD
  });

  it("uses STORE (method 0) and correct sizes/crc", () => {
    const content = "stored content";
    const zip = buildZip([{ path: "f.txt", content }]);
    expect(zip.readUInt16LE(8)).toBe(0); // compression method: STORE
    expect(zip.readUInt32LE(14)).toBe(crc32(Buffer.from(content)));
    expect(zip.readUInt32LE(18)).toBe(content.length); // compressed size
    expect(zip.readUInt32LE(22)).toBe(content.length); // uncompressed size
    // STORE means the raw bytes sit right after the 30-byte header + name
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30 + nameLen, 30 + nameLen + content.length).toString()).toBe(content);
  });

  it("records the entry count in the EOCD", () => {
    const zip = buildZip([
      { path: "one.md", content: "1" },
      { path: "dir/two.md", content: "2" },
      { path: "dir/three.md", content: "3" },
    ]);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(3); // total entries
  });

  it("sanitizes traversal and absolute paths", () => {
    const zip = buildZip([{ path: "../..\\evil/../ok.txt", content: "x" }]);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLen).toString()).toBe("evil/ok.txt");
  });

  it("is byte-deterministic for identical input", () => {
    const entries = [{ path: "a.md", content: "same" }, { path: "b.md", content: "bytes" }];
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });
});

// ─── writeZip ───────────────────────────────────────────────────

describe("writeZip", () => {
  it("writes the archive and reports entries/bytes", () => {
    const zipPath = join(tmp, "nested", "out.zip");
    const result = writeZip([{ path: "a.md", content: "hello" }], zipPath);
    expect(existsSync(zipPath)).toBe(true);
    expect(result.entries).toBe(1);
    expect(result.bytes).toBe(statSync(zipPath).size);
  });
});

// ─── export command (real pipeline, no mocks) ───────────────────

describe("export command", () => {
  it("dir mode writes the same file tree as analyze", () => {
    const fixture = join(tmp, "proj");
    writeFixtureProject(fixture);
    const analyzeOut = join(tmp, "analyze-out");
    const exportOut = join(tmp, "export-out");

    process.argv = ["node", "axis", "analyze", fixture, "--programs", "search,skills,debug", "-o", analyzeOut, "--quiet"];
    main();
    expect(process.exitCode).toBeUndefined();

    process.argv = ["node", "axis", "export", fixture, "--programs", "search,skills,debug", "-o", exportOut, "--quiet"];
    main();
    expect(process.exitCode).toBeUndefined();

    const a = snapshotTree(analyzeOut);
    const b = snapshotTree(exportOut);
    expect(a.size).toBeGreaterThanOrEqual(1);
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [k, v] of a) expect(b.get(k)).toBe(v);
  });

  it("--format zip writes a valid archive with >=1 entry", () => {
    const fixture = join(tmp, "proj");
    writeFixtureProject(fixture);
    const zipPath = join(tmp, "out", "pkg.zip");

    process.argv = ["node", "axis", "export", fixture, "--programs", "search", "--format", "zip", "-o", zipPath, "--quiet"];
    main();
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(zipPath)).toBe(true);

    const zip = readFileSync(zipPath);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBeGreaterThanOrEqual(1);
  });

  it("zip export is byte-identical across two runs (determinism)", () => {
    const fixture = join(tmp, "proj");
    writeFixtureProject(fixture);
    const zip1 = join(tmp, "one.zip");
    const zip2 = join(tmp, "two.zip");

    process.argv = ["node", "axis", "export", fixture, "-p", "search,debug", "-f", "zip", "-o", zip1, "--quiet"];
    main();
    process.argv = ["node", "axis", "export", fixture, "-p", "search,debug", "-f", "zip", "-o", zip2, "--quiet"];
    main();

    expect(readFileSync(zip1).equals(readFileSync(zip2))).toBe(true);
  });

  it("infers zip format from a .zip output path", () => {
    const fixture = join(tmp, "proj");
    writeFixtureProject(fixture);
    const zipPath = join(tmp, "inferred.zip");

    process.argv = ["node", "axis", "export", fixture, "--programs", "search", "-o", zipPath, "--quiet"];
    main();
    expect(process.exitCode).toBeUndefined();
    expect(readFileSync(zipPath).readUInt32LE(0)).toBe(0x04034b50);
  });

  it("rejects unknown --format values", () => {
    const fixture = join(tmp, "proj");
    writeFixtureProject(fixture);
    process.argv = ["node", "axis", "export", fixture, "--format", "tar", "--quiet"];
    main();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("Unknown export format");
  });

  it("fails honestly on an empty directory", () => {
    const empty = join(tmp, "empty");
    mkdirSync(empty, { recursive: true });
    process.argv = ["node", "axis", "export", empty, "--quiet"];
    main();
    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map(([a]) => a).join("\n");
    expect(output).toContain("No source files found");
  });
});
