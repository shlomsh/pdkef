// Prints the anonymous error counts (DEBT-17): npm run errors:read -- [--days 7] [--history 14]
// --days is the window the tables count; --history (default 14, never less than --days) is how far back
// first-seen and the per-tool baseline look (DEBT-36). The output leads with "Needs attention".
// Env comes from process.env, else .env.local (written by `vercel env pull`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleLines } from './errors-frames.mjs';
import { fingerprintHistory, parseDayReplies, sliceWindow, toolRates } from './errors-insights.mjs';
import { validateRegistry } from './errors-known.mjs';
import { renderTriage, triage } from './errors-triage.mjs';

// The one git door for the stale-tab note: repo root, short timeout; failures are caught by the caller.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runGit = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });

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
const h = process.argv.indexOf('--history');
const history = Math.max(days, Number(h > -1 ? process.argv[h + 1] : 14) || 14);
const allKeys = Array.from({ length: history }, (_, n) =>
  new Date(Date.now() - n * 864e5).toISOString().slice(0, 10),
);

const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    ...allKeys.flatMap((d) => [['HGETALL', `errors:${d}`], ['HGETALL', `errors:sample:${d}`]]),
    ...allKeys.map((d) => ['HGETALL', `events:${d}`]),
    ...allKeys.map((d) => ['HGETALL', `usage:${d}`]),
    ...allKeys.map((d) => ['GET', `errors:total:${d}`]),
    ...allKeys.map((d) => ['GET', `usage:total:${d}`]),
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
const fetched = await res.json();
// Everything below the tables reads the window only; first-seen and the baseline read all `history` days.
const perDay = parseDayReplies(fetched, allKeys);
const keys = allKeys.slice(0, days);
const replies = sliceWindow(fetched, history, days);
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

// The verdict first (DEBT-36): what needs attention, then the known old tabs. Builds are looked up in git, so
// bring origin up to date first; offline or failing, the verdicts degrade to "unverifiable", never an error.
try {
  execFileSync('git', ['fetch', '-q', 'origin'], { cwd: repoRoot, timeout: 20000, stdio: 'ignore' });
} catch {
  // expected: offline or no remote; verdicts that need git then say they could not tell
}
let knownItems = [];
try {
  knownItems = JSON.parse(readFileSync(path.join(repoRoot, 'docs/error-known-items.json'), 'utf8'));
  const problems = validateRegistry(knownItems);
  if (problems.length) {
    console.log(`docs/error-known-items.json is invalid, treating every report as new: ${problems.join('; ')}`);
    knownItems = [];
  }
} catch (error) {
  console.log(`docs/error-known-items.json could not be read (${error.message}); treating every report as new`);
}
const verdicts = triage({ table, samples, history: fingerprintHistory(perDay, days), entries: knownItems, run: runGit });
for (const line of renderTriage(verdicts, toolRates(perDay, days))) console.log(line);
console.log(`(window ${days} day${days === 1 ? '' : 's'}, history ${history}; newest UTC day first, today is partial)\n`);
const verdictByField = new Map([...verdicts.needs, ...verdicts.known].map((item) => [item.field, item.verdict]));

console.log('count | area | name | frame | step | engine');
for (const [field, count] of table) {
  console.log(`${count} | ${field.split('|').join(' | ')}`);
  const verdict = verdictByField.get(field);
  if (verdict) console.log(`    verdict: ${verdict.category} (${verdict.reason})${verdict.ticket ? ` ${verdict.ticket}` : ''}`);
  let sample = null;
  try {
    sample = JSON.parse(samples.get(field) ?? 'null');
  } catch {}
  if (!sample) continue;
  for (const line of sampleLines(sample, runGit)) console.log(line);
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
