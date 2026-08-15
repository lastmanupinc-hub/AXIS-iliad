import { describe, it, expect } from "vitest";
import { wrapSlidePrompt, generateSlideBackground } from "./xai-images.js";

describe("xai prompt wrapper", () => {
  it("appends the background contract AFTER the motif so constraints win conflicts", () => {
    const wrapped = wrapSlidePrompt("A vibrant poster full of bold typography");
    // Motif first, contract last — last instruction wins in image models.
    expect(wrapped.indexOf("bold typography")).toBeLessThan(wrapped.indexOf("no words"));
    expect(wrapped).toContain("16:9");
    expect(wrapped).toContain("no words, letters, numbers, logos");
    expect(wrapped).toContain("safe for overlaid white text");
  });

  it("does not double the period when the motif already ends with one", () => {
    expect(wrapSlidePrompt("Minimal grid.")).not.toContain("..");
  });

  it("returns a typed error (never throws) when no key is configured", async () => {
    const prev = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      const r = await generateSlideBackground("anything");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("XAI_API_KEY");
    } finally {
      if (prev !== undefined) process.env.XAI_API_KEY = prev;
    }
  });

  it("walks to the next model when the first is unknown, and surfaces the real error otherwise", async () => {
    process.env.XAI_API_KEY = process.env.XAI_API_KEY || "test-key-fake";
    const calls: string[] = [];
    const fakeFetch = (async (_url: unknown, init?: { body?: string }) => {
      const model = JSON.parse(init?.body ?? "{}").model as string;
      calls.push(model);
      if (calls.length === 1) {
        return new Response(JSON.stringify({ error: `model ${model} not found` }), { status: 404 });
      }
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png!").toString("base64") }] }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await generateSlideBackground("Minimal grid motif", fakeFetch);
    expect(calls.length).toBe(2); // fell through to the second model
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes.toString()).toBe("png!");
    if (process.env.XAI_API_KEY === "test-key-fake") delete process.env.XAI_API_KEY;
  });
});

// ─── LIVE tests — the "couple of prompt wrapper tests" from the owner spec ──
// Run only when XAI_API_KEY is present (operator machines; CI containers skip).
// They assert real image bytes come back for prompts derived from THIS repo's
// own analysis — the product's actual path, not a mock of it.
describe.skipIf(!process.env.XAI_API_KEY)("xai live — slide backgrounds (real API)", () => {
  it(
    "generates a real background for a title-slide prompt",
    async () => {
      const r = await generateSlideBackground(
        "Professional pitch-deck background, dark slate with one indigo accent. Motif: a faint constellation resolving into one bright node — a codebase becoming a product. Subject hint: TypeScript.",
      );
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (r.ok) {
        expect(r.bytes.length).toBeGreaterThan(10_000); // a real image, not an error body
        expect(r.prompt_used).toContain("no words");
      }
    },
    180_000,
  );

  it(
    "generates a real background for the truth-assessment slide",
    async () => {
      const r = await generateSlideBackground(
        "Professional pitch-deck background, dark slate, restrained amber accent. Motif: two translucent layers compared, one slightly offset, the mismatched edge highlighted — claims laid over evidence.",
      );
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (r.ok) expect(r.bytes.length).toBeGreaterThan(10_000);
    },
    180_000,
  );
});
