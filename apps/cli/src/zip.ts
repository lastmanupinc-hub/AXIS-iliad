import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Minimal ZIP builder (zero dependencies, STORE method) ──────
//
// Mirrors the header/central-directory layout of apps/api/src/export.ts but
// uses method 0 (STORE, no compression) so the CLI needs no zlib tuning and
// the output is trivially deterministic: fixed timestamps, entry order as
// given (generator output order is itself deterministic).

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}

/** Standard CRC-32 (IEEE 802.3, reflected, init/xorout 0xFFFFFFFF). */
export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  path: string;
  content: string;
}

/** Sanitize an archive path: no traversal, no absolute paths, forward slashes. */
function sanitizePath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

/**
 * Build a ZIP archive (method 0 = STORE) from (path, content) entries.
 * Local file headers + central directory + end-of-central-directory record.
 * Deterministic: fixed mod time/date, no extra fields, input order preserved.
 */
export function buildZip(entries: ZipInput[]): Buffer {
  const chunks: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBuf = Buffer.from(sanitizePath(entry.path), "utf-8");
    const data = Buffer.from(entry.content, "utf-8");
    const crc = crc32(data);

    // Local file header (30 bytes + path)
    const local = Buffer.alloc(30 + pathBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // compression: STORE
    local.writeUInt16LE(0, 10); // mod time (fixed — determinism)
    local.writeUInt16LE(0, 12); // mod date (fixed — determinism)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size (== raw for STORE)
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(pathBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    pathBuf.copy(local, 30);

    chunks.push(local, data);

    // Central directory record (46 bytes + path)
    const central = Buffer.alloc(46 + pathBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // compression: STORE
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(pathBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // relative offset of local header
    pathBuf.copy(central, 46);
    centralRecords.push(central);

    offset += local.length + data.length;
  }

  const centralStart = offset;
  chunks.push(...centralRecords);
  const centralSize = centralRecords.reduce((s, b) => s + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

/**
 * Build a ZIP from generated files and write it to zipPath.
 * Creates parent directories as needed.
 */
export function writeZip(
  files: { path: string; content: string }[],
  zipPath: string,
): { entries: number; bytes: number } {
  const buf = buildZip(files);
  mkdirSync(dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, buf);
  return { entries: files.length, bytes: buf.length };
}
