// ─── Cloudflare R2 pre-signed URL minter ────────────────────────
//
// Hand-rolled AWS Signature V4 pre-signer for the iliad_object_storage
// MCP tool. R2 is S3-compatible at path-style URLs
//   https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
// and uses the literal region "auto" in the credential scope. We avoid
// the @aws-sdk/* packages (multi-MB transitive tree) because pre-signing
// is ~120 LoC of HMAC chaining and we already use crypto extensively.
//
// Per AXIS conventions: deterministic, no side effects beyond crypto,
// returns null when the env is incomplete so the caller can emit a
// structured `not_configured` envelope without a thrown exception.

import { createHmac, createHash } from "node:crypto";

export type R2Operation = "GET" | "PUT" | "DELETE";

export interface R2Config {
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
}

export interface PresignOptions {
  config: R2Config;
  method: R2Operation;
  /** Object key (already scoped to the calling account by the caller). */
  key: string;
  /** Pre-sign lifetime in seconds. Capped to 86400 (24h) elsewhere. */
  ttl_seconds: number;
  /** Optional override of `new Date()` for deterministic tests. */
  now?: Date;
  /** Engineer mint-time policy (PUT only): pin the Content-Type the upload must send (signed header). */
  content_type?: string;
  /** Engineer mint-time policy (PUT only): pin the EXACT body size in bytes the upload must be (signed header). */
  content_length?: number;
}

export interface PresignResult {
  url: string;
  expires_at: string;
  host: string;
  bucket: string;
  key: string;
  /** Headers the caller MUST send verbatim (signed) — set for COPY and mint-time PUT policy. */
  required_headers?: Record<string, string>;
}

/** Sentinel returned when any of the R2 env vars are missing. */
export type R2ConfigFromEnv = R2Config | null;

/** Read R2 config from `process.env`. Returns null if any field is missing. */
export function readR2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2ConfigFromEnv {
  const account_id = env.R2_ACCOUNT_ID;
  const access_key_id = env.R2_ACCESS_KEY_ID;
  const secret_access_key = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;
  if (!account_id || !access_key_id || !secret_access_key || !bucket) return null;
  return { account_id, access_key_id, secret_access_key, bucket };
}

// ─── Path-segment encoder ──────────────────────────────────────
// S3 + R2 want each segment URL-encoded but `/` preserved. We also
// must encode the same way in both the canonical URI and the final
// URL or the signature will not match.
function encodeS3Path(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) =>
      "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    ))
    .join("/");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  // kSecret  → kDate → kRegion → kService → kSigning
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

// ─── Mint-time PUT policy validators ───────────────────────────
// content_type becomes a SIGNED header, so its bytes land verbatim in the
// canonical-headers block AND the client's request — reject anything that isn't
// printable single-line ASCII (a CR/LF would inject headers into both).
const MAX_PUT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB — R2 single-PUT ceiling

function assertContentType(ct: string): void {
  if (ct.length === 0 || ct.length > 255) {
    throw new Error("content_type must be 1..255 chars");
  }
  if (!/^[\x20-\x7e]+$/.test(ct)) {
    throw new Error("content_type must be printable ASCII with no control characters (header-injection guard)");
  }
  if (!/^[\w.+-]+\/[\w.+-]+/.test(ct)) {
    throw new Error("content_type must look like type/subtype");
  }
}

function assertContentLength(n: number): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("content_length must be a non-negative integer");
  }
  if (n > MAX_PUT_BYTES) {
    throw new Error(`content_length exceeds the ${MAX_PUT_BYTES}-byte single-PUT ceiling`);
  }
}

/**
 * Core SigV4 pre-signer for R2 — signs `method` on `canonicalUri` with
 * `extraQuery` params merged into the canonical query string. Single-sourced so
 * presignR2Url (object ops) and presignR2List (bucket list) can't drift.
 * Path-style addressing: the bucket lives in canonicalUri, not the host.
 */
