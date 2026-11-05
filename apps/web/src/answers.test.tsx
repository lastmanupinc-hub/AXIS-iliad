/**
 * @vitest-environment happy-dom
 */

// The answer pages (2026-11-04, the estate's foundation check F09) hold the shape that check reads in the served
// HTML (D:/Estate Presence/scripts/foundation.py, answer_page_verdict and PageFacts): the H1, then directly the
// 40-60 word answer as the first paragraph after it, a visible dated <time>, a #sources section with a link, a
// self-canonical without a trailing slash, and a sitemap entry. The prices in answers.ts are held to the pricing code by
// apps/api/src/answer-pages.test.ts.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ANSWERS, PRICING, answerWords } from "./answers.ts";
import { PROD_API_BASE } from "./config.ts";
import { AnswerPage } from "./pages/AnswerPage.tsx";
import { hrefForPage, matchPathname, routeForPage } from "./routes.tsx";
import { seoRoutes } from "../seo.routes.ts";
import { buildMeta, pageUrl } from "./plugins/axis-seo/schema.ts";
import { defineSeoConfig } from "./plugins/axis-seo/config.ts";

afterEach(cleanup);

const DECLARED = [
  ["/what-is-iliad", "What is Axis' Iliad and what does it produce from a repository?"],
  ["/what-does-iliad-cost", "What does an Iliad analysis cost?"],
  ["/how-to-connect-iliad-mcp", "How do I connect Iliad to Claude, Cursor or VS Code?"],
] as const;

/** The first <p> after the first <h1>, as the estate's check reads it (text only, whitespace collapsed). */
function leadAfterH1(root: HTMLElement): { h1: string | null; lead: string | null } {
  const h1 = root.querySelector("h1");
  if (!h1) return { h1: null, lead: null };
  const all = [...root.querySelectorAll("h1, p")];
  const p = all.slice(all.indexOf(h1) + 1).find((el) => el.tagName === "P");
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return { h1: clean(h1.textContent), lead: p ? clean(p.textContent) : null };
}

describe("answer pages", () => {
  it("are exactly the owner's three questions, at the declared paths", () => {
    expect(ANSWERS.map((a) => [a.path, a.question])).toEqual(DECLARED.map(([p, q]) => [p, q]));
  });

  for (const a of ANSWERS) {
    describe(a.path, () => {
      it("answers in 40-60 words", () => {
        const words = answerWords(a.answer);
        expect(words, a.answer).toBeGreaterThanOrEqual(40);
        expect(words, a.answer).toBeLessThanOrEqual(60);
      });

      it("renders the H1, then the answer as the very next paragraph, a dated <time>, and sources with links", () => {
        const { container } = render(<AnswerPage answer={a} />);
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        const { h1, lead } = leadAfterH1(container);
        expect(h1).toBe(a.question);
        expect(lead).toBe(a.answer);
        const time = container.querySelector("time[datetime]");
        expect(time?.getAttribute("datetime")).toBe(a.updated);
        const links = container.querySelectorAll("#sources a[href]");
        expect(links.length).toBeGreaterThanOrEqual(1);
      });

      it("is a flat route the router resolves at its exact path, with or without the slash", () => {
        const def = routeForPage(a.page);
        expect(def.flat).toBe(true);
        expect(hrefForPage(a.page)).toBe(a.path);
        expect(matchPathname(a.path)?.route.page).toBe(a.page);
        expect(matchPathname(`${a.path}/`)?.route.page).toBe(a.page);
      });

      it("is prerendered as a flat file with a self-canonical without the slash, and its question as the FAQ", () => {
        const r = seoRoutes.find((x) => x.path === a.path);
        expect(r?.flat).toBe(true);
        expect(r?.faq).toEqual([{ question: a.question, answer: a.answer }]);
        const config = defineSeoConfig({ siteUrl: "https://iliad.trustfabric.ai/", siteName: "Iliad" });
        expect(buildMeta({ ...r!, config }).canonical).toBe(`https://iliad.trustfabric.ai${a.path}`);
        expect(pageUrl("https://iliad.trustfabric.ai/", a.path, true)).toBe(`https://iliad.trustfabric.ai${a.path}`);
      });

      it("has a title and description scripts/seo-audit.mjs accepts (it reads content up to the first quote mark)", () => {
        expect(a.title.length).toBeGreaterThanOrEqual(10);
        expect(a.title.length).toBeLessThanOrEqual(60);
        expect(a.description.length, a.description).toBeGreaterThanOrEqual(50);
        expect(a.description.length, a.description).toBeLessThanOrEqual(160);
        expect(a.description).not.toMatch(/['"]/);
      });

      it("dates its facts with a real day", () => {
        expect(a.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(new Date(a.updated).getTime())).toBe(false);
      });
    });
  }

  it("cites outside sources where the fact is not ours (the client docs, the formats)", () => {
    for (const page of ["what-is-iliad", "how-to-connect-iliad-mcp"] as const) {
      const a = ANSWERS.find((x) => x.page === page)!;
      expect(a.sources.some((s) => /^https:\/\//.test(s.href) && !s.href.includes("trustfabric.ai")), page).toBe(true);
    }
  });

  it("gives the MCP endpoint the API serves and the header it reads", () => {
    const a = ANSWERS.find((x) => x.page === "how-to-connect-iliad-mcp")!;
    const mcp = `${PROD_API_BASE}/mcp`;
    expect(a.answer).toContain(mcp);
    expect(a.answer).toContain("Authorization: Bearer");
    const code = a.sections.flatMap((s) => s.code ?? []).map((c) => c.text).join("\n");
    expect(code).toContain(`claude mcp add --transport http axis-iliad ${mcp} --header "Authorization: Bearer YOUR_API_KEY"`);
    expect(code).not.toContain("--url");
  });

  it("writes PRICING's numbers into the cost answer (PRICING itself is held to the code by apps/api)", () => {
    const a = ANSWERS.find((x) => x.page === "what-does-iliad-cost")!.answer;
    expect(a).toContain(`$${(PRICING.analyzeStandardCents / 100).toFixed(2)}`);
    expect(a).toContain(PRICING.standardCredits.toLocaleString("en-US"));
    for (const p of PRICING.plans.filter((x) => x.monthlyCents > 0)) {
      expect(a).toContain(`$${p.monthlyCents / 100}`);
      expect(a).toContain(p.credits.toLocaleString("en-US"));
    }
  });

  it("states no usage numbers", () => {
    const text = JSON.stringify(ANSWERS);
    expect(text).not.toMatch(/\b\d[\d,.]*\+?\s*(users|developers|teams|customers|repos analyzed|runs a)\b/i);
  });
});
