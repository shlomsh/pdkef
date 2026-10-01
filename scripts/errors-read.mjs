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
  body: JSON.stringify(keys.map((d) => ['HGETALL', `errors:${d}`])),
});
if (!res.ok) {
  console.error(`Store answered ${res.status}.`);
  process.exit(1);
}

// HGETALL returns a flat [field, count, field, count, ...] array.
const rows = new Map();
for (const { result } of await res.json()) {
  for (let n = 0; n + 1 < (result?.length ?? 0); n += 2) {
    rows.set(result[n], (rows.get(result[n]) ?? 0) + Number(result[n + 1]));
  }
}
const table = [...rows].sort((a, b) => b[1] - a[1]);
console.log('count | area | name | frame | engine');
for (const [field, count] of table) console.log(`${count} | ${field.split('|').join(' | ')}`);
if (!table.length) console.log(`(no reports in the last ${days} days)`);