function buildSignedR2Url(
  config: R2Config,
  method: string,
  canonicalUri: string,
  extraQuery: Array<[string, string]>,
  ttl_seconds: number,
  now?: Date,
  extraSignedHeaders: Array<[string, string]> = [],
): { url: string; expires_at: string; host: string } {
  const t = now ?? new Date();
  // AMZ-Date: YYYYMMDDTHHMMSSZ, no millis, no separators.
  const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto"; // R2 only honors "auto" in SigV4
  const service = "s3";
  const host = `${config.account_id}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${config.access_key_id}/${credentialScope}`;

  // Headers to sign: host is always present, plus any extras (e.g.
  // x-amz-copy-source for server-side COPY). Lowercased + sorted by name per
  // SigV4. With no extras this collapses to exactly "host" — byte-identical.
  const headerPairs = [["host", host] as [string, string], ...extraSignedHeaders]
    .map(([k, v]) => [k.toLowerCase(), v] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaderList = headerPairs.map(([k]) => k).join(";");
  const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${v}\n`).join("");

  // SigV4 canonical query string: percent-encoded (manual, so spaces are %20
  // not +), sorted by the ENCODED key. X-Amz-* params first, then extras.
  const encodedQuery = ([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(ttl_seconds)],
    ["X-Amz-SignedHeaders", signedHeaderList],
    ...extraQuery,
  ] as Array<[string, string]>)
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // Canonical request — pre-signed payload hash is the literal "UNSIGNED-PAYLOAD".
  const canonicalRequest = [method, canonicalUri, encodedQuery, canonicalHeaders, signedHeaderList, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = deriveSigningKey(config.secret_access_key, dateStamp, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    url: `https://${host}${canonicalUri}?${encodedQuery}&X-Amz-Signature=${signature}`,
    expires_at: new Date(t.getTime() + ttl_seconds * 1000).toISOString(),
    host,
  };
}

/**
 * Produce a pre-signed URL valid for `ttl_seconds` (plus expiry + host/bucket/key
 * for logging). On PUT, optional content_type/content_length are signed as a
 * mint-time policy R2 enforces (returned in required_headers). Throws on
 * programmer errors (incomplete config, bad policy); callers handle "not
 * configured" upstream via readR2ConfigFromEnv().
 */
export function presignR2Url({ config, method, key, ttl_seconds, now, content_type, content_length }: PresignOptions): PresignResult {
  if (!config.account_id || !config.access_key_id || !config.secret_access_key || !config.bucket) {
    throw new Error("presignR2Url: incomplete R2 config");
  }
  if (method !== "GET" && method !== "PUT" && method !== "DELETE") {
    throw new Error(`presignR2Url: unsupported method ${method}`);
  }
  if (!Number.isFinite(ttl_seconds) || ttl_seconds <= 0 || ttl_seconds > 604800) {
    // 604800s = 7 days, the AWS SigV4 hard cap. We additionally enforce a
    // lower 24h cap at the MCP dispatcher layer.
    throw new Error(`presignR2Url: ttl_seconds must be 1..604800 (got ${ttl_seconds})`);
  }

  // Mint-time policy: pin Content-Type / exact Content-Length as signed headers
  // so R2 rejects a mismatched upload. PUT only.
  const extraHeaders: Array<[string, string]> = [];
  if (content_type !== undefined || content_length !== undefined) {
    if (method !== "PUT") {
      throw new Error("presignR2Url: content_type/content_length apply to PUT only");
    }
    if (content_type !== undefined) {
      assertContentType(content_type);
      extraHeaders.push(["content-type", content_type]);
    }
    if (content_length !== undefined) {
      assertContentLength(content_length);
      extraHeaders.push(["content-length", String(content_length)]);
    }
  }

  const signed = buildSignedR2Url(config, method, `/${config.bucket}/${encodeS3Path(key)}`, [], ttl_seconds, now, extraHeaders);
  return {
    ...signed,
    bucket: config.bucket,
    key,
    ...(extraHeaders.length > 0 ? { required_headers: Object.fromEntries(extraHeaders) } : {}),
  };
}

// RFC 3986 unreserved set: A-Za-z0-9 - _ . ~ everything else gets encoded.
function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// ─── Account-scoping helpers ───────────────────────────────────

const KEY_PREFIX = "accounts";

/**
 * Sanitize a caller-supplied key and prepend the account scope so accounts
 * cannot reach each other's objects. Returns the scoped key or throws on
 * an obviously-malicious input (path traversal, absolute paths).
 */
