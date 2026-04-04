import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".axis");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const ALGORITHM = "aes-256-gcm";

export interface AxisConfig {
  api_key?: string;
  api_url?: string;
}

/** Derive a machine-stable encryption key from hostname + username + homedir. */
function deriveKey(): Buffer {
  const material = `axis:${homedir()}:${process.env.USERNAME ?? process.env.USER ?? "default"}`;
  return createHash("sha256").update(material).digest();
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as base64: iv:tag:ciphertext
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function loadConfig(): AxisConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      const config: AxisConfig = {};
      // Decrypt api_key if present and encrypted
      if (raw.api_key_encrypted) {
        try {
          config.api_key = decrypt(raw.api_key_encrypted);
        } catch {
          // Corrupted encryption — treat as missing
        }
      } else if (raw.api_key) {
        // Migration: plaintext key from older version — re-encrypt on next save
        config.api_key = raw.api_key;
      }
      if (raw.api_url) config.api_url = raw.api_url;
      return config;
    }
  } catch {
    // Corrupt config file — return empty
  }
  return {};
}

export function saveConfig(config: AxisConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const stored: Record<string, string> = {};
  if (config.api_key) {
    stored.api_key_encrypted = encrypt(config.api_key);
  }
  if (config.api_url) {
    stored.api_url = config.api_url;
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(stored, null, 2), { encoding: "utf-8", mode: 0o600 });
  // Ensure permissions on platforms that support chmod
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows may not support chmod — the mode on writeFileSync is best-effort
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFile(): string {
  return CONFIG_FILE;
}
