import { describe, expect, it } from "vitest";
import { extractReadable, htmlToMarkdown } from "./html-extract.js";

describe("htmlToMarkdown — deterministic zero-dep serializer", () => {
  it("converts the WO-12 acceptance fragment (headings, links, lists, fenced code)", () => {
    const md = htmlToMarkdown(
      '<h1>T</h1><p>hi <a href="/x">L</a></p><ul><li>one</li><li>two</li></ul><pre><code>x=1</code></pre>',
    );
    expect(md).toContain("# T");
    expect(md).toContain("[L](/x)");
    expect(md).toContain("- one");
    expect(md).toContain("- two");
    expect(md).toContain("```\nx=1\n```");
  });

  it("is deterministic — same input, same output, every time", () => {
    const html =
      "<h2>Heading</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ol><li>first</li><li>second</li></ol>";
    const first = htmlToMarkdown(html);
    for (let i = 0; i < 5; i++) expect(htmlToMarkdown(html)).toBe(first);
  });

  it("renders heading levels, blockquotes, inline code, and hard breaks", () => {
    const md = htmlToMarkdown(
      "<h3>Three</h3><blockquote><p>quoted line</p></blockquote><p>call <code>fn()</code> now</p><p>a<br>b</p>",
    );
    expect(md).toContain("### Three");
    expect(md).toContain("> quoted line");
    expect(md).toContain("call `fn()` now");
    expect(md).toContain("a\nb");
  });

  it("renders ordered lists with 1./2. markers and nested lists indented", () => {
    const md = htmlToMarkdown("<ol><li>alpha<ul><li>inner</li></ul></li><li>beta</li></ol>");
    expect(md).toContain("1. alpha");
    expect(md).toContain("2. beta");
    expect(md).toMatch(/ {2}- inner/);
  });

  it("decodes HTML entities (named, decimal, hex)", () => {
    const md = htmlToMarkdown("<p>Fish &amp; chips &#8212; caf&#xE9; &lt;tag&gt;</p>");
    expect(md).toContain("Fish & chips — café <tag>");
  });

  it("drops script/style/noscript content entirely", () => {
    const md = htmlToMarkdown(
      "<p>keep</p><script>var secret = 'DROPME';</script><style>.x{color:red}</style><noscript>DROPME too</noscript>",
    );
    expect(md).toContain("keep");
    expect(md).not.toContain("DROPME");
    expect(md).not.toContain("color:red");
  });

  it("survives malformed HTML without throwing (unclosed + mismatched tags)", () => {
    const md = htmlToMarkdown("<div><p>open paragraph<li>stray item</b></div><p>tail");
    expect(md).toContain("open paragraph");
    expect(md).toContain("tail");
  });
});

describe("extractReadable — owned readability heuristic", () => {
  const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Extract &amp; Read</title>
  <meta name="description" content="A test description.">
  <meta name="author" content="A. Writer">
  <link rel="canonical" href="/canonical-path">
</head>
<body>
  <nav><a href="/">Home</a> <a href="/pricing">Pricing</a> NavChromeText</nav>
  <article>
    <h1>Main Story</h1>
    <p>This is the substantive article body that carries the real content of the page and is
    clearly longer and denser than any of the chrome around it, which is what the extractor keys on.</p>
    <p>See <a href="/related">related</a> and <a href="https://other.example.com/x">offsite</a>.</p>
  </article>
  <footer>FooterChromeText <a href="/terms">Terms</a></footer>
</body>
</html>`;

  it("keeps the article and drops nav/footer chrome when onlyMainContent=true", () => {
    const doc = extractReadable(PAGE, "https://site.example.com/post", true);
    expect(doc.markdown).toContain("# Main Story");
    expect(doc.markdown).toContain("substantive article body");
    expect(doc.markdown).not.toContain("NavChromeText");
    expect(doc.markdown).not.toContain("FooterChromeText");
    expect(doc.text).toContain("substantive article body");
    expect(doc.text).not.toContain("NavChromeText");
  });

  it("keeps the whole body (including chrome) when onlyMainContent=false", () => {
    const doc = extractReadable(PAGE, "https://site.example.com/post", false);
    expect(doc.markdown).toContain("NavChromeText");
    expect(doc.markdown).toContain("FooterChromeText");
    expect(doc.markdown).toContain("substantive article body");
  });

  it("extracts title + metadata (description, canonical, byline, lang) with entities decoded", () => {
    const doc = extractReadable(PAGE, "https://site.example.com/post", true);
    expect(doc.title).toBe("Extract & Read");
    expect(doc.metadata.title).toBe("Extract & Read");
    expect(doc.metadata.description).toBe("A test description.");
    expect(doc.metadata.canonical).toBe("https://site.example.com/canonical-path");
    expect(doc.metadata.byline).toBe("A. Writer");
    expect(doc.metadata.lang).toBe("en");
  });

  it("collects links document-wide (nav included), absolute against baseUrl, deduped", () => {
    const doc = extractReadable(PAGE, "https://site.example.com/post", true);
    expect(doc.links).toContain("https://site.example.com/");
    expect(doc.links).toContain("https://site.example.com/pricing");
    expect(doc.links).toContain("https://site.example.com/related");
    expect(doc.links).toContain("https://other.example.com/x");
    expect(new Set(doc.links).size).toBe(doc.links.length); // deduped
  });

  it("resolves in-markdown link hrefs to absolute URLs", () => {
    const doc = extractReadable(PAGE, "https://site.example.com/post", true);
    expect(doc.markdown).toContain("[related](https://site.example.com/related)");
  });

  it("falls back to text-density when there is no semantic container", () => {
    const html = `<html><head><title>Density</title></head><body>
      <div id="menu"><a href="/a">AAA</a> <a href="/b">BBB</a> <a href="/c">CCC</a> <a href="/d">DDD</a></div>
      <div id="content"><p>The dense content division holds a long run of plain prose with almost no links,
      so its non-link text mass dominates every other container on this page by a wide margin.</p></div>
    </body></html>`;
    const doc = extractReadable(html, "https://density.example.com/", true);
    expect(doc.markdown).toContain("dense content division");
    expect(doc.markdown).not.toContain("AAA");
  });

  it("ignores a decorative (near-empty) <article> and still finds the real content", () => {
    const html = `<html><body>
      <article><span>ad</span></article>
      <div><p>Real content lives here in a plain div, long enough to be the obvious main region of the
      document when the semantic candidate turns out to be an empty decorative shell element.</p></div>
    </body></html>`;
    const doc = extractReadable(html, "https://shell.example.com/", true);
    expect(doc.markdown).toContain("Real content lives here");
  });
});
