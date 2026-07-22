/**
 * Security regression test for the 2026-07-22 vendor-drift fix.
 *
 * This vendored copy of @axis/snapshots' github.ts had silently drifted from
 * 2 hardening fixes already shipped in the real file (commit 774767c):
 * redirect handling here used to follow ANY redirect (including non-HTTPS)
 * and resend the caller's bearer token regardless of the redirect target's
 * host. Since this file ships inside the published iliad-md npm CLI, that
 * was a real token-leak exposure. This test locks the ported fix: reject
 * non-HTTPS redirects, and strip the Authorization header on any cross-host
 * redirect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { EventEmitter } from "node:events";

vi.mock("node:https", () => ({
  default: {},
  get: vi.fn(),
}));

import { get as httpsGet } from "node:https";
import { fetchGitHubRepo } from "./github.js";

const mockedGet = vi.mocked(httpsGet);

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

function makeGzippedTarball(): Buffer {
  const entry = buildTarEntry("owner-repo-abc123/index.ts", "export const x = 1;");
  const tar = Buffer.concat([entry, Buffer.alloc(1024, 0)]);
  return gzipSync(tar);
}

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

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchGitHubRepo — redirect security (2026-07-22 vendor-drift fix)", () => {
  it("strips the Authorization header when a redirect points at a DIFFERENT host", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let callCount = 0;
    const capturedHeaders: Record<string, string>[] = [];

    mockedGet.mockImplementation((_url: unknown, opts: unknown, cb: unknown) => {
      callCount++;
      capturedHeaders.push((opts as { headers: Record<string, string> }).headers);
      const callback = cb as (r: MockRes) => void;
      if (callCount === 1) {
        callback(makeRes(302, { location: "https://codeload.github.com/owner/repo/tar.gz/HEAD" }));
      } else {
        const res = makeRes(200);
        callback(res);
        res.emit("data", tarball);
        res.emit("end");
      }
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/owner/repo", "ghp_realtoken");
    expect(callCount).toBe(2);
    // First request (api.github.com): token present.
    expect(capturedHeaders[0].Authorization).toBe("Bearer ghp_realtoken");
    // Second request (codeload.github.com, a DIFFERENT host): token stripped.
    expect(capturedHeaders[1].Authorization).toBeUndefined();
  });

  it("keeps the Authorization header when a redirect stays on the SAME host", async () => {
    const tarball = makeGzippedTarball();
    const req = makeReq();
    let callCount = 0;
    const capturedHeaders: Record<string, string>[] = [];

    mockedGet.mockImplementation((_url: unknown, opts: unknown, cb: unknown) => {
      callCount++;
      capturedHeaders.push((opts as { headers: Record<string, string> }).headers);
      const callback = cb as (r: MockRes) => void;
      if (callCount === 1) {
        callback(makeRes(302, { location: "https://api.github.com/repos/owner/repo/tarball/HEAD?sig=abc" }));
      } else {
        const res = makeRes(200);
        callback(res);
        res.emit("data", tarball);
        res.emit("end");
      }
      return req as ReturnType<typeof httpsGet>;
    });

    await fetchGitHubRepo("https://github.com/owner/repo", "ghp_realtoken");
    expect(capturedHeaders[1].Authorization).toBe("Bearer ghp_realtoken");
  });

  it("refuses to follow a non-HTTPS redirect", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      (cb as (r: MockRes) => void)(makeRes(302, { location: "http://attacker.example.com/steal" }));
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo", "ghp_realtoken"))
      .rejects.toThrow("Refusing to follow non-HTTPS redirect");
  });

  it("rejects a malformed redirect Location instead of throwing an uncaught error", async () => {
    const req = makeReq();

    mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
      (cb as (r: MockRes) => void)(makeRes(302, { location: "not a url" }));
      return req as ReturnType<typeof httpsGet>;
    });

    await expect(fetchGitHubRepo("https://github.com/owner/repo", "ghp_realtoken"))
      .rejects.toThrow("Invalid redirect URL");
  });
});
