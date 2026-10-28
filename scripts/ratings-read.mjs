// Prints the star ratings and comments (SEO-46/48): npm run ratings:read
// Entries (the rating:entries list: day, place, comment) start at SEO-48, so the per-tool counts can
// exceed the entries: older votes have no record. Env comes from process.env, else .env.local.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Mirror RATING_TOOLS in src/lib/telemetry/ratingSchema.ts (a script cannot import TS).
const RATING_TOOLS = ['merge', 'split', 'edit-pdf', 'compress', 'compress-image', 'pdf-to-image', 'image-to-pdf', 'sign', 'redact', 'unlock', 'protect'];

function envFromFile() {
  try {
    const out = {};
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

/** HGETALL replies are flat [field, value, ...]; returns a row per tool that has votes. */
export function summarizeCounts(tools, replies) {
  const rows = [];
  tools.forEach((tool, i) => {
    const flat = replies[i]?.result ?? [];
    const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let n = 0; n + 1 < flat.length; n += 2) {
      if (/^[1-5]$/.test(String(flat[n]))) stars[Number(flat[n])] = Number(flat[n + 1]) || 0;
    }
    const votes = Object.values(stars).reduce((a, b) => a + b, 0);
    if (votes === 0) return;
    const sum = Object.entries(stars).reduce((a, [s, c]) => a + Number(s) * c, 0);
    rows.push({ tool, votes, average: Math.round((sum / votes) * 10) / 10, stars });
  });
  return rows;
}

/** Parses each line as JSON, skipping what is not. */
export function parseEntries(strings) {
  const out = [];
  for (const s of strings ?? []) {
    try {
      out.push(JSON.parse(s));
    } catch {
      /* skip */
    }
  }
  return out;
}

const place = (e) => (e.country ? `${e.country}${e.region ? `-${e.region}` : ''}` : 'unknown');

async function main() {
  const env = { ...envFromFile(), ...process.env };
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('Missing KV_REST_API_URL/KV_REST_API_TOKEN: run `vercel env pull .env.local` first.');
    process.exit(1);
  }
  const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([...RATING_TOOLS.map((t) => ['HGETALL', `rating:${t}`]), ['LRANGE', 'rating:entries', 0, -1]]),
  });
  if (!res.ok) {
    console.error(`Store answered ${res.status}`);
    process.exit(1);
  }
  const replies = await res.json();
  const rows = summarizeCounts(RATING_TOOLS, replies);
  console.log(['tool', 'votes', 'average', '5*', '4*', '3*', '2*', '1*'].join('\t'));
  for (const r of rows) console.log([r.tool, r.votes, r.average.toFixed(1), r.stars[5], r.stars[4], r.stars[3], r.stars[2], r.stars[1]].join('\t'));
  if (rows.length === 0) console.log('(no votes yet)');

  const entries = parseEntries(replies[RATING_TOOLS.length]?.result);
  const byPlace = new Map();
  for (const e of entries) if (!('comment' in e)) byPlace.set(place(e), (byPlace.get(place(e)) ?? 0) + 1);
  console.log('\nBy place');
  for (const [p, n] of [...byPlace].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${p}`);

  console.log('\nComments');
  for (const e of entries.filter((x) => 'comment' in x).reverse()) console.log(`${e.day}  ${e.tool}  ${e.stars}★  ${place(e)}  ${e.comment}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
