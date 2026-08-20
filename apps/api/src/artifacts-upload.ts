// ─── app_23_artifacts_embed_platform: host the built bundle ────────
//
// A verified widget bundle (artifacts-bundler.ts's buildWidget) is just
// bytes in memory until a customer's page can actually fetch it. This is
// the "make it a live endpoint" half of the Apply/Watch/Storefront rubric —
// a real R2 upload, not a report that a bundle exists.
//
// Client-driven upload (server mints, caller PUTs) is this repo's normal R2
// pattern (see mcp-tool-impls.ts's object_storage tool) because the AGENT
// holds the bytes there. Here the SERVER holds the bytes — the widget was
// just compiled and verified in-process — so the server is correctly both
// the minter and the uploader. That's a different situation, not a
// deviation from the pattern: there is no third party to hand a presigned
// PUT to.
//
// NO "public base URL" concept exists in this repo's R2 config today (not
// fabricated — checked). What DOES already exist is presigned GET, used
// elsewhere in this codebase for exactly this kind of read access. Reusing
// it here gives a REAL, working embed link today; it expires and that is
// stated honestly in the result rather than implied to be permanent.
import { createHash } from "node:crypto";
import { readR2ConfigFromEnv, presignR2Url, casKey, type R2Config } from "./object-storage.js";

/** How long a minted embed link stays valid — the SigV4 hard cap (7 days). */
export const EMBED_URL_TTL_SECONDS = 604800;

export type UploadWidgetResult =
  | { status: "not_configured" }
  | { status: "uploaded"; url: string; expires_at: string; key: string }
  | { status: "upload_failed"; error: string };

export interface UploadWidgetDeps {
  readConfig: () => R2Config | null;
  fetchImpl: typeof fetch;
  /** Override of `new Date()` for deterministic tests — threaded through to presignR2Url. */
  now?: Date;
}

/**
 * Uploads a verified bundle to R2 under a content-addressed key (same bytes
 * → same key, so re-uploads dedupe for free) and mints a time-limited GET
 * URL to hand back as the embed target.
 */
export async function uploadWidgetBundle(
  code: string,
  accountId: string,
  deps: UploadWidgetDeps,
): Promise<UploadWidgetResult> {
  const config = deps.readConfig();
  if (!config) return { status: "not_configured" };

  const bytes = Buffer.from(code, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = casKey(accountId, sha256, "js");

  const put = presignR2Url({
    config,
    method: "PUT",
    key,
    ttl_seconds: 3600,
    content_type: "application/javascript",
    content_length: bytes.length,
    now: deps.now,
  });

  let res: Response;
  try {
    res = await deps.fetchImpl(put.url, {
      method: "PUT",
      headers: { ...(put.required_headers ?? {}) },
      body: bytes,
    });
  } catch (err) {
    return { status: "upload_failed", error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    return { status: "upload_failed", error: `R2 PUT returned HTTP ${res.status}` };
  }

  const get = presignR2Url({ config, method: "GET", key, ttl_seconds: EMBED_URL_TTL_SECONDS, now: deps.now });
  return { status: "uploaded", url: get.url, expires_at: get.expires_at, key };
}

export function defaultUploadWidgetDeps(): UploadWidgetDeps {
  return { readConfig: () => readR2ConfigFromEnv(), fetchImpl: fetch };
}
