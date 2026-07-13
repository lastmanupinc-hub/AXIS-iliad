/**
 * @vitest-environment happy-dom
 */

// H5.1b item (d) — useTabList: the ARIA Tabs Pattern (role wiring, roving
// tabindex, arrow-key navigation) that HelpPage/QAPage/DocsPage/McpPage's
// tab strips previously lacked entirely (or only partially, for McpPage).
// jsdom/happy-dom genuinely track document.activeElement and fire real
// keyboard events, so these are behavioral assertions.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useTabList } from "./useTabList.ts";

afterEach(() => cleanup());

const TABS = ["one", "two", "three"] as const;

function TestTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]>("one");
  const { tabListProps, getTabProps, getPanelProps } = useTabList(TABS, active, setActive);
  return (
    <div>
      <div {...tabListProps}>
        {TABS.map((t) => (
          <button key={t} {...getTabProps(t)}>{t}</button>
        ))}
      </div>
      <div {...getPanelProps(active)}>{active} panel content</div>
    </div>
  );
}

describe("useTabList", () => {
  it("wires tablist/tab/tabpanel roles, aria-selected, and roving tabindex", () => {
    render(<TestTabs />);
    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    const active = screen.getByRole("tab", { name: "one" });
    const inactive = screen.getByRole("tab", { name: "two" });
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(inactive.getAttribute("aria-selected")).toBe("false");
    expect(active.getAttribute("tabindex")).toBe("0");
    expect(inactive.getAttribute("tabindex")).toBe("-1"); // not in the normal Tab order

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(active.id);
    expect(active.getAttribute("aria-controls")).toBe(panel.id);
    expect(tablist).toBeTruthy();
  });

  it("ArrowRight activates the next tab and moves focus to it", () => {
    render(<TestTabs />);
    const one = screen.getByRole("tab", { name: "one" });
    const two = screen.getByRole("tab", { name: "two" });
    one.focus();

    fireEvent.keyDown(one, { key: "ArrowRight" });

    expect(two.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(two);
    expect(screen.getByRole("tabpanel").textContent).toContain("two panel content");
  });

  it("ArrowRight wraps from the last tab back to the first", () => {
    render(<TestTabs />);
    const three = screen.getByRole("tab", { name: "three" });
    const one = screen.getByRole("tab", { name: "one" });
    fireEvent.keyDown(one, { key: "ArrowLeft" }); // one -> three (wrap backward first, to reach "three" without 2 steps)
    expect(three.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(three, { key: "ArrowRight" }); // three -> one (wrap forward)
    expect(one.getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowLeft activates the previous tab", () => {
    render(<TestTabs />);
    const one = screen.getByRole("tab", { name: "one" });
    const three = screen.getByRole("tab", { name: "three" });
    fireEvent.keyDown(one, { key: "ArrowLeft" });
    expect(three.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(three);
  });

  it("Home jumps to the first tab, End jumps to the last", () => {
    render(<TestTabs />);
    const one = screen.getByRole("tab", { name: "one" });
    const three = screen.getByRole("tab", { name: "three" });

    fireEvent.keyDown(one, { key: "End" });
    expect(three.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(three, { key: "Home" });
    expect(one.getAttribute("aria-selected")).toBe("true");
  });

  it("ignores unrelated keys", () => {
    render(<TestTabs />);
    const one = screen.getByRole("tab", { name: "one" });
    fireEvent.keyDown(one, { key: "a" });
    expect(one.getAttribute("aria-selected")).toBe("true"); // unchanged
  });
});
