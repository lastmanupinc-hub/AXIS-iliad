import type { IncomingMessage, ServerResponse } from "node:http";
import { deflateRawSync } from "node:zlib";
import { getProjectSnapshots, getProjectOwner, getGeneratorResult } from "@axis/snapshots";
import { sendJSON, sendError } from "./router.js";
import { resolveAuth } from "./billing.js";
import { ErrorCode } from "./logger.js";

// ─── Minimal ZIP builder (zero dependencies) ────────────────────

interface ZipEntry {
  path: string;
  content: Buffer;
  compressed: Buffer;
  crc32: number;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(buf: Buffer, offset: number, val: number) {
  buf.writeUInt16LE(val, offset);
}
function writeU32(buf: Buffer, offset: number, val: number) {
  buf.writeUInt32LE(val, offset);
}

function buildZip(files: Array<{ path: string; content: string }>): Buffer {
  const entries: ZipEntry[] = files.map(f => {
    // Sanitize path: no traversal, no absolute, normalize separators
    const safePath = f.path
      .replace(/\\/g, "/")
      .split("/")
      .filter(p => p && p !== "." && p !== "..")
      .join("/");
    const raw = Buffer.from(f.content, "utf-8");
    const compressed = deflateRawSync(raw, { level: 6 });
    return { path: safePath, content: raw, compressed, crc32: crc32(raw) };
  });

  const chunks: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, "utf-8");

    // Local file header (30 + pathLen + compressedLen)
    const local = Buffer.alloc(30 + pathBuf.length);
    writeU32(local, 0, 0x04034b50);    // signature
    writeU16(local, 4, 20);             // version needed
    writeU16(local, 6, 0);              // flags
    writeU16(local, 8, 8);              // compression: deflate
    writeU16(local, 10, 0);             // mod time
    writeU16(local, 12, 0);             // mod date
    writeU32(local, 14, entry.crc32);
    writeU32(local, 18, entry.compressed.length);
    writeU32(local, 22, entry.content.length);
    writeU16(local, 26, pathBuf.length);
    writeU16(local, 28, 0);             // extra field length
    pathBuf.copy(local, 30);

    chunks.push(local, entry.compressed);

    // Central directory record
    const central = Buffer.alloc(46 + pathBuf.length);
    writeU32(central, 0, 0x02014b50);   // signature
    writeU16(central, 4, 20);            // version made by
    writeU16(central, 6, 20);            // version needed
    writeU16(central, 8, 0);             // flags
    writeU16(central, 10, 8);            // compression: deflate
    writeU16(central, 12, 0);            // mod time
    writeU16(central, 14, 0);            // mod date
    writeU32(central, 16, entry.crc32);
    writeU32(central, 20, entry.compressed.length);
    writeU32(central, 24, entry.content.length);
    writeU16(central, 28, pathBuf.length);
    writeU16(central, 30, 0);            // extra field length
    writeU16(central, 32, 0);            // file comment length
    writeU16(central, 34, 0);            // disk number start
    writeU16(central, 36, 0);            // internal attributes
    writeU32(central, 38, 0);            // external attributes
    writeU32(central, 42, offset);       // relative offset
    pathBuf.copy(central, 46);
    centralRecords.push(central);

    offset += local.length + entry.compressed.length;
  }

  const centralStart = offset;
  chunks.push(...centralRecords);

  const centralSize = centralRecords.reduce((s, b) => s + b.length, 0);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);               // disk number
  writeU16(eocd, 6, 0);               // disk with central dir
  writeU16(eocd, 8, entries.length);   // entries on this disk
  writeU16(eocd, 10, entries.length);  // total entries
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, centralStart);
  writeU16(eocd, 20, 0);              // comment length
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// ─── Export handler ─────────────────────────────────────────────

export async function handleExportZip(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const { project_id } = params;
  // Ownership check
  const owner = getProjectOwner(project_id);
  if (owner) {
    const auth = resolveAuth(_req);
    if (!auth.account) {
      sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required");
      return;
    }
    if (auth.account.account_id !== owner) {
      sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
      return;
    }
  }
  const snapshots = getProjectSnapshots(project_id);
  if (snapshots.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No snapshots found for project");
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const generated = getGeneratorResult(latest.snapshot_id) as
    | { files: Array<{ path: string; content: string; program: string }> }
    | undefined;

  if (!generated || generated.files.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No generated files available yet");
    return;
  }

  // Optional program filter via query param
  /* v8 ignore next — req.url always present in tests */
  const url = new URL(_req.url ?? "/", `http://${_req.headers.host}`);
  const programFilter = url.searchParams.get("program");

  const files = programFilter
    /* v8 ignore next — V8 quirk: both filter paths tested */
    ? generated.files.filter(f => f.program === programFilter)
    : generated.files;

  if (files.length === 0) {
    sendError(res, 404, ErrorCode.NOT_FOUND, `No files for program: ${programFilter}`);
    return;
  }

  const zip = buildZip(files.map(f => ({ path: f.path, content: f.content })));

  const filename = programFilter
    ? `axis-${programFilter}-${latest.snapshot_id.slice(0, 8)}.zip`
    : `axis-export-${latest.snapshot_id.slice(0, 8)}.zip`;

  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": zip.length,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(zip);
}
