// Prints the anonymous error counts (DEBT-17): npm run errors:read -- [--days 7]
// Env comes from process.env, else .env.local (written by `vercel env pull`).
import { readFileSync } from 'node:fs';

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

const env = { ...envFromFile(), ...process.env };
const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('Missing KV_REST_API_URL/KV_REST_API_TOKEN: run `vercel env pull .env.local` first.');
  process.exit(1);
}

const i = process.argv.indexOf('--days');
const days = Math.max(1, Number(i > -1 ? process.argv[i + 1] : 7) || 7);
const keys = Array.from({ length: days }, (_, n) =>
  new Date(Date.now() - n * 864e5).toISOString().slice(0, 10),
);

const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(keys.flatMap((d) => [['HGETALL', `errors:${d}`], ['HGETALL', `errors:sample:${d}`]])),
});
if (!res.ok) {
  console.error(`Store answered ${res.status}.`);
  process.exit(1);
}

// HGETALL returns a flat [field, value, field, value, ...] array. Replies come
// in pairs per day: counts, then samples (newest day first, so the first sample seen wins).
const rows = new Map();
const samples = new Map();
const replies = await res.json();
replies.forEach(({ result }, idx) => {
  const isSample = idx % 2 === 1;
  for (let n = 0; n + 1 < (result?.length ?? 0); n += 2) {
    const field = result[n];
    if (isSample) {
      if (!samples.has(field)) samples.set(field, result[n + 1]);
    } else rows.set(field, (rows.get(field) ?? 0) + Number(result[n + 1]));
  }
});
const table = [...rows].sort((a, b) => b[1] - a[1]);
console.log('count | area | name | frame | step | engine');
for (const [field, count] of table) {
  console.log(`${count} | ${field.split('|').join(' | ')}`);
  let sample = null;
  try {
    sample = JSON.parse(samples.get(field) ?? 'null');
  } catch {}
  if (!sample) continue;
  console.log(`    ${sample.step} · ${sample.tool} · ${sample.installed ? 'installed' : 'browser'}/${sample.sw ? 'sw' : 'no-sw'} · ${sample.age}`);
  for (const frame of sample.stack ?? []) console.log(`    ${frame}`);
  console.log(`    npm run errors:resolve -- ${(sample.stack ?? []).join(' ')}`);
}
if (!table.length) console.log(`(no reports in the last ${days} days)`);
