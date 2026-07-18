// ─── runSpeechToText — lite mode enforcement wiring (H-Phase-A cycle 1) ──
//
// lite_description promised "audio capped at 60 seconds ... + word_timestamps
// disabled", but nothing in runSpeechToText ever referenced resolveAgentMode
// or "lite" — a lite-mode caller got the exact same behavior as a standard
// caller at the discounted price. runTranscription is mocked here (this
// sandbox has no real ffmpeg/whisper-cli binary) so this suite proves the
// WIRING is correct: lite mode must force word_timestamps=false and pass the
// duration cap down to runTranscription's second argument, on every call —
// the actual duration-cap arithmetic is covered separately in
// speech-to-text.test.ts's getWavDurationSeconds suite.
//
// Harness follows the vector-db.test.ts / mcp-embeddings.test.ts pattern:
// resolveAuth + usage-credit functions are mocked, runTranscription is mocked.

vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({
      account: { account_id: "acc-stt-lite", tier: "paid" as const },
      anonymous: false,
      key_id: "key-stt-lite",
    })),
  };
});

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
  };
});

vi.mock("./speech-to-text.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./speech-to-text.js")>();
  return {
    ...actual,
    runTranscription: vi.fn(async () => ({
      text: "hello world",
      segments: [],
      language_detected: "en",
      duration_seconds: 5,
      model_used: "test-model",
    })),
  };
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { runSpeechToText } from "./mcp-tool-impls.js";
import * as stt from "./speech-to-text.js";
import { PRICING_TIERS } from "@axis/mpp";

describe("runSpeechToText — lite mode enforcement wiring", () => {
  const liteReq = { headers: { "x-agent-mode": "lite" }, socket: {} } as unknown as IncomingMessage;
  const stdReq = { headers: {}, socket: {} } as unknown as IncomingMessage;

  beforeEach(() => {
    vi.mocked(stt.runTranscription).mockClear();
  });

  it("lite mode forces word_timestamps=false (even when the caller asked for true) and passes the 60s cap", async () => {
    await runSpeechToText(
      { audio_url: "https://example.com/a.mp3", word_timestamps: true },
      liteReq,
    );
    expect(stt.runTranscription).toHaveBeenCalledTimes(1);
    const [opts, maxDuration] = vi.mocked(stt.runTranscription).mock.calls[0];
    expect(opts.word_timestamps).toBe(false);
    expect(maxDuration).toBe(stt.LITE_STT_MAX_DURATION_SECONDS);
  });

  it("lite mode with word_timestamps omitted still forces false and still caps duration", async () => {
    await runSpeechToText({ audio_url: "https://example.com/a.mp3" }, liteReq);
    const [opts, maxDuration] = vi.mocked(stt.runTranscription).mock.calls[0];
    expect(opts.word_timestamps).toBe(false);
    expect(maxDuration).toBe(60);
  });

  it("standard mode passes the caller's word_timestamps through unchanged and no duration cap", async () => {
    await runSpeechToText(
      { audio_url: "https://example.com/a.mp3", word_timestamps: true },
      stdReq,
    );
    const [opts, maxDuration] = vi.mocked(stt.runTranscription).mock.calls[0];
    expect(opts.word_timestamps).toBe(true);
    expect(maxDuration).toBeUndefined();
  });

  // H-Phase-A cycle 9: the tests above prove the WIRING is correct, but
  // nothing tied LITE_STT_MAX_DURATION_SECONDS to the lite_description PROSE
  // in @axis/mpp's PRICING_TIERS — unlike lite-caps.ts's table (bidirectionally
  // pinned in lite-caps.test.ts), speech-to-text's cap is runtime state (audio
  // duration, not a pure input transform), so it lives outside that table and
  // had no equivalent pin. Not a live bug today (both already say 60); this
  // closes the gap so future drift fails CI instead of shipping.
  it("contract: PRICING_TIERS' lite_description duration-cap promise matches LITE_STT_MAX_DURATION_SECONDS, and 'word_timestamps disabled' is enforced", () => {
    const desc = PRICING_TIERS.iliad_speech_to_text.lite_description;
    const m = desc.match(/audio capped at (\d+) seconds/);
    expect(m, `/audio capped at (\\d+) seconds/ not found in "${desc}"`).not.toBeNull();
    expect(Number((m as RegExpMatchArray)[1])).toBe(stt.LITE_STT_MAX_DURATION_SECONDS);
    expect(desc).toMatch(/word_timestamps disabled/);
  });
});
