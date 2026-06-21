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

export type R2Operation = "GET" | "PUT";

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
}

export interface PresignResult {
  url: string;
  expires_at: string;
  host: string;
  bucket: string;
  key: string;
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

/**
 * Produce a pre-signed URL valid for `ttl_seconds`. Returns the URL plus
 * the expiry timestamp (ISO 8601) and the resolved host/bucket/key for
 * client-side logging. Throws only on programmer errors (missing fields
 * in `config`); callers handle "not configured" upstream by checking
 * `readR2ConfigFromEnv() === null` instead.
 */
export function presignR2Url({ config, method, key, ttl_seconds, now }: PresignOptions): PresignResult {
  if (!config.account_id || !config.access_key_id || !config.secret_access_key || !config.bucket) {
    throw new Error("presignR2Url: incomplete R2 config");
  }
  if (method !== "GET" && method !== "PUT") {
    throw new Error(`presignR2Url: unsupported method ${method}`);
  }
  if (!Number.isFinite(ttl_seconds) || ttl_seconds <= 0 || ttl_seconds > 604800) {
    // 604800s = 7 days, the AWS SigV4 hard cap. We additionally enforce a
    // lower 24h cap at the MCP dispatcher layer.
    throw new Error(`presignR2Url: ttl_seconds must be 1..604800 (got ${ttl_seconds})`);
  }

  const t = now ?? new Date();
  // AMZ-Date: YYYYMMDDTHHMMSSZ, no millis, no separators.
  const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto"; // R2 only honors "auto" in SigV4
  const service = "s3";
  const host = `${config.account_id}.r2.cloudflarestorage.com`;
  // Path-style addressing — bucket lives in the URI, not the hostname.
  const canonicalUri = `/${config.bucket}/${encodeS3Path(key)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${config.access_key_id}/${credentialScope}`;

  // Query params for the pre-signed URL. Order doesn't matter here —
  // we sort them lexicographically before joining (canonical query
  // string requirement).
  const queryEntries: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(ttl_seconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  // SigV4 canonical query string: percent-encoded, sorted by key.
  // URLSearchParams encodes `/` as `%2F`, which we need; but it also
  // uses `+` for spaces, while SigV4 requires `%20`. Manual encode keeps
  // the rules deterministic.
  const encodedQuery = queryEntries
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // Canonical request:
  //   <method>\n<canonical-uri>\n<canonical-query>\n<canonical-headers>\n<signed-headers>\n<payload-hash>
  // For pre-signed URLs, payload hash is the literal "UNSIGNED-PAYLOAD".
  const canonicalRequest = [
    method,
    canonicalUri,
    encodedQuery,
    `host:${host}\n`, // canonical headers — note trailing newline within
    "host",            // signed-headers list
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(config.secret_access_key, dateStamp, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const url = `https://${host}${canonicalUri}?${encodedQuery}&X-Amz-Signature=${signature}`;
  const expires_at = new Date(t.getTime() + ttl_seconds * 1000).toISOString();

  return { url, expires_at, host, bucket: config.bucket, key };
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
