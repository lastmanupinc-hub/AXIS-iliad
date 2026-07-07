/**
 * @vitest-environment happy-dom
 */

// WO-F4 shared primitives — behavior tests: rendering contracts, the
// CodeBlock copy interaction, the Callout details disclosure (the raw-error
// home), chart mark/label generation, and the PageFooter link set.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  BarChart,
  Callout,
  CodeBlock,
  EmptyState,
  PageFooter,
  Pill,
  SectionHeader,
  Skeleton,
  Sparkline,
  StatTile,
  TableWrap,
  formatCompact,
  niceCeil,
} from "./index.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StatTile", () => {
  it("renders label, locale-formatted numeric value, delta, hint, and trend slot", () => {
    render(
      <StatTile
        label="Runs this month"
        value={1284}
        delta={{ text: "+12% vs last month", sentiment: "good" }}
        hint="sample"
        trend={<span data-testid="trend-slot" />}
      />,
    );
    expect(screen.getByText("Runs this month")).toBeTruthy();
    expect(screen.getByText((1284).toLocaleString())).toBeTruthy();
    expect(screen.getByText("+12% vs last month")).toBeTruthy();
    expect(screen.getByText("sample")).toBeTruthy();
    expect(screen.getByTestId("trend-slot")).toBeTruthy();
  });

  it("colors the delta by sentiment class", () => {
    const { container } = render(<StatTile label="Failed" value={7} delta={{ text: "+3", sentiment: "bad" }} />);
    expect(container.querySelector(".stat-delta-bad")).toBeTruthy();
  });
});

