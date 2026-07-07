import { useCallback, useEffect, useState } from "react";
import { hashForPage, matchHash, routeFromPathname, type PageId, type RouteParams } from "./routes.tsx";

// ─── useHashRoute — hash ⇄ route state (WO-F2) ──────────────────────────────
//
// The URL hash is the source of truth. `navigate` writes the hash (and updates
// state synchronously so the UI never lags a frame); the hashchange listener
// keeps state in sync for browser Back/Forward and plain <a href="#…"> links.
// Pattern matching (incl. ":id" segments) lives in routes.tsx.

export interface RouteState {
  page: PageId;
  /** Params captured from the pattern (e.g. { id } for "projects/:id"). */
  params: RouteParams;
  /** Raw hash (without "#") that produced this state — 404 reporting. */
  hash: string;
  /**
   * Increments on programmatic navigation only (not Back/Forward) — drives the
   * page-enter remount, so re-clicking the current nav item resets the page.
   */
  key: number;
}

/** True while an OAuth provider is redirecting back with a one-time ?code= to
 *  exchange for the session cookie. The router must land on /account so the
 *  handoff completes — and the login gate must never bounce it to the popup. */
export function isOAuthCallback(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");
}

function resolve(rawHash: string, pathname: string): Omit<RouteState, "key"> {
  const hash = rawHash.replace(/^#/, "");
  if (!hash) {
    // No hash → marketing pathname aliases (/pricing, /mcp, …) may pick the page.
    const aliased = routeFromPathname(pathname);
    if (aliased) return { page: aliased.page, params: {}, hash };
  }
  const match = matchHash(hash);
  if (match) return { page: match.route.page, params: match.params, hash };
  return { page: "not-found", params: {}, hash };
}

function initialState(): RouteState {
  // An OAuth provider redirects back to /account?code=…; route there so the
  // AccountPage handoff runs even though the landing URL has no hash.
  if (isOAuthCallback()) {
    return { page: "account", params: {}, hash: location.hash.replace(/^#/, ""), key: 0 };
  }
  return { ...resolve(location.hash, location.pathname), key: 0 };
}

export function useHashRoute(): {
  route: RouteState;
  navigate: (page: PageId, params?: RouteParams) => void;
} {
  const [route, setRoute] = useState<RouteState>(initialState);

  useEffect(() => {
    const onHashChange = () => {
      const next = resolve(location.hash, location.pathname);
      // `navigate` already applied this state (same hash) → keep the object
      // (and its key) so programmatic navs don't double-remount.
      setRoute((prev) => (prev.hash === next.hash && prev.page === next.page ? prev : { ...next, key: prev.key }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((page: PageId, params?: RouteParams) => {
    const hash = hashForPage(page, params);
    setRoute((prev) => ({ page, params: params ?? {}, hash, key: prev.key + 1 }));
    // Assigning an unchanged hash fires no event; state above already moved.
    if (location.hash.replace(/^#/, "") !== hash) location.hash = hash;
  }, []);

  return { route, navigate };
}
