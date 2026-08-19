// app_34's actual product claim: "every citation must resolve to a real
// file:line." The centerpiece here is validateCitations and the guard
// proving a model that invents a location gets caught, not trusted.
import { describe, it, expect, vi } from "vitest";
import { answerFromCode, validateCitations, type NotebookCitation } from "./notebook-qa.js";

function retrieved(n: number): NotebookCitation[] {
  return Array.from({ length: n }, (_, i) => ({
    file_path: `src/file${i}.ts`,
    line_number: i + 1,
    content: `export function fn${i}() {}`,
  }));
}

describe("validateCitations — the enforcement point", () => {
  it("keeps a citation that matches a retrieved row exactly", () => {
    const rows = retrieved(3);
    const { valid, rejectedCount } = validateCitations([{ file_path: "src/file1.ts", line_number: 2 }], rows);
    expect(valid).toEqual([rows[1]]);
    expect(rejectedCount).toBe(0);
  });

  it("REJECTS a citation to a file that was never retrieved — the fabrication case", () => {
    const rows = retrieved(2);
    const { valid, rejectedCount } = validateCitations(
      [{ file_path: "src/invented-file.ts", line_number: 999 }],
      rows,
    );
    expect(valid).toEqual([]);
    expect(rejectedCount).toBe(1);
  });

  it("rejects a real file at the WRONG line — proximity is not a match", () => {
    const rows = retrieved(2);
    const { valid, rejectedCount } = validateCitations([{ file_path: "src/file0.ts", line_number: 50 }], rows);
    expect(valid).toEqual([]);
    expect(rejectedCount).toBe(1);
  });

  it("partial batch: real citations pass, fabricated ones are dropped, count is exact", () => {
    const rows = retrieved(3);
    const { valid, rejectedCount } = validateCitations(
      [
        { file_path: "src/file0.ts", line_number: 1 },
        { file_path: "src/made-up.ts", line_number: 1 },
        { file_path: "src/file2.ts", line_number: 3 },
      ],
      rows,
    );
    expect(valid).toHaveLength(2);
    expect(rejectedCount).toBe(1);
  });
});

describe("answerFromCode — real states, no fabrication", () => {
  it("no matches found: says so honestly, does not call the LLM", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const completion = vi.fn();
    const result = await answerFromCode("snap-1", "what does nothing do", { search, completion });
    expect(result.citations).toEqual([]);
    expect(result.answer).toBeNull();
    expect(completion).not.toHaveBeenCalled(); // no context to synthesize from
  });

  it("no LLM configured: returns the real grounded snippets, not a fabricated narrative", async () => {
    const rows = [{ file_path: "src/a.ts", line_number: 4, content: "export const x = 1;", rank: 10 }];
    const search = vi.fn().mockResolvedValue(rows);
    const llmConfigured = vi.fn().mockResolvedValue(false);
    const completion = vi.fn();
    const result = await answerFromCode("snap-1", "what is x", { search, llmConfigured, completion });
    expect(result.synthesized).toBe(false);
    expect(result.citations).toEqual([{ file_path: "src/a.ts", line_number: 4, content: "export const x = 1;" }]);
    expect(completion).not.toHaveBeenCalled();
  });

  it("LLM synthesizes an answer using only real citations from the retrieved set", async () => {
    const rows = [
      { file_path: "src/db.ts", line_number: 12, content: "export function connect() { ... }", rank: 20 },
    ];
    const search = vi.fn().mockResolvedValue(rows);
    const llmConfigured = vi.fn().mockResolvedValue(true);
    const completion = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        answer: "The connect function opens the database connection.",
        citations: [{ file_path: "src/db.ts", line_number: 12 }],
      }),
      model_used: "test-model",
    });
    const result = await answerFromCode("snap-1", "how does db connect work", { search, llmConfigured, completion });
    expect(result.synthesized).toBe(true);
    expect(result.answer).toContain("connect function");
    expect(result.citations).toEqual([{ file_path: "src/db.ts", line_number: 12, content: "export function connect() { ... }" }]);
    expect(result.rejected_citation_count).toBe(0);
  });

  // ─── the failure mode this whole module exists to prevent ──────
  it("THE CORE GUARD: a model that invents a citation has it silently dropped, not trusted", async () => {
    const rows = [{ file_path: "src/real.ts", line_number: 5, content: "real content", rank: 10 }];
    const search = vi.fn().mockResolvedValue(rows);
    const llmConfigured = vi.fn().mockResolvedValue(true);
    // The model cites a REAL file (src/real.ts) but at a line it was never
    // shown, AND a file that was never retrieved at all — both must be caught.
    const completion = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        answer: "Fabricated answer citing places it never saw.",
        citations: [
          { file_path: "src/real.ts", line_number: 999 },
          { file_path: "src/never-retrieved.ts", line_number: 1 },
        ],
      }),
      model_used: "test-model",
    });
    const result = await answerFromCode("snap-1", "anything", { search, llmConfigured, completion });
    expect(result.citations).toEqual([]);
    expect(result.rejected_citation_count).toBe(2);
    // The answer text still comes through — losing a bad citation degrades
    // the response; it should not also throw away a usable answer.
    expect(result.answer).toBe("Fabricated answer citing places it never saw.");
  });

  it("LLM configured but not usable (network/native error _not_configured mid-call): falls back to real snippets", async () => {
    const rows = [{ file_path: "src/a.ts", line_number: 1, content: "x", rank: 5 }];
    const search = vi.fn().mockResolvedValue(rows);
    const llmConfigured = vi.fn().mockResolvedValue(true);
    const completion = vi.fn().mockResolvedValue({ _not_configured: true, model_path: "x", hint: "x" });
    const result = await answerFromCode("snap-1", "q", { search, llmConfigured, completion });
    expect(result.synthesized).toBe(false);
    expect(result.citations).toEqual(rows.map((r) => ({ file_path: r.file_path, line_number: r.line_number, content: r.content })));
  });

  it("malformed/unparseable model output falls back to real snippets rather than surfacing garbage", async () => {
    const rows = [{ file_path: "src/a.ts", line_number: 1, content: "x", rank: 5 }];
    const search = vi.fn().mockResolvedValue(rows);
    const llmConfigured = vi.fn().mockResolvedValue(true);
    const completion = vi.fn().mockResolvedValue({ text: "not json at all {{{", model_used: "m" });
    const result = await answerFromCode("snap-1", "q", { search, llmConfigured, completion });
    expect(result.synthesized).toBe(false);
    expect(result.answer).toBeNull();
    expect(result.citations.length).toBe(1);
  });

  it("passes the question and snapshot id through to the search call", async () => {
    const search = vi.fn().mockResolvedValue([]);
    await answerFromCode("snap-42", "how does auth work", { search, completion: vi.fn() });
    expect(search).toHaveBeenCalledWith("snap-42", "how does auth work", { limit: 8 });
  });
});
