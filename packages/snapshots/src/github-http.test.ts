import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { EventEmitter } from "node:events";

// Mock node:https before importing the module under test
vi.mock("node:https", () => ({
  default: {},
  get: vi.fn(),
}));

import { get as httpsGet } from "node:https";
import { fetchGitHubRepo } from "./github.js";

const mockedGet = vi.mocked(httpsGet);

// ─── Tar builder (minimal, for valid fetch tests) ───────────────

function buildTarEntry(name: string, content: string): Buffer {
  const contentBuf = Buffer.from(content, "utf-8");
  const header = Buffer.alloc(512, 0);
  header.write(name.slice(0, 100), 0, Math.min(name.length, 100), "utf-8");
  header.write("0000644\0", 100, 8, "utf-8");
  header.write("0001000\0", 108, 8, "utf-8");
  header.write("0001000\0", 116, 8, "utf-8");
  header.write(contentBuf.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
  header.write("00000000000\0", 136, 12, "utf-8");
  header[156] = 48; // '0' = regular file
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");
  const paddedSize = Math.ceil(contentBuf.length / 512) * 512;
  const contentBlock = Buffer.alloc(paddedSize, 0);
  contentBuf.copy(contentBlock);
  return Buffer.concat([header, contentBlock]);
}

function buildTar(entries: Array<{ name: string; content: string }>): Buffer {
  const parts = entries.map((e) => buildTarEntry(e.name, e.content));
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function makeGzippedTarball(): Buffer {
  const tar = buildTar([
    { name: "owner-repo-abc123/src/index.ts", content: "export const x = 1;" },
    { name: "owner-repo-abc123/package.json", content: '{"name":"test"}' },
  ]);
  return gzipSync(tar);
}

// ─── Mock helpers ───────────────────────────────────────────────

interface MockRes extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  destroy: () => void;
}

function makeRes(statusCode: number, headers: Record<string, string> = {}): MockRes {
  const res = new EventEmitter() as MockRes;
  res.statusCode = statusCode;
  res.headers = headers;
  res.destroy = vi.fn();
  return res;
}

function makeReq(): EventEmitter & { destroy: () => void } {
  const req = new EventEmitter() as EventEmitter & { destroy: () => void };
  req.destroy = vi.fn();
  return req;
}

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchGitHubRepo HTTP resilience", () => {

  it("fetches and parses a valid gzipped tarball", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", tarball);
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    const result = await fetchGitHubRepo("https://github.com/owner/repo");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.files.length).toBe(2);
    expect(result.files.map(f => f.path).sort()).toEqual(["package.json", "src/index.ts"]);
  });

  it("follows a single redirect (302)", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let callCount = 0;

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      callCount++;
      const callback = cb as (r: MockRes) => void;
      if (callCount === 1) {
        const res = makeRes(302, { location: "https://codeload.github.com/tarball" });
        callback(res);
      } else {
        const res = makeRes(200);
        callback(res);
        res.emit("data", tarball);
        res.emit("end");
      }
      return req as ReturnType<typeof httpsGet>;
    });

    const result = await fetchGitHubRepo("https://github.com/owner/repo");
    expect(callCount).toBe(2);
    expect(result.files.length).toBe(2);
  });

  it("follows multiple redirects (up to 5)", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let callCount = 0;

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      callCount++;
      const callback = cb as (r: MockRes) => void;
      if (callCount <= 5) {
        const res = makeRes(301, { location: `https://redirect-${callCount}.example.com` });
        callback(res);
      } else {
        const res = makeRes(200);
        callback(res);
        res.emit("data", tarball);
        res.emit("end");
      }
      return req as ReturnType<typeof httpsGet>;
    });

    const result = await fetchGitHubRepo("https://github.com/owner/repo");
    expect(callCount).toBe(6);
    expect(result.files.length).toBe(2);
  });

  it("rejects after more than 5 redirects", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(302, { location: "https://infinite.example.com" });
      (cb as (r: MockRes) => void)(res);
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("Too many redirects");
  });

  it("rejects on HTTP 404", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(404);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", Buffer.from('{"message":"Not Found"}'));
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("GitHub API returned 404");
  });

  it("rejects on HTTP 403 (rate limited)", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(403);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", Buffer.from('{"message":"API rate limit exceeded"}'));
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("GitHub API returned 403");
  });

  it("rejects on HTTP 500", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(500);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", Buffer.from("Internal Server Error"));
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("GitHub API returned 500");
  });

  it("rejects when response exceeds 100MB", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      // Send 11 × 10MB chunks = 110MB, exceeding the 100MB limit
      const tenMB = Buffer.alloc(10 * 1024 * 1024, 0x41);
      for (let i = 0; i < 11; i++) {
        res.emit("data", tenMB);
      }
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("100MB limit");
  });

  it("rejects on network error", async () => {
    mockedGet.mockImplementation((_url: unknown, _opts: unknown, _cb: unknown) => {
      const req = makeReq();
      process.nextTick(() => req.emit("error", new Error("ECONNREFUSED")));
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("ECONNREFUSED");
  });

  it("rejects on response stream error", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", Buffer.from("partial"));
      res.emit("error", new Error("Connection reset"));
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("Connection reset");
  });

  it("rejects on timeout", async () => {
    mockedGet.mockImplementation((_url: unknown, _opts: unknown, _cb: unknown) => {
      const req = makeReq();
      process.nextTick(() => req.emit("timeout"));
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo"))
      .rejects.toThrow("timed out");
  });

  it("includes authorization header when token provided", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let capturedOpts: Record<string, unknown> = {};

    mockedGet.mockImplementation((_url: unknown, opts: unknown, cb: unknown) => {
      capturedOpts = opts as Record<string, unknown>;
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", tarball);
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/owner/repo", "ghp_test123");
    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_test123");
  });

  it("does not include authorization header without token", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let capturedOpts: Record<string, unknown> = {};

    mockedGet.mockImplementation((_url: unknown, opts: unknown, cb: unknown) => {
      capturedOpts = opts as Record<string, unknown>;
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", tarball);
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/owner/repo");
    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("truncates error body to 200 chars in rejection message", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      const res = makeRes(422);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", Buffer.from("E".repeat(500)));
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    try {
      await fetchGitHubRepo("https://github.com/owner/repo");
      expect.unreachable("Should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("GitHub API returned 422");
      expect(msg.length).toBeLessThanOrEqual("GitHub API returned 422: ".length + 200);
    }
  });

  it("sends correct User-Agent header", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let capturedOpts: Record<string, unknown> = {};

    mockedGet.mockImplementation((_url: unknown, opts: unknown, cb: unknown) => {
      capturedOpts = opts as Record<string, unknown>;
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", tarball);
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/owner/repo");
    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("axis-toolbox/0.2.0");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
  });

  it("constructs correct tarball URL from GitHub URL", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let capturedUrl = "";

    mockedGet.mockImplementation((url: unknown, _opts: unknown, cb: unknown) => {
      capturedUrl = url as string;
      const res = makeRes(200);
      (cb as (r: MockRes) => void)(res);
      res.emit("data", tarball);
      res.emit("end");
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/myorg/myrepo/tree/develop");
    expect(capturedUrl).toBe("https://api.github.com/repos/myorg/myrepo/tarball/develop");
  });
});
