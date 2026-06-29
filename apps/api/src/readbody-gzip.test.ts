import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import type { IncomingMessage } from "node:http";
import { readBody } from "./router.js";

// Security audit #5: readBody must CAP gzip decompression so a tiny "bomb" payload can't
// allocate unbounded memory before the size check (the old code decompressed the full body
// first, then checked length — OOM-able).

function gzReq(buf: Buffer): IncomingMessage {
  const r = Readable.from(buf) as unknown as IncomingMessage;
  (r as unknown as { headers: Record<string, string> }).headers = { "content-encoding": "gzip" };
  return r;
}

describe("readBody — gzip safety", () => {
  it("rejects a gzip bomb instead of buffering the full decompressed output", async () => {
    process.env.MAX_BODY_BYTES = "1024";
    try {
      const bomb = gzipSync(Buffer.alloc(64 * 1024)); // ~tiny gzip → 64KB out, past the 1KB cap
      await expect(readBody(gzReq(bomb))).rejects.toThrow(/too large/i);
    } finally {
      delete process.env.MAX_BODY_BYTES;
    }
  });

  it("still decompresses a normal gzip body", async () => {
    const payload = JSON.stringify({ hello: "world" });
    expect(await readBody(gzReq(gzipSync(Buffer.from(payload))))).toBe(payload);
  });
});
