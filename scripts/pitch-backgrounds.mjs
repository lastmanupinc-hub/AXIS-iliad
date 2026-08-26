#!/usr/bin/env node
// Render pitch-deck slide backgrounds from slide-art-prompts.json via xAI.
//
//   XAI_API_KEY=... node scripts/pitch-backgrounds.mjs <slide-art-prompts.json> <outdir> [keys...]
//
// The runtime half of the pitch program: the prompts file is deterministic
// generator output; this turns each prompt into a PNG. Degrades loudly — a
// failed slide is reported and skipped, never silently blank. Exit 1 only when
// EVERY requested slide failed (a deck with most backgrounds ships; zero means
// the pipeline is broken and the operator must know). Key-agnostic: renders
// whatever keys the prompts file carries (9 since the evidence-skeleton v2).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [, , promptsPath, outDir, ...only] = process.argv;
if (!promptsPath || !outDir) {
  console.error("usage: pitch-backgrounds.mjs <slide-art-prompts.json> <outdir> [slide-keys...]");
  process.exit(2);
}
if (!process.env.XAI_API_KEY) {
  console.error("XAI_API_KEY is not set — refusing to pretend. No images were generated.");
  process.exit(2);
}

const { generateSlideBackground } = await import("../apps/api/dist/xai-images.js");
const spec = JSON.parse(readFileSync(promptsPath, "utf8"));
const entries = Object.entries(spec.prompts ?? {}).filter(([k]) => !only.length || only.includes(k));
if (!entries.length) {
  console.error("no matching prompt keys in", promptsPath);
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
let okCount = 0;
for (const [key, prompt] of entries) {
  process.stdout.write(`  ${key} … `);
  const t0 = Date.now();
  const r = await generateSlideBackground(prompt);
  if (r.ok) {
    const file = join(outDir, `${key}.png`);
    writeFileSync(file, r.bytes);
    okCount++;
    console.log(`OK  ${r.bytes.length} bytes in ${((Date.now() - t0) / 1000).toFixed(1)}s (${r.model}) -> ${file}`);
  } else {
    console.log(`FAILED (${r.status ?? "network"}) ${r.error.slice(0, 160)}`);
  }
}
console.log(`${okCount}/${entries.length} backgrounds generated`);
process.exit(okCount > 0 ? 0 : 1);
