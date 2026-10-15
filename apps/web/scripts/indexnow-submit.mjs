#!/usr/bin/env node
/**
 * indexnow-submit.mjs — tell IndexNow (Bing, Yandex, Naver, Seznam and the engines that share it) which pages a
 * deploy changed. The startup foundation standard, item F12 (D:\Estate Presence, 2026-10-15); AXIS Launch's
 * scripts/indexnow_submit.py is the pattern.
 *
 *   node scripts/indexnow-submit.mjs snapshot <file>    # before the deploy: what each listed page is on the live site
 *   node scripts/indexnow-submit.mjs submit <file>      # after it: announce the pages whose live HTML changed
 *   ... --origin https://iliad.trustfabric.ai           # default: the sitemap's own host, below
 *
 * The pages are static files behind a direct upload, so "changed" is measured where it matters: each URL in the live
 * sitemap is fetched before and after, and only a page whose HTML differs is sent. Never fails a deploy: a refused
 * or unreachable endpoint prints a warning and exits 0. The key is public by design (an engine proves the sender
 * controls the host by fetching <origin>/<key>.txt): public/<key>.txt is the estate's one key, read from here.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', 'public');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const UA = 'axis-estate-deploy/1.0 (+https://jonathanarvay.com/estate.json)';

const args = process.argv.slice(2);
const mode = args[0];
const file = args[1];
const origin = (args.includes('--origin') ? args[args.indexOf('--origin') + 1] : 'https://iliad.trustfabric.ai').replace(/\/+$/, '');

function findKey() {
  for (const name of readdirSync(PUBLIC)) {
    const m = /^([0-9a-f]{32})\.txt$/.exec(name);
    if (m && readFileSync(join(PUBLIC, name), 'utf8').trim() === m[1]) return m[1];
  }
  return null;
}

async function text(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,*/*' }, redirect: 'manual' });
  if (res.status !== 200) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

const hashOf = html => createHash('sha256').update(html.replace(/ nonce="[^"]*"/g, '')).digest('hex');

async function liveHashes() {
  const sitemap = await text(`${origin}/sitemap.xml`);
  const urls = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => u === origin + '/' || u.startsWith(origin + '/'));
  const out = {};
  for (const u of urls) {
    try { out[u] = hashOf(await text(u)); } catch (e) { console.log(`indexnow: WARN ${e.message}`); }
  }
  return out;
}

async function main() {
  if (!['snapshot', 'submit'].includes(mode) || !file) { console.log('usage: indexnow-submit.mjs snapshot|submit <file> [--origin <url>]'); return 0; }
  if (mode === 'snapshot') {
    const before = await liveHashes();
    writeFileSync(file, JSON.stringify(before) + '\n', 'utf8');
    console.log(`indexnow: snapshot of ${Object.keys(before).length} listed pages taken`);
    return 0;
  }
  const key = findKey();
  if (!key) { console.log('indexnow: WARN no key file in public/; nothing submitted'); return 0; }
  let before = {};
  try { before = JSON.parse(readFileSync(file, 'utf8')); } catch { console.log('indexnow: WARN no snapshot from before the deploy; every listed page counts as changed'); }
  const after = await liveHashes();
  const changed = Object.keys(after).filter(u => before[u] !== after[u]).sort();
  if (changed.length === 0) { console.log(`indexnow: ${Object.keys(after).length} listed pages, none changed`); return 0; }
  const body = JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList: changed });
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA }, body });
    console.log(res.status === 200 || res.status === 202
      ? `indexnow: submitted ${changed.length} changed URL(s), engine answered ${res.status}`
      : `indexnow: WARN submission answered ${res.status}; nothing announced`);
  } catch (e) { console.log(`indexnow: WARN submission failed: ${e.message}`); }
  return 0;
}

main().then(code => process.exit(code), e => { console.log(`indexnow: WARN ${e.message}`); process.exit(0); });
