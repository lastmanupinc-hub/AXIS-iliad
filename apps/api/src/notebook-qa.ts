// ─── app_34: notebook → living knowledge base ─────────────────────
//
// "Answer questions with citations into CURRENT code (existing
// iliad_embeddings + vector DB); every citation must resolve to a real
// file:line." That last clause is the actual product, not a nice-to-have —
// a citation an agent cannot verify is worse than no citation, because it
// looks trustworthy while being unverifiable.
//
// RETRIEVAL is real and deterministic: searchSnapshotContent (pgvector-
// backed full-text search, already exists, already kept fresh for
// "search"-subscribed repos by search-index-watcher.ts) returns real
// {file_path, line_number, content} rows — nothing here can be fabricated,
// because it is a direct row read.
//
// SYNTHESIS (turning retrieved snippets into a natural-language answer) is
// optional and gated on isLlmConfigured(), same discipline as
// design-judge.ts: never invent, judge/answer ONLY from provided facts, and
// degrade to a real (if less readable) result rather than fail when no
// model is loaded.
//
// THE GUARD THAT MATTERS: an LLM asked to cite {file_path, line_number}
// pairs can still invent ones that were never in the retrieved set — that
// is not a hypothetical, it is the default failure mode of citation
// generation. validateCitations() checks every returned citation against
// the ACTUAL retrieved rows and drops anything that does not match. A
// dropped citation degrades the answer; a fabricated one that reached the
// caller would have been a lie wearing a page number.
import { searchSnapshotContent } from "@axis/snapshots";
import { runCompletion, isLlmConfigured } from "./llm-inference.js";
import { validateStructuredOutput } from "./json-schema-validate.js";

export interface NotebookCitation {
  file_path: string;
  line_number: number;
  /** The exact indexed content at this location — always real, never LLM-authored. */
  content: string;
}

export interface NotebookAnswer {
  question: string;
  /** null when no LLM is configured — see `synthesized`. */
  answer: string | null;
  /** Whether `answer` came from the LLM or is a raw-snippets fallback. */
  synthesized: boolean;
  citations: NotebookCitation[];
  /** Citations the model proposed that did not match a retrieved row, dropped rather than trusted. Empty in the common case; present in the response so the drop is never silent. */
  rejected_citation_count: number;
}

export const NOTEBOOK_ANSWER_SCHEMA = {
  type: "object",
  required: ["answer", "citations"],
  properties: {
    answer: { type: "string", maxLength: 1200 },
    citations: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        required: ["file_path", "line_number"],
        properties: {
          file_path: { type: "string" },
          line_number: { type: "number" },
        },
      },
    },
  },
} as const;

/**
 * Keep only citations that match a retrieved row exactly (path + line).
 * The model's own claim is never sufficient — this is the enforcement point.
 */
export function validateCitations(
  proposed: Array<{ file_path: string; line_number: number }>,
  retrieved: NotebookCitation[],
): { valid: NotebookCitation[]; rejectedCount: number } {
  const byKey = new Map(retrieved.map((r) => [`${r.file_path}:${r.line_number}`, r]));
  const valid: NotebookCitation[] = [];
  let rejectedCount = 0;
  for (const p of proposed) {
    const match = byKey.get(`${p.file_path}:${p.line_number}`);
    if (match) valid.push(match);
    else rejectedCount++;
  }
  return { valid, rejectedCount };
}

export interface AnswerFromCodeDeps {
  search?: typeof searchSnapshotContent;
  completion?: typeof runCompletion;
  llmConfigured?: typeof isLlmConfigured;
}

/**
 * Answer a natural-language question about a snapshot's code, grounded in
 * retrieved content. Never throws on "no LLM" or "no matches" — both are
 * real, expected states with a real (structured) response, not a failure.
 */
export async function answerFromCode(
  snapshotId: string,
  question: string,
  deps: AnswerFromCodeDeps = {},
): Promise<NotebookAnswer> {
  const search = deps.search ?? searchSnapshotContent;
  const completion = deps.completion ?? runCompletion;
  const llmConfigured = deps.llmConfigured ?? isLlmConfigured;

  const rows = await search(snapshotId, question, { limit: 8 });
  const retrieved: NotebookCitation[] = rows.map((r) => ({
    file_path: r.file_path,
    line_number: r.line_number,
    content: r.content,
  }));

  if (retrieved.length === 0) {
    return { question, answer: null, synthesized: false, citations: [], rejected_citation_count: 0 };
  }

  if (!(await llmConfigured())) {
    // No model loaded: the grounded snippets themselves ARE the answer.
    // Real, verifiable, just not narrated.
    return { question, answer: null, synthesized: false, citations: retrieved, rejected_citation_count: 0 };
  }

  const context = retrieved
    .map((r, i) => `[${i + 1}] ${r.file_path}:${r.line_number}\n${r.content}`)
    .join("\n\n");
  const res = await completion({
    system:
      "You answer questions about a codebase using ONLY the numbered excerpts provided. " +
      "Cite ONLY file_path/line_number pairs that appear in the excerpts below — never invent a " +
      "location. If the excerpts do not answer the question, say so in `answer` and return an " +
      "empty `citations` array. Return JSON {answer, citations: [{file_path, line_number}]}.",
    prompt: `Question: ${question}\n\nExcerpts:\n${context}`,
    temperature: 0,
    seed: 7,
    max_tokens: 500,
    json_schema: NOTEBOOK_ANSWER_SCHEMA,
  });

  if ("_not_configured" in res) {
    return { question, answer: null, synthesized: false, citations: retrieved, rejected_citation_count: 0 };
  }

  const parsed = validateStructuredOutput(res.text, NOTEBOOK_ANSWER_SCHEMA);
  const p = parsed.parsed as { answer?: string; citations?: Array<{ file_path: string; line_number: number }> } | null;
  if (!parsed.valid || !p || typeof p.answer !== "string") {
    // Model responded but not usably — fall back to the real snippets rather
    // than surface a malformed or unparseable synthesis.
    return { question, answer: null, synthesized: false, citations: retrieved, rejected_citation_count: 0 };
  }

  const { valid, rejectedCount } = validateCitations(p.citations ?? [], retrieved);
  return {
    question,
    answer: p.answer,
    synthesized: true,
    citations: valid,
    rejected_citation_count: rejectedCount,
  };
}
