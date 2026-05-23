import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  runCompletion,
  isLlmConfigured,
  validateCompletionOptions,
  getModelPath,
  resetLlmForTests,
  type NotConfiguredResult,
} from "./llm-inference.js";

function isNotConfigured(r: unknown): r is NotConfiguredResult {
  return Boolean(r && typeof r === "object" && (r as { _not_configured?: unknown })._not_configured === true);
}

describe("llm-inference — getModelPath", () => {
  const original = process.env.AXIS_LLM_MODEL_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.AXIS_LLM_MODEL_PATH;
    else process.env.AXIS_LLM_MODEL_PATH = original;
  });

  it("uses AXIS_LLM_MODEL_PATH env var when set", () => {
    process.env.AXIS_LLM_MODEL_PATH = "/custom/path/model.gguf";
    expect(getModelPath()).toBe("/custom/path/model.gguf");
  });

  it("falls back to models/Llama-3.2-1B-Instruct-Q4_K_M.gguf at cwd when unset", () => {
    delete process.env.AXIS_LLM_MODEL_PATH;
    const p = getModelPath();
    expect(p.endsWith(path.join("models", "Llama-3.2-1B-Instruct-Q4_K_M.gguf"))).toBe(true);
  });
});

describe("llm-inference — isLlmConfigured", () => {
  const original = process.env.AXIS_LLM_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-llm-test-"));
  });

  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_LLM_MODEL_PATH;
    else process.env.AXIS_LLM_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false when the model file is absent", async () => {
    process.env.AXIS_LLM_MODEL_PATH = path.join(tmpDir, "missing.gguf");
    expect(await isLlmConfigured()).toBe(false);
  });

  it("returns true when the model file exists", async () => {
    const p = path.join(tmpDir, "fake.gguf");
    await fs.writeFile(p, "fake content");
    process.env.AXIS_LLM_MODEL_PATH = p;
    expect(await isLlmConfigured()).toBe(true);
  });
});

describe("llm-inference — validateCompletionOptions", () => {
  it("accepts a minimal valid call", () => {
    expect(() => validateCompletionOptions({ prompt: "hello" })).not.toThrow();
  });

  it("accepts all optional fields with valid values", () => {
    expect(() =>
      validateCompletionOptions({
        prompt: "hello",
        system: "be brief",
        max_tokens: 100,
        temperature: 0.8,
        top_k: 50,
        top_p: 0.9,
        seed: 42,
        stop: ["\n\n", "END"],
      }),
    ).not.toThrow();
  });

  it("rejects empty prompt", () => {
    expect(() => validateCompletionOptions({ prompt: "" })).toThrow(/non-empty/);
  });

  it("rejects oversized prompt", () => {
    expect(() => validateCompletionOptions({ prompt: "x".repeat(33_000) })).toThrow(/32/);
  });

  it("rejects non-string system", () => {
    expect(() =>
      validateCompletionOptions({ prompt: "x", system: 42 as unknown as string }),
    ).toThrow(/system/);
  });

  it("rejects max_tokens above hard cap (2048)", () => {
    expect(() => validateCompletionOptions({ prompt: "x", max_tokens: 5000 })).toThrow(/2048/);
  });

  it("rejects negative max_tokens", () => {
    expect(() => validateCompletionOptions({ prompt: "x", max_tokens: -1 })).toThrow(/positive/);
  });

  it("rejects temperature outside [0, 2]", () => {
    expect(() => validateCompletionOptions({ prompt: "x", temperature: -0.1 })).toThrow(/temperature/);
    expect(() => validateCompletionOptions({ prompt: "x", temperature: 2.5 })).toThrow(/temperature/);
  });

  it("rejects non-integer top_k", () => {
    expect(() => validateCompletionOptions({ prompt: "x", top_k: 3.5 })).toThrow(/top_k/);
  });

  it("rejects top_p outside (0, 1]", () => {
    expect(() => validateCompletionOptions({ prompt: "x", top_p: 0 })).toThrow(/top_p/);
    expect(() => validateCompletionOptions({ prompt: "x", top_p: 1.1 })).toThrow(/top_p/);
  });

  it("rejects non-array stop", () => {
    expect(() =>
      validateCompletionOptions({ prompt: "x", stop: "END" as unknown as string[] }),
    ).toThrow(/stop must be an array/);
  });

  it("rejects non-string stop entries", () => {
    expect(() =>
      validateCompletionOptions({ prompt: "x", stop: [1 as unknown as string] }),
    ).toThrow(/stop\[\] entries/);
  });

  it("rejects non-finite seed", () => {
    expect(() => validateCompletionOptions({ prompt: "x", seed: Infinity })).toThrow(/seed/);
  });
});

describe("llm-inference — runCompletion not-configured envelope", () => {
  const original = process.env.AXIS_LLM_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-llm-test-"));
    process.env.AXIS_LLM_MODEL_PATH = path.join(tmpDir, "missing.gguf");
    resetLlmForTests();
  });

  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_LLM_MODEL_PATH;
    else process.env.AXIS_LLM_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns _not_configured envelope without touching native code", async () => {
    const r = await runCompletion({ prompt: "hello" });
    expect(isNotConfigured(r)).toBe(true);
    if (isNotConfigured(r)) {
      expect(r.model_path).toContain("missing.gguf");
      expect(r.hint).toContain("AXIS_LLM_MODEL_PATH");
    }
  });

  it("validates options BEFORE checking config (validation errors take precedence)", async () => {
    await expect(runCompletion({ prompt: "" })).rejects.toThrow(/non-empty/);
    await expect(runCompletion({ prompt: "x", max_tokens: 99999 })).rejects.toThrow(/2048/);
  });
});

// ─── Optional live-inference test ───────────────────────────────
// Only runs when AXIS_LLM_MODEL_PATH points at a real GGUF model.
// CI never has one, so this whole block is skipped there.

describe("llm-inference — live model (skipped unless model is present)", () => {
  it.skipIf(!process.env.AXIS_LLM_MODEL_PATH)("runs a real completion when a model is configured", async () => {
    const r = await runCompletion({
      prompt: "Reply with the single word: TEST",
      max_tokens: 16,
      temperature: 0,
      seed: 1,
    });
    if (isNotConfigured(r)) {
      throw new Error(`Expected a real completion but got _not_configured for ${r.model_path}`);
    }
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.model_used).toMatch(/\.gguf$/);
  }, 60_000);
});
