import { describe, it, expect, beforeEach } from "vitest";
import {
  addDocument,
  addDocuments,
  searchDocuments,
  deleteDocument,
  deleteSearchNamespace,
  countSearchDocuments,
  scopeSearchNamespace,
  tokenize,
  resetWebSearchForTests,
  answerFromHits,
  type SearchHit,
} from "./web-search.js";

describe("web-search — tokenize", () => {
  it("lowercases and splits on non-word chars", () => {
    expect(tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("drops single-char tokens and stop words", () => {
    expect(tokenize("a quick brown fox in the box")).toEqual(["quick", "brown", "fox", "box"]);
  });

  it("keeps digits and underscores", () => {
    expect(tokenize("payment_intent_123 succeeded")).toEqual(["payment_intent_123", "succeeded"]);
  });

  it("returns [] for empty / non-string input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(null as unknown as string)).toEqual([]);
  });
});

describe("web-search — addDocument", () => {
  beforeEach(() => resetWebSearchForTests());

  it("inserts a document and increments count", () => {
    addDocument("ns1", { doc_id: "d1", content: "axis iliad is great" });
    expect(countSearchDocuments("ns1")).toBe(1);
  });

  it("upserts on duplicate doc_id (overwrites, count stays 1)", () => {
    addDocument("ns1", { doc_id: "d1", content: "first" });
    addDocument("ns1", { doc_id: "d1", content: "second" });
    expect(countSearchDocuments("ns1")).toBe(1);
  });

  it("rejects empty doc_id", () => {
    expect(() => addDocument("ns1", { doc_id: "", content: "x" })).toThrow(/doc_id/);
  });

  it("rejects oversized doc_id", () => {
    expect(() => addDocument("ns1", { doc_id: "x".repeat(201), content: "x" })).toThrow(/doc_id/);
  });

  it("rejects empty content", () => {
    expect(() => addDocument("ns1", { doc_id: "d1", content: "" })).toThrow(/content/);
  });

  it("rejects oversized content (>1 MiB)", () => {
    const big = "x".repeat(1_100_000);
    expect(() => addDocument("ns1", { doc_id: "d1", content: big })).toThrow(/content exceeds/);
  });

  it("rejects array as metadata (must be plain object)", () => {
    expect(() =>
      addDocument("ns1", {
        doc_id: "d1",
        content: "x",
        metadata: [] as unknown as Record<string, unknown>,
      }),
    ).toThrow(/plain object/);
  });

  it("stores optional url + title + metadata cleanly", () => {
    addDocument("ns1", {
      doc_id: "d1",
      url: "https://example.com/docs/intro",
      title: "Intro to AXIS",
      content: "axis is a deterministic codebase analyzer",
      metadata: { section: "intro", tags: ["onboarding"] },
    });
    const hits = searchDocuments("ns1", { query: "axis deterministic" });
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://example.com/docs/intro");
    expect(hits[0].title).toBe("Intro to AXIS");
    expect((hits[0].metadata as { section?: string }).section).toBe("intro");
  });
});

describe("web-search — addDocuments (batch)", () => {
  beforeEach(() => resetWebSearchForTests());

  it("inserts every doc in the batch", () => {
    addDocuments("ns1", [
      { doc_id: "d1", content: "alpha" },
      { doc_id: "d2", content: "beta" },
      { doc_id: "d3", content: "gamma" },
    ]);
    expect(countSearchDocuments("ns1")).toBe(3);
  });

  it("rolls back on malformed entry (transactional)", () => {
    expect(() =>
      addDocuments("ns1", [
        { doc_id: "d1", content: "ok" },
        { doc_id: "", content: "bad" },
        { doc_id: "d3", content: "ok" },
      ]),
    ).toThrow();
    expect(countSearchDocuments("ns1")).toBe(0);
  });

  it("rejects empty batch", () => {
    expect(() => addDocuments("ns1", [])).toThrow(/non-empty/);
  });
});

describe("web-search — searchDocuments BM25 ranking", () => {
  beforeEach(() => resetWebSearchForTests());

  it("returns [] when no docs are indexed", () => {
    expect(searchDocuments("ns1", { query: "anything" })).toEqual([]);
  });

  it("scores docs by query relevance, top match first", () => {
    addDocuments("ns1", [
      { doc_id: "d_relevant", title: "Axis Iliad", content: "axis iliad axis iliad axis iliad" },
      { doc_id: "d_partial", content: "axis is one of many words here" },
      { doc_id: "d_unrelated", content: "nothing about the topic at all" },
    ]);
    const hits = searchDocuments("ns1", { query: "axis iliad" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc_id).toBe("d_relevant");
    // d_unrelated should be omitted since it has zero query tokens.
    expect(hits.find((h) => h.doc_id === "d_unrelated")).toBeUndefined();
  });

  it("respects max_results cap", () => {
    addDocuments("ns1", Array.from({ length: 20 }).map((_, i) => ({
      doc_id: `d${i}`,
      content: `axis document number ${i}`,
    })));
    const hits = searchDocuments("ns1", { query: "axis", max_results: 5 });
    expect(hits).toHaveLength(5);
  });

  it("clamps max_results to HARD_MAX_RESULTS (100)", () => {
    addDocuments("ns1", Array.from({ length: 5 }).map((_, i) => ({
      doc_id: `d${i}`,
      content: `axis ${i}`,
    })));
    const hits = searchDocuments("ns1", { query: "axis", max_results: 999_999 });
    expect(hits).toHaveLength(5);
  });

  it("filters by site host (case-insensitive)", () => {
    addDocuments("ns1", [
      { doc_id: "d_docs", url: "https://docs.python.org/tutorial", content: "axis python tutorial" },
      { doc_id: "d_blog", url: "https://blog.example.com/post", content: "axis blog post" },
    ]);
    const hits = searchDocuments("ns1", { query: "axis", site: "DOCS.PYTHON.ORG" });
    expect(hits).toHaveLength(1);
    expect(hits[0].doc_id).toBe("d_docs");
  });

  it("returns empty when site host filter matches nothing", () => {
    addDocument("ns1", { doc_id: "d1", url: "https://example.com/p", content: "axis" });
    const hits = searchDocuments("ns1", { query: "axis", site: "other.com" });
    expect(hits).toEqual([]);
  });

  it("returns snippet centered on first matched token", () => {
    addDocument("ns1", {
      doc_id: "d1",
      content: "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod " +
        "tempor incididunt ut labore et dolore magna aliqua axis iliad search lorem ipsum",
    });
    const hits = searchDocuments("ns1", { query: "axis" });
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("axis");
    expect(hits[0].snippet.length).toBeLessThanOrEqual(241); // 240 + room for trailing ellipsis
  });

  it("rejects empty query", () => {
    expect(() => searchDocuments("ns1", { query: "" })).toThrow(/non-empty/);
  });

  it("rejects oversized query (>1024 chars)", () => {
    expect(() => searchDocuments("ns1", { query: "x".repeat(2000) })).toThrow(/query exceeds/);
  });

  it("rejects max_results = 0", () => {
    expect(() => searchDocuments("ns1", { query: "axis", max_results: 0 })).toThrow(/max_results/);
  });

  it("returns [] for query containing only stop words and short tokens", () => {
    addDocument("ns1", { doc_id: "d1", content: "axis iliad" });
    expect(searchDocuments("ns1", { query: "the a of in" })).toEqual([]);
  });
});

describe("web-search — namespace isolation", () => {
  beforeEach(() => resetWebSearchForTests());

  it("docs in one namespace are invisible to another", () => {
    addDocument("ns_a", { doc_id: "d1", content: "axis is great" });
    addDocument("ns_b", { doc_id: "d1", content: "axis is great" });
    expect(countSearchDocuments("ns_a")).toBe(1);
    expect(countSearchDocuments("ns_b")).toBe(1);
    const ha = searchDocuments("ns_a", { query: "axis" });
    const hb = searchDocuments("ns_b", { query: "axis" });
    expect(ha).toHaveLength(1);
    expect(hb).toHaveLength(1);
    // Same doc_id but isolated — both queries succeed independently.
  });

  it("deleteSearchNamespace only touches its target", () => {
    addDocument("ns_a", { doc_id: "d1", content: "axis" });
    addDocument("ns_b", { doc_id: "d1", content: "axis" });
    expect(deleteSearchNamespace("ns_a")).toBe(1);
    expect(countSearchDocuments("ns_a")).toBe(0);
    expect(countSearchDocuments("ns_b")).toBe(1);
  });

  it("deleteDocument removes a single row and returns true", () => {
    addDocuments("ns_a", [
      { doc_id: "d1", content: "axis" },
      { doc_id: "d2", content: "iliad" },
    ]);
    expect(deleteDocument("ns_a", "d1")).toBe(true);
    expect(countSearchDocuments("ns_a")).toBe(1);
  });

  it("deleteDocument returns false when doc is absent", () => {
    expect(deleteDocument("ns_a", "nonexistent")).toBe(false);
  });
});

describe("web-search — scopeSearchNamespace", () => {
  it("prefixes with account id", () => {
    expect(scopeSearchNamespace("acct_42", "kb")).toBe("acct:acct_42:kb");
  });

  it("defaults to 'default'", () => {
    expect(scopeSearchNamespace("acct_42", undefined)).toBe("acct:acct_42:default");
  });

  it("rejects path-traversal", () => {
    expect(() => scopeSearchNamespace("a", "../bad")).toThrow(/must not contain/);
    expect(() => scopeSearchNamespace("a", "x/y")).toThrow(/must not contain/);
    expect(() => scopeSearchNamespace("a", "x\\y")).toThrow(/must not contain/);
  });

  it("isolates two accounts that use the same logical namespace", () => {
    resetWebSearchForTests();
    const nsA = scopeSearchNamespace("acct_a", "kb");
    const nsB = scopeSearchNamespace("acct_b", "kb");
    addDocument(nsA, { doc_id: "d1", content: "alpha" });
    addDocument(nsB, { doc_id: "d1", content: "beta" });
    addDocument(nsB, { doc_id: "d2", content: "gamma" });
    expect(countSearchDocuments(nsA)).toBe(1);
    expect(countSearchDocuments(nsB)).toBe(2);
  });
});

// ─── Engineer tier (E3): Answer Engine ──────────────────────────
describe("web-search — Answer Engine (engineer tier)", () => {
  const hit = (doc_id: string, snippet: string, score: number, title: string | null = null): SearchHit => ({
    doc_id, url: `https://ex.com/${doc_id}`, title, snippet, score, metadata: null,
  });

  it("assembles a grounded answer with [n] citation spans from on-topic hits", () => {
    const hits = [
      hit("a", "AXIS is a deterministic codebase analyzer. It generates artifacts.", 2.0, "Intro"),
      hit("b", "The analyzer runs over any repo.", 1.5),
    ];
    const r = answerFromHits("deterministic codebase analyzer", hits, { max_citations: 2 });
    expect(r.refused).toBe(false);
    expect(r.answer).toContain("[1]");
    expect(r.citations.length).toBeGreaterThanOrEqual(1);
    expect(r.citations[0].doc_id).toBe("a");
    expect(r.citations[0].span.length).toBeGreaterThan(0);
  });

  it("lexical rerank pulls a broadly-covering hit above a single-term BM25 spike", () => {
    const hits = [
      hit("spike", "deterministic deterministic deterministic deterministic.", 9.0),
      hit("covers", "a deterministic codebase analyzer for repos.", 2.0),
    ];
    const r = answerFromHits("deterministic codebase analyzer", hits);
    expect(r.refused).toBe(false);
    expect(r.reranked[0].doc_id).toBe("covers"); // coverage beat the frequency spike
  });

  it("refuses on weak evidence (low query-term coverage)", () => {
    const r = answerFromHits("deterministic codebase analyzer", [hit("a", "an unrelated note about weather and traffic.", 0.4)]);
    expect(r.refused).toBe(true);
    expect(r.answer).toBe("");
    expect(r.reason).toMatch(/insufficient evidence/i);
  });

  it("refuses when there are no hits", () => {
    const r = answerFromHits("anything", []);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/no document/i);
  });
});
