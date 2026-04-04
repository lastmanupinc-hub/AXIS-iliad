import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// We test the module by importing it after mocking fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  constants: {},
}));

import { loadConfig, saveConfig, getConfigDir, getConfigFile } from "./credential-store.ts";

const CONFIG_FILE = join(homedir(), ".axis", "config.json");

beforeEach(() => {
  vi.mocked(existsSync).mockReset();
  vi.mocked(readFileSync).mockReset();
  vi.mocked(writeFileSync).mockReset();
  vi.mocked(mkdirSync).mockReset();
  vi.mocked(chmodSync).mockReset();
});

// ─── Path helpers ───────────────────────────────────────────────

describe("getConfigDir / getConfigFile", () => {
  it("returns expected paths under homedir", () => {
    expect(getConfigDir()).toBe(join(homedir(), ".axis"));
    expect(getConfigFile()).toBe(join(homedir(), ".axis", "config.json"));
  });
});

// ─── loadConfig ─────────────────────────────────────────────────

describe("loadConfig", () => {
  it("returns empty config if file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadConfig()).toEqual({});
  });

  it("returns empty config if file is corrupt JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("not json{{{");
    expect(loadConfig()).toEqual({});
  });

  it("migrates plaintext api_key from older version", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ api_key: "axis_plaintext123" }));
    const config = loadConfig();
    expect(config.api_key).toBe("axis_plaintext123");
  });

  it("loads api_url if present", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ api_url: "https://api.example.com" }));
    const config = loadConfig();
    expect(config.api_url).toBe("https://api.example.com");
  });

  it("returns empty api_key if encrypted data is corrupted", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ api_key_encrypted: "garbage:data:here" }));
    const config = loadConfig();
    expect(config.api_key).toBeUndefined();
  });
});

// ─── saveConfig ─────────────────────────────────────────────────

describe("saveConfig", () => {
  it("creates config directory", () => {
    saveConfig({ api_key: "axis_test123" });
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining(".axis"), { recursive: true });
  });

  it("writes encrypted key, not plaintext", () => {
    saveConfig({ api_key: "axis_secret_key_abc" });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(content as string);

    // Should have api_key_encrypted, NOT api_key
    expect(written.api_key_encrypted).toBeDefined();
    expect(written.api_key).toBeUndefined();

    // Encrypted value should be base64 with iv:tag:ciphertext format
    const parts = written.api_key_encrypted.split(":");
    expect(parts).toHaveLength(3);

    // Plaintext key should NOT appear in the file
    expect((content as string).includes("axis_secret_key_abc")).toBe(false);
  });

  it("sets file mode 0o600", () => {
    saveConfig({ api_key: "axis_test" });

    const [, , opts] = vi.mocked(writeFileSync).mock.calls[0];
    expect((opts as { mode: number }).mode).toBe(0o600);

    // Also calls chmodSync for platforms that support it
    expect(chmodSync).toHaveBeenCalledWith(expect.stringContaining("config.json"), 0o600);
  });

  it("saves api_url unencrypted", () => {
    saveConfig({ api_url: "https://api.example.com" });

    const [, content] = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(content as string);
    expect(written.api_url).toBe("https://api.example.com");
  });

  it("omits api_key_encrypted when no key", () => {
    saveConfig({});

    const [, content] = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(content as string);
    expect(written.api_key_encrypted).toBeUndefined();
  });
});

// ─── Round-trip encryption ──────────────────────────────────────

describe("round-trip encryption", () => {
  it("encrypts and decrypts api_key correctly", () => {
    // We test the round-trip by saving then loading with real fs mocks
    let savedContent = "";
    vi.mocked(writeFileSync).mockImplementation((_path, content) => {
      savedContent = content as string;
    });

    saveConfig({ api_key: "axis_abcdef1234567890abcdef1234567890" });

    // Now mock reading back the saved content
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(savedContent);

    const loaded = loadConfig();
    expect(loaded.api_key).toBe("axis_abcdef1234567890abcdef1234567890");
  });

  it("round-trips with api_url preserved", () => {
    let savedContent = "";
    vi.mocked(writeFileSync).mockImplementation((_path, content) => {
      savedContent = content as string;
    });

    saveConfig({ api_key: "axis_key123", api_url: "http://localhost:4000" });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(savedContent);

    const loaded = loadConfig();
    expect(loaded.api_key).toBe("axis_key123");
    expect(loaded.api_url).toBe("http://localhost:4000");
  });

  it("each save produces different ciphertext (random IV)", () => {
    const saved: string[] = [];
    vi.mocked(writeFileSync).mockImplementation((_path, content) => {
      saved.push(content as string);
    });

    saveConfig({ api_key: "axis_same_key" });
    saveConfig({ api_key: "axis_same_key" });

    const enc1 = JSON.parse(saved[0]).api_key_encrypted;
    const enc2 = JSON.parse(saved[1]).api_key_encrypted;
    expect(enc1).not.toBe(enc2); // Different IVs → different ciphertext
  });
});
