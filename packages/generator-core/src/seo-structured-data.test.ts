import { describe, it, expect } from "vitest";
import { validateStructuredData, extractJsonLdBlocks } from "./seo-structured-data.js";

const wrap = (json: string): string => `<head><script type="application/ld+json">${json}</script></head>`;

describe("extractJsonLdBlocks", () => {
  it("finds every JSON-LD block regardless of attribute order or quoting", () => {
    const html = `
      <script type="application/ld+json">{"a":1}</script>
      <script data-x="y" type='application/ld+json'>{"b":2}</script>
      <script type="text/javascript">console.log("not ld+json")</script>`;
    expect(extractJsonLdBlocks(html)).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("returns nothing for markup with no structured data", () => {
    expect(extractJsonLdBlocks("<head><title>x</title></head>")).toEqual([]);
  });
});

describe("validateStructuredData", () => {
  it("accepts a well-formed SoftwareApplication node", () => {
    const r = validateStructuredData(
      wrap(JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "axis", applicationCategory: "DeveloperApplication" })),
    );
    expect(r.ok).toBe(true);
    expect(r.blocks).toBe(1);
    expect(r.issues).toEqual([]);
  });

  it("rejects malformed JSON with the parser's reason, not a generic failure", () => {
    const r = validateStructuredData(wrap('{"@type": '));
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toMatch(/not valid JSON/);
  });

  it("rejects a non-schema.org @context", () => {
    const r = validateStructuredData(wrap(JSON.stringify({ "@context": "https://example.com", "@type": "WebSite", name: "x" })));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /@context/.test(i.message))).toBe(true);
  });

  it("accepts http and a trailing slash on the schema.org context", () => {
    for (const context of ["http://schema.org", "https://schema.org/"]) {
      const r = validateStructuredData(wrap(JSON.stringify({ "@context": context, "@type": "WebSite", name: "x" })));
      expect(r.ok, context).toBe(true);
    }
  });

  it("rejects a missing @type", () => {
    const r = validateStructuredData(wrap(JSON.stringify({ "@context": "https://schema.org", name: "x" })));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /@type/.test(i.message))).toBe(true);
  });

  it("requires the per-type mandatory fields to be present AND non-empty", () => {
    const missing = validateStructuredData(wrap(JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "x" })));
    expect(missing.ok).toBe(false);
    expect(missing.issues.some((i) => /applicationCategory/.test(i.message))).toBe(true);

    // Present but blank is the subtler failure — a field that exists and says
    // nothing is not a satisfied requirement.
    const blank = validateStructuredData(wrap(JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "   " })));
    expect(blank.ok).toBe(false);
    expect(blank.issues.some((i) => /non-empty "name"/.test(i.message))).toBe(true);
  });

  it("rejects unfilled placeholders — shipping TODO into a user's head is worse than omitting the tag", () => {
    for (const placeholder of ["TODO", "TBD", "{{name}}", "<your-app>"]) {
      const r = validateStructuredData(wrap(JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: placeholder })));
      expect(r.ok, placeholder).toBe(false);
      expect(r.issues.some((i) => /placeholder/.test(i.message))).toBe(true);
    }
  });

  it("validates every node of a top-level array, not just the first", () => {
    const r = validateStructuredData(
      wrap(
        JSON.stringify([
          { "@context": "https://schema.org", "@type": "WebSite", name: "ok" },
          { "@context": "https://schema.org", "@type": "WebSite", name: "" },
        ]),
      ),
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
  });

  it("reports which block failed when a document has several", () => {
    const good = JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "ok" });
    const bad = JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite" });
    const r = validateStructuredData(`${wrap(good)}${wrap(bad)}`);
    expect(r.blocks).toBe(2);
    expect(r.issues[0].block).toBe(2);
  });

  it("is vacuously ok for markup containing no structured data at all", () => {
    const r = validateStructuredData("<head><title>x</title></head>");
    expect(r).toEqual({ ok: true, blocks: 0, issues: [] });
  });
});
