import { describe, it, expect } from "vitest";
import { chunkMarkdown, extractToSchema, type CompletionFn } from "./document-engineer.js";

describe("chunkMarkdown", () => {
  it("starts a new chunk per heading and tracks the heading", () => {
    const chunks = chunkMarkdown("# Intro\nHello world.\n## Details\nMore text here.");
    expect(chunks.length).toBe(2);
    expect(chunks[0].heading).toBe("Intro");
    expect(chunks[0].text).toContain("Hello world");
    expect(chunks[1].heading).toBe("Details");
  });

  it("windows a long section with overlap, bounded by maxChars", () => {
    const chunks = chunkMarkdown("# Big\n" + "x".repeat(3000), { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.text.length <= 1000)).toBe(true);
    expect(chunks.every((c) => c.heading === "Big")).toBe(true);
  });

  it("handles content before any heading (heading null)", () => {
    const chunks = chunkMarkdown("plain text, no heading");
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBeNull();
  });

  it("is deterministic and returns [] for empty/whitespace input", () => {
    const md = "# A\ntext\n## B\nmore";
    expect(chunkMarkdown(md)).toEqual(chunkMarkdown(md));
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n  ")).toEqual([]);
  });
});

describe("extractToSchema", () => {
  const schema = { type: "object", required: ["title"], properties: { title: { type: "string" } } };

  it("extracts + validates a schema-matching object and passes the schema to the grammar", async () => {
    let passedSchema: unknown;
    const fake: CompletionFn = async (o) => {
      passedSchema = o.json_schema;
      return { text: '{"title":"Invoice 42"}' };
    };
    const r = await extractToSchema("# Invoice 42\nTotal: $9", schema, fake);
    expect(r.configured).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.parsed).toEqual({ title: "Invoice 42" });
    expect(passedSchema).toBe(schema);
  });

  it("flags schema-invalid extraction", async () => {
    const fake: CompletionFn = async () => ({ text: '{"title":123}' });
    const r = await extractToSchema("doc", schema, fake);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("degrades when no model is configured", async () => {
    const r = await extractToSchema("doc", schema, async () => ({ _not_configured: true }));
    expect(r.configured).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("degrades when the completion throws", async () => {
    const r = await extractToSchema("doc", schema, async () => {
      throw new Error("native load failed");
    });
    expect(r.configured).toBe(false);
  });
});
