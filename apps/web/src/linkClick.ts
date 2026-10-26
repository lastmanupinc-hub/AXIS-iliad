import type { MouseEvent } from "react";

/**
 * A link's click, kept in the app (2026-10-26, AXIS Launch taskgate T151). The menus are real links with real
 * addresses (hrefForPage) so a crawler can follow them; a plain left click is handed to the router, so nothing
 * reloads, and a modified or middle click opens the address the way a link does. Each such link carries
 * data-route (the page id): a fragment like /#analyze is a route, not a section, and tools reading the page can tell.
 */
export function followIn(go: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}
