/**
 * @vitest-environment happy-dom
 */

// WO-F4 shared primitives — behavior tests: rendering contracts, the
// CodeBlock copy interaction, the Callout details disclosure (the raw-error
// home), chart mark/label generation, and the PageFooter link set.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  BarChart,
  Callout,
  CodeBlock,
  EmptyState,
  MarkdownLite,
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

describe("MarkdownLite (WO-P6)", () => {
  it("renders headings offset into h3..h6, paragraphs, and a horizontal rule", () => {
    render(<MarkdownLite text={"# Title\n\nA paragraph.\n\n---\n\n###### Deep heading"} />);
    expect(screen.getByRole("heading", { level: 3, name: "Title" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 6, name: "Deep heading" })).toBeTruthy();
    expect(screen.getByText("A paragraph.")).toBeTruthy();
  });

  it("renders bold, italic, and inline code as real elements", () => {
    render(<MarkdownLite text={"Some **bold**, *italic*, __also bold__, _also italic_, and `code`."} />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("also bold").tagName).toBe("STRONG");
    expect(screen.getByText("also italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("renders a safe http(s)/mailto link with target=_blank and rel=noopener", () => {
    render(<MarkdownLite text="See [the docs](https://example.test/docs) for more." />);
    const link = screen.getByRole("link", { name: "the docs" });
    expect(link.getAttribute("href")).toBe("https://example.test/docs");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("never creates an anchor for an unsafe link scheme — label renders as plain text", () => {
    const { container } = render(<MarkdownLite text="[go](javascript:alert(1))" />);
    const dangerous = [...container.querySelectorAll("a")].find((a) => (a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:"));
    expect(dangerous).toBeUndefined();
  });

  it("never injects raw HTML from source text — tags render as literal, escaped text", () => {
    const { container } = render(<MarkdownLite text={"See <img src=x onerror=alert(1)> and <script>alert(2)</script> here."} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.textContent).toContain("<script>alert(2)</script>");
  });

  it("renders fenced code blocks verbatim, ignoring inline-markdown-looking content inside them", () => {
    const { container } = render(<MarkdownLite text={"```ts\nconst x = 1; // *not* italic\n```"} />);
    const code = container.querySelector("pre.md-lite-code code")!;
    expect(code.textContent).toBe("const x = 1; // *not* italic");
    expect(code.querySelector("em")).toBeNull();
  });

  it("renders unordered and ordered lists", () => {
    render(<MarkdownLite text={"- one\n- two\n\n1. first\n2. second"} />);
    expect(screen.getByText("one").closest("ul")).toBeTruthy();
    expect(screen.getByText("two").closest("ul")).toBeTruthy();
    expect(screen.getByText("first").closest("ol")).toBeTruthy();
    expect(screen.getByText("second").closest("ol")).toBeTruthy();
  });

  it("renders a block quote", () => {
    render(<MarkdownLite text="> Quoted wisdom." />);
    expect(screen.getByText("Quoted wisdom.").closest("blockquote")).toBeTruthy();
  });

  it("does not treat two separate, unpaired asterisks (e.g. glob patterns) as one long italic run", () => {
    const { container } = render(<MarkdownLite text="Exclude *.test.ts and *.spec.ts files." />);
    expect(container.querySelector("em")).toBeNull();
    expect(container.querySelector(".md-lite-p")?.textContent).toBe("Exclude *.test.ts and *.spec.ts files.");
  });

  it("renders a GFM pipe table (WO-P9 — the agentic-purchasing generators emit these heavily)", () => {
    const { container } = render(<MarkdownLite text={"| Field | Value |\n|-------|-------|\n| Project | fixture-repo |\n| Language | TypeScript |"} />);
    const table = container.querySelector("table.md-lite-table")!;
    expect(table).toBeTruthy();
    const headers = [...table.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).toEqual(["Field", "Value"]);
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toEqual([["Project", "fixture-repo"], ["Language", "TypeScript"]]);
  });

  it("renders inline spans (bold, code) inside table cells", () => {
    render(<MarkdownLite text={"| Provider | Status |\n|---|---|\n| Stripe | **detected** in `payments.ts` |"} />);
    const cell = screen.getByText("Stripe").closest("tr")!;
    expect(within(cell).getByText("detected").tagName).toBe("STRONG");
    expect(within(cell).getByText("payments.ts").tagName).toBe("CODE");
  });

  it("a table with no outer pipes on its rows still parses (GFM allows omitting them)", () => {
    const { container } = render(<MarkdownLite text={"Field | Value\n---|---\nName | fixture"} />);
    const table = container.querySelector("table.md-lite-table")!;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Field", "Value"]);
  });

  it("a lone '|'-bearing line with no following separator is NOT mistaken for a table (falls through to a paragraph)", () => {
    const { container } = render(<MarkdownLite text="This sentence uses a pipe | character but isn't a table." />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".md-lite-p")).toBeTruthy();
  });

  it("returns null for empty input", () => {
    const { container } = render(<MarkdownLite text="" />);
    expect(container.firstChild).toBeNull();
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