export function scopeAccountKey(account_id: string, raw_key: string): string {
  if (!account_id || typeof account_id !== "string") {
    throw new Error("scopeAccountKey: account_id is required");
  }
  if (typeof raw_key !== "string" || raw_key.length === 0) {
    throw new Error("scopeAccountKey: key is required");
  }
  if (raw_key.length > 1024) {
    throw new Error("scopeAccountKey: key exceeds 1024 chars");
  }
  // Reject path traversal and absolute paths. We don't try to normalize —
  // any client sending these gets a hard 400 from the dispatcher.
  if (raw_key.includes("..") || raw_key.startsWith("/")) {
    throw new Error("scopeAccountKey: key must not contain '..' or start with '/'");
  }
  // Strip any leading slash artifacts, collapse double slashes.
  const cleaned = raw_key.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  return `${KEY_PREFIX}/${account_id}/${cleaned}`;
}

// ─── Engineer tier (E2): Managed Bucket ─────────────────────────
//
// list + delete + content-addressed keys, on the same hand-rolled SigV4 path.

/**
 * Pre-sign an S3 ListObjectsV2 GET on the bucket, scoped to `prefix`. The agent
 * GETs the URL; R2 returns the standard ListBucketResult XML. Same SigV4 rules as
 * presignR2Url but bucket-level, with list-type=2 + prefix in the signed query.
 */
export function presignR2List(config: R2Config, prefix: string, ttl_seconds: number, now?: Date): PresignResult {
  if (!config.account_id || !config.access_key_id || !config.secret_access_key || !config.bucket) {
    throw new Error("presignR2List: incomplete R2 config");
  }
  if (!Number.isFinite(ttl_seconds) || ttl_seconds <= 0 || ttl_seconds > 604800) {
    throw new Error(`presignR2List: ttl_seconds must be 1..604800 (got ${ttl_seconds})`);
  }
  // Bucket-level ListObjectsV2; max-keys bounds the response page per mint.
  const signed = buildSignedR2Url(
    config,
    "GET",
    `/${config.bucket}`,
    [["list-type", "2"], ["max-keys", "1000"], ["prefix", prefix]],
    ttl_seconds,
    now,
  );
  return { ...signed, bucket: config.bucket, key: prefix };
}

/**
 * Pre-sign a server-side COPY: a PUT to `destKey` carrying a signed
 * x-amz-copy-source header that points at `sourceKey`. R2 duplicates the object
 * internally — the bytes never transit the agent. Both keys must already be
 * account-scoped by the caller (this function does NOT scope them). The returned
 * `required_headers` MUST be sent verbatim on the PUT or the signature won't
 * match (x-amz-copy-source is a signed header).
 */
export function presignR2Copy(
  config: R2Config,
  sourceKey: string,
  destKey: string,
  ttl_seconds: number,
  now?: Date,
): PresignResult & { required_headers: Record<string, string> } {
  if (!config.account_id || !config.access_key_id || !config.secret_access_key || !config.bucket) {
    throw new Error("presignR2Copy: incomplete R2 config");
  }
  if (!Number.isFinite(ttl_seconds) || ttl_seconds <= 0 || ttl_seconds > 604800) {
    throw new Error(`presignR2Copy: ttl_seconds must be 1..604800 (got ${ttl_seconds})`);
  }
  // S3 copy-source is /<bucket>/<url-encoded-key>; encodeS3Path encodes each
  // segment but preserves "/", matching what the client must send.
  const copySource = `/${config.bucket}/${encodeS3Path(sourceKey)}`;
  const signed = buildSignedR2Url(
    config,
    "PUT",
    `/${config.bucket}/${encodeS3Path(destKey)}`,
    [],
    ttl_seconds,
    now,
    [["x-amz-copy-source", copySource]],
  );
  return { ...signed, bucket: config.bucket, key: destKey, required_headers: { "x-amz-copy-source": copySource } };
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Content-addressed key: identical content (same sha256) maps to the same key,
 * so re-uploading the same bytes dedupes. The caller computes the hash of the
 * bytes it will PUT and passes it; the object lands under accounts/<id>/cas/.
 */
export function casKey(account_id: string, content_sha256: string, ext?: string): string {
  if (!SHA256_HEX.test(content_sha256)) {
    throw new Error("casKey: content_sha256 must be a 64-char lowercase hex sha256");
  }
  const safeExt = ext && /^[a-z0-9]{1,12}$/i.test(ext) ? `.${ext.toLowerCase()}` : "";
  return scopeAccountKey(account_id, `cas/${content_sha256}${safeExt}`);
}
