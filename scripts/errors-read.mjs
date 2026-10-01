// Prints the anonymous error counts (DEBT-17): npm run errors:read -- [--days 7]
// Env comes from process.env, else .env.local (written by `vercel env pull`).
import { readFileSync } from 'node:fs';

// usage:<day> holds `<event>|<tool>` -> count. Sums the days into one row per tool,
// sorted by accepted descending; ready/accepted is a whole percent, or '-' without accepted.
function sumUsage(results) {
  const byTool = new Map();
  for (const result of results) {
    for (let n = 0; n + 1 < (result?.length ?? 0); n += 2) {
      const [event, tool] = String(result[n]).split('|');
      const col = { tool_file_accepted: 0, tool_operation_started: 1, tool_result_ready: 2, tool_operation_failed: 3 }[event];
      if (col === undefined || !tool) continue;
      const row = byTool.get(tool) ?? [0, 0, 0, 0];
      row[col] += Number(result[n + 1]) || 0;
      byTool.set(tool, row);
    }
  }
  return [...byTool]
    .filter(([, c]) => c.some(Boolean))
    .sort((a, b) => b[1][0] - a[1][0] || a[0].localeCompare(b[0]))
    .map(([tool, [accepted, started, ready, failed]]) => [
      tool, accepted, started, ready, failed, accepted ? `${Math.round((ready / accepted) * 100)}%` : '-',
    ]);
}

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

// Mirror DAILY_CAP and USAGE_DAILY_CAP in src/site-lib/errorReportStore.ts (a script cannot import TS).
const DAILY_CAP = 1000;
const USAGE_DAILY_CAP = 3000;

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
  body: JSON.stringify([
    ...keys.flatMap((d) => [['HGETALL', `errors:${d}`], ['HGETALL', `errors:sample:${d}`]]),
    ...keys.map((d) => ['HGETALL', `events:${d}`]),
    ...keys.map((d) => ['HGETALL', `usage:${d}`]),
    ...keys.map((d) => ['GET', `errors:total:${d}`]),
    ...keys.map((d) => ['GET', `usage:total:${d}`]),
  ]),
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
const eventReplies = replies.slice(keys.length * 2, keys.length * 3);
const usageReplies = replies.slice(keys.length * 3, keys.length * 4);
const errorTotals = replies.slice(keys.length * 4, keys.length * 5).map((r) => Number(r?.result) || 0);
const usageTotals = replies.slice(keys.length * 5, keys.length * 6).map((r) => Number(r?.result) || 0);
replies.slice(0, keys.length * 2).forEach(({ result }, idx) => {
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

// Sign's maintenance events: events:<day> holds `name|outcome|detail...|engine` -> count.
function sumEvents(results) {
  const sums = new Map();
  for (const result of results) {
    for (let n = 0; n + 1 < (result?.length ?? 0); n += 2) {
      sums.set(result[n], (sums.get(result[n]) ?? 0) + Number(result[n + 1]));
    }
  }
  return [...sums]
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => {
      const parts = field.split('|');
      const [name, outcome] = parts;
      const engine = parts.length > 2 ? parts[parts.length - 1] : '';
      return [count, name, outcome ?? '', parts.slice(2, -1).join(' '), engine];
    });
}
console.log('\nSign maintenance events');
const eventRows = sumEvents(eventReplies.map((r) => r.result));
if (eventRows.length) {
  console.log('count | event | outcome | detail | engine');
  for (const row of eventRows) console.log(row.join(' | '));
} else console.log('(none)');

console.log('\nTool usage');
const usageRows = sumUsage(usageReplies.map((r) => r.result));
if (usageRows.length) {
  console.log('tool | accepted | started | ready | failed | ready/accepted');
  for (const row of usageRows) console.log(row.join(' | '));
} else console.log('(none)');

// The total is the INCR count, so a day past the cap reads above it; later events that day went uncounted.
keys.forEach((day, n) => {
  if (errorTotals[n] > DAILY_CAP) {
    console.log(`${day}: error reports and Sign events reached the daily cap of ${DAILY_CAP}; later ones that day were not counted`);
  }
  if (usageTotals[n] > USAGE_DAILY_CAP) {
    console.log(`${day}: tool usage reached the daily cap of ${USAGE_DAILY_CAP}; later ones that day were not counted`);
  }
});
