import { useId, useRef, type KeyboardEvent } from "react";

// ─── useTabList (H5.1b item d) ───────────────────────────────────────────────
//
// HelpPage/QAPage/DocsPage's section tabs and McpPage's PlatformTabs are all
// the same shape: an array of tab ids, one active at a time, click to switch.
// Each was keyboard-*reachable* (native <button>s take Tab+Enter/Space for
// free) but implemented none of the ARIA Tabs Pattern a screen reader expects
// — no tablist/tab/tabpanel roles wired together, no aria-selected, no
// roving tabindex, no arrow-key navigation. This hook supplies all of it as
// prop-getters so each page keeps its own markup/styling and just spreads
// the result onto its existing container/button/panel elements.
//
// Automatic activation (arrow key immediately switches tabs, same as a
// click) — matches every one of these pages' existing mouse behavior, so
// keyboard users get the identical interaction model rather than a new
// two-step "arrow then Enter" pattern that would only exist for them.

export function useTabList<T extends string>(tabs: readonly T[], active: T, onActivate: (tab: T) => void) {
  const idBase = useId();
  const tabRefs = useRef<Map<T, HTMLElement>>(new Map());

  function registerTab(tab: T) {
    return (el: HTMLElement | null) => {
      if (el) tabRefs.current.set(tab, el);
      else tabRefs.current.delete(tab);
    };
  }

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    const currentIndex = tabs.indexOf(active);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    onActivate(nextTab);
    tabRefs.current.get(nextTab)?.focus();
  }

  return {
    tabListProps: { role: "tablist" as const, onKeyDown: handleKeyDown },
    getTabProps: (tab: T) => ({
      id: `${idBase}-tab-${tab}`,
      role: "tab" as const,
      "aria-selected": tab === active,
      "aria-controls": `${idBase}-panel-${tab}`,
      tabIndex: tab === active ? 0 : -1,
      ref: registerTab(tab),
    }),
    getPanelProps: (tab: T) => ({
      id: `${idBase}-panel-${tab}`,
      role: "tabpanel" as const,
      "aria-labelledby": `${idBase}-tab-${tab}`,
    }),
  };
}