describe("SectionHeader", () => {
  it("renders title + sub, and actions when start-aligned", () => {
    render(<SectionHeader title="Projects" sub="All analyzed repos" actions={<button>New</button>} />);
    expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.getByText("All analyzed repos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  });

  it("centers without actions for align=center", () => {
    const { container } = render(<SectionHeader title="Hero" align="center" actions={<button>hidden</button>} />);
    expect(container.querySelector(".section-header-center")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "hidden" })).toBeNull();
  });
});

describe("CodeBlock", () => {
  it("renders the code and copies it to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<CodeBlock code={'{"a":1}'} label="config.json" />);
    expect(screen.getByText("config.json")).toBeTruthy();
    expect(screen.getByText('{"a":1}')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith('{"a":1}');
    await waitFor(() => expect(screen.getByText("Copied!")).toBeTruthy());
  });
});

describe("TableWrap", () => {
  it("is a labeled, keyboard-focusable scroll region", () => {
    render(
      <TableWrap label="Billing history">
        <table><tbody><tr><td>row</td></tr></tbody></table>
      </TableWrap>,
    );
    const region = screen.getByRole("region", { name: "Billing history" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("table-wrap");
  });
});

describe("Callout", () => {
  it("renders tone classes and role=alert only for danger", () => {
    const { container: info } = render(<Callout tone="info" title="Note">body</Callout>);
    expect(info.querySelector(".callout-info")).toBeTruthy();
    expect(info.querySelector("[role='alert']")).toBeNull();

    const { container: danger } = render(<Callout tone="danger" title="Failed" />);
    expect(danger.querySelector(".callout-danger[role='alert']")).toBeTruthy();
  });

  it("hides raw details behind a collapsed disclosure — never headline text", () => {
    const raw = "<html>502 Bad Gateway</html>";
    const { container } = render(
      <Callout tone="danger" title="The server hit an unexpected error — try again shortly." details={raw} />,
    );
    const details = container.querySelector("details.callout-details");
    expect(details).toBeTruthy();
    expect(details!.hasAttribute("open")).toBe(false); // collapsed by default
    expect(screen.getByText("Technical details")).toBeTruthy();
    expect(details!.querySelector("pre")!.textContent).toBe(raw);
  });
});

describe("Pill", () => {
  it("renders tone variants and mono", () => {
    const { container } = render(
      <>
        <Pill>plain</Pill>
        <Pill tone="accent">acc</Pill>
        <Pill tone="outline" mono>out</Pill>
      </>,
    );
    expect(container.querySelectorAll(".pill").length).toBe(3);
    expect(container.querySelector(".pill-accent")).toBeTruthy();
    expect(container.querySelector(".pill-outline.mono")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("is decorative (aria-hidden) and stacks the requested line count", () => {
    const { container } = render(<Skeleton lines={4} />);
    const stack = container.querySelector("[aria-hidden='true']");
    expect(stack).toBeTruthy();
    expect(container.querySelectorAll(".skeleton").length).toBe(4);
  });

  it("renders a single block by default", () => {
    const { container } = render(<Skeleton height={120} />);
    const el = container.querySelector(".skeleton");
    expect(el).toBeTruthy();
    expect(el!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("EmptyState", () => {
  it("renders icon, title, message, and fires the CTA", () => {
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState icon="scan" title="No projects yet" message="Analyze a repo first." cta={{ label: "Analyze", onClick }} />,
    );
    expect(container.querySelector(".empty-state-icon svg")).toBeTruthy();
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.getByText("Analyze a repo first.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("format helpers", () => {
  it("formatCompact compacts thousands and millions", () => {
    expect(formatCompact(812)).toBe("812");
    expect(formatCompact(1284)).toBe("1.3K");
    expect(formatCompact(2000)).toBe("2K");
    expect(formatCompact(4_200_000)).toBe("4.2M");
    expect(formatCompact(0)).toBe("0");
  });

  it("niceCeil rounds up to clean axis numbers", () => {
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(21)).toBe(25);
    expect(niceCeil(50)).toBe(50);
    expect(niceCeil(0.4)).toBe(0.5);
    expect(niceCeil(0)).toBe(1);
  });
});

describe("Sparkline", () => {
  const DATA = [3, 5, 4, 8, 7, 12];

  it("summarizes the series in the aria-label (values reachable without hover)", () => {
    render(<Sparkline data={DATA} label="Daily runs" />);
    const svg = screen.getByRole("img", { name: /Daily runs: 6 points, latest 12, min 3, max 12/ });
    expect(svg).toBeTruthy();
  });

  it("draws a 2px round-capped line and a surface-ringed end dot", () => {
    const { container } = render(<Sparkline data={DATA} />);
    const line = container.querySelector("path[stroke-width='2'][stroke-linecap='round']");
    expect(line).toBeTruthy();
    const dot = container.querySelector("circle");
    expect(dot!.getAttribute("r")).toBe("4");
    expect(dot!.getAttribute("stroke-width")).toBe("2");
  });

  it("steps the readout with arrow keys on focus", () => {
    const { container } = render(<Sparkline data={DATA} pointLabels={["a", "b", "c", "d", "e", "f"]} />);
    const svg = container.querySelector("svg")!;
    fireEvent.focus(svg); // readout starts at the latest point
    expect(container.querySelector(".chart-tip")!.textContent).toContain("12");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(container.querySelector(".chart-tip")!.textContent).toContain("7");
    expect(container.querySelector(".chart-tip")!.textContent).toContain("e");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(container.querySelector(".chart-tip")).toBeNull();
  });

  it("renders a 'no data' fallback for an empty series", () => {
    render(<Sparkline data={[]} />);
    expect(screen.getByText("no data")).toBeTruthy();
  });
});

describe("BarChart", () => {
  const DATA = [
    { label: "Mon", value: 4 },
    { label: "Tue", value: 0 },
    { label: "Wed", value: 9 },
  ];

  it("draws one mark per non-zero value and labels every band for assistive tech", () => {
    const { container } = render(<BarChart data={DATA} label="Runs per day" />);
    // 2 bars (zero draws no mark) + hairline gridlines present.
    expect(container.querySelectorAll("path[fill='var(--accent)']").length).toBe(2);
    expect(screen.getByRole("img", { name: "Tue: 0" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Wed: 9" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Runs per day" })).toBeTruthy();
  });

  it("shows a value-first tooltip on hover and on keyboard focus", () => {
    const { container } = render(<BarChart data={DATA} />);
    const hit = screen.getByRole("img", { name: "Wed: 9" });
    fireEvent.mouseEnter(hit);
    const tip = container.querySelector(".chart-tip")!;
    expect(tip.querySelector(".chart-tip-value")!.textContent).toBe("9");
    expect(tip.querySelector(".chart-tip-label")!.textContent).toBe("Wed");
    fireEvent.mouseLeave(hit);
    expect(container.querySelector(".chart-tip")).toBeNull();
    fireEvent.focus(screen.getByRole("img", { name: "Mon: 4" }));
    expect(container.querySelector(".chart-tip-value")!.textContent).toBe("4");
  });

  it("renders clean-number ticks including zero and the nice max", () => {
    const { container } = render(<BarChart data={DATA} />);
    const texts = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toContain("0");
    expect(texts).toContain("10"); // niceCeil(9)
  });

  it("renders an empty state for no data", () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText("No data to chart yet.")).toBeTruthy();
  });
});

describe("PageFooter", () => {
  it("renders Terms · Status · version · Support · Help · Docs and navigates", () => {
    const onNavigate = vi.fn();
    const { container } = render(<PageFooter onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(onNavigate).toHaveBeenCalledWith("terms");
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onNavigate).toHaveBeenCalledWith("help");
    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    expect(onNavigate).toHaveBeenCalledWith("docs");

    // Status: a real live destination (health endpoint) until WO-P17's #status page.
    const status = screen.getByRole("link", { name: "Status" });
    expect(status.getAttribute("href")).toContain("/v1/health");

    const support = screen.getByRole("link", { name: "Support" });
    expect(support.getAttribute("href")).toBe("mailto:support@jonathanarvay.com");

    expect(container.textContent).toMatch(/v\d+\.\d+\.\d+/); // version badge
    expect(container.textContent).toContain("Last Man Up Inc.");
  });
});
