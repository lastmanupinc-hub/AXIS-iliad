// ─── The public API base: every absolute URL the API hands out ────
//
// Discovery documents, MCP server info, the OpenAPI servers list, sign-up and
// snapshot links, the estate manifest and the crawler User-Agents are all built
// on PUBLIC_API_BASE. Set the env var PUBLIC_API_BASE to point a staging or
// local deployment at itself; unset, it is the live origin
// (DEFAULT_PUBLIC_API_BASE in @axis/generator-core).
//
// Until AXIS Launch taskgate T34 a dozen literals here named the Render host,
// suspended since the 2026-08-31 move to Fly, so agents following Iliad's own
// discovery documents reached "Service Suspended".
// no-dead-backend.test.ts fails if an onrender.com address reaches a served
// response again.

import { DEFAULT_PUBLIC_API_BASE } from "@axis/generator-core";

/**
 * Normalise a configured base: an absolute http(s) URL, trailing slashes
 * dropped, query and fragment refused. Anything else falls back to the live
 * origin rather than publishing a broken URL in every discovery document.
 */
export function resolvePublicApiBase(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return DEFAULT_PUBLIC_API_BASE;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return DEFAULT_PUBLIC_API_BASE;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.search || url.hash) {
    return DEFAULT_PUBLIC_API_BASE;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The public origin of this API, without a trailing slash. */
export const PUBLIC_API_BASE: string = resolvePublicApiBase(process.env.PUBLIC_API_BASE);

/** An absolute public URL for a path on this API (`publicUrl("/mcp")`). */
export function publicUrl(path: string): string {
  return `${PUBLIC_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
