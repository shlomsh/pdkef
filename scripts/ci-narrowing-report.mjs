#!/usr/bin/env node
// QUAL-08: the production-measurement half of ARCH-20's affected-scope
// narrowing. nx-affected-histogram.mjs answers "what would affected-scope.mjs
// resolve for this historical diff, run today" - a local oracle check. This
// script answers the different question QUAL-08 actually needs: what did the
// real GitHub Actions runs since a given commit actually do - which verdict,
// how long each job took, whether font-guards' Playwright step ran, and how
// many tests each e2e shard actually executed. Not wired into ci.yml or
// package.json's scripts; a one-off (and re-runnable) measurement, per
// QUAL-08's "a small script under scripts/ ... is fine and may stay".
//
// Usage:
//   node scripts/ci-narrowing-report.mjs --since <sha> [--branch main]
//     [--workflow ci.yml] [--limit 200] [--events push,schedule]
//     [--cache-dir .ci-narrowing-cache] [--no-cache] [--json]
//
// Requires the `gh` CLI, authenticated (gh auth status), with read access to
// the repo's Actions runs. Caches each run's `gh run view --json jobs` and
// the checks/e2e job logs to --cache-dir (default .ci-narrowing-cache/,
// gitignored) so a re-run or a widened window does not refetch what it
// already has - `gh api .../logs` is one of the slower calls per run.
//
// What it prints: one row per CI run (push/schedule events on --branch,
// created on or after the commit named by --since), each row is Actions'
// idea of run wall-clock (createdAt..updatedAt), the checks job's verdict
// (narrowed to <projects>, or everything with affected-scope.mjs's own
// reason string), the checks job's "Run tests" step duration, each e2e
// shard's step duration and Playwright-reported test count, and whether
// font-guards' Playwright step actually ran (its step is skipped, not the
// job, when fonts=false - see ci.yml's font-guards job). A summary block
// tallies verdict buckets and medians per bucket.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const SINCE = flag('--since', null);
const BRANCH = flag('--branch', 'main');
const WORKFLOW = flag('--workflow', 'ci.yml');
const LIMIT = Number(flag('--limit', '300'));
const EVENTS = new Set(flag('--events', 'push,schedule').split(','));
const CACHE_DIR = resolvePath(ROOT, flag('--cache-dir', '.ci-narrowing-cache'));
const NO_CACHE = args.includes('--no-cache');
const AS_JSON = args.includes('--json');

if (!SINCE) {
  console.error('usage: node scripts/ci-narrowing-report.mjs --since <sha> [options]');
  process.exit(1);
}

if (!NO_CACHE && !existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function gh(ghArgs) {
  return execFileSync('gh', ghArgs, { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function cached(key, fetcher) {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!NO_CACHE && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const value = fetcher();
  if (!NO_CACHE) writeFileSync(path, JSON.stringify(value));
  return value;
}

// Some jobs' logs are gone by the time this runs (retention window, or a
// job GitHub garbage-collects logs for once old enough) - `gh api .../logs`
// 404s as a BlobNotFound rather than an empty log. Treated as "unavailable"
// rather than a crash so one old run does not take down the whole report;
// cached as an empty string so we do not re-request it every run.
function cachedText(key, fetcher) {
  const path = join(CACHE_DIR, `${key}.log`);
  if (!NO_CACHE && existsSync(path)) return readFileSync(path, 'utf8');
  let value;
  try {
    value = fetcher();
  } catch {
    value = '';
  }
  if (!NO_CACHE) writeFileSync(path, value);
  return value;
}

// --- 1. Which commit is --since, so we can bound the run window by date ---
const sinceDate = execFileSync('git', ['log', '-1', '--format=%cI', SINCE], {
  encoding: 'utf8',
  cwd: ROOT,
}).trim();

// --- 2. List candidate runs -------------------------------------------------
const runList = cached(`run-list-${BRANCH}-${WORKFLOW}-${LIMIT}`, () =>
  JSON.parse(
    gh([
      'run',
      'list',
      '--branch',
      BRANCH,
      '--workflow',
      WORKFLOW,
      '--limit',
      String(LIMIT),
      '--json',
      'databaseId,headSha,createdAt,updatedAt,status,conclusion,event',
    ])
  )
);

const runs = runList
  .filter((r) => r.status === 'completed' && r.createdAt >= sinceDate && EVENTS.has(r.event))
  .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

// --- 3. Per-run job/step detail ---------------------------------------------
function stepDurationSeconds(step) {
  if (!step || !step.startedAt || !step.completedAt) return null;
  return (new Date(step.completedAt) - new Date(step.startedAt)) / 1000;
}

function findStep(job, namePattern) {
  return job?.steps?.find((s) => namePattern.test(s.name));
}

// affected-scope.mjs prints its reason to stderr as
// `affected-scope: <reason>` (see the script's own header). It runs inside
// each consuming job right after that job's own `npm ci`, so checks, every
// e2e shard and every font-guards shard resolve the same diff independently;
// we only need one (checks, unsharded) per run. Every raw log line GitHub
// Actions returns is prefixed with an RFC3339 timestamp
// ("2026-09-18T14:41:58.39...Z "), so the match is not anchored to the start
// of the line.
function verdictFromLog(log) {
  const m = log.match(/affected-scope: (.+)$/m);
  if (!m) return { verdict: 'unknown', reason: '(no "affected-scope:" line found in checks log)' };
  const reason = m[1].trim();
  if (reason.startsWith('narrowed to')) return { verdict: 'narrow', reason };
  return { verdict: 'everything', reason };
}

// Playwright's own summary line, e.g. "  12 passed (45.3s)" or
// "  3 passed, 2 skipped (12.1s)" or "No tests found" under
// --pass-with-no-tests. Takes the last match since retried/flaky runs can
// print more than one summary block.
function playwrightCount(log) {
  const passed = [...log.matchAll(/(\d+) passed/g)].map((m) => Number(m[1]));
  if (passed.length) return passed[passed.length - 1];
  if (/No tests found/.test(log)) return 0;
  return null;
}

const rows = [];
for (const run of runs) {
  let detail;
  try {
    detail = cached(`run-${run.databaseId}`, () =>
      JSON.parse(gh(['run', 'view', String(run.databaseId), '--json', 'jobs,createdAt,updatedAt']))
    );
  } catch (err) {
    console.error(`run ${run.databaseId}: skipped, run view failed (${err.message.split('\n')[0]})`);
    continue;
  }
  const jobs = detail.jobs;
  const wallSeconds = (new Date(detail.updatedAt) - new Date(detail.createdAt)) / 1000;

  const checksJob = jobs.find((j) => j.name === 'checks');
  let verdict = 'unknown';
  let reason = '(no checks job on this run)';
  let checksTestSeconds = null;
  if (!checksJob || checksJob.conclusion === 'skipped') {
    // ci.yml's `checks` (and `build`/`e2e`/`font-guards`) job condition is
    // `... && (needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true')`:
    // on a push (never `nightly_unchanged`), a skipped `checks` job means
    // `scope` classified the push as docs-only and the whole rest of the
    // workflow never ran - cheaper than any narrow verdict, so its own
    // bucket rather than folded into "everything" or left "unknown".
    verdict = 'docs_only';
    reason = "scope classified this push docs-only; checks/build/e2e/font-guards all skipped";
  } else {
    const log = cachedText(`job-${checksJob.databaseId}-log`, () =>
      gh(['api', `/repos/{owner}/{repo}/actions/jobs/${checksJob.databaseId}/logs`])
    );
    ({ verdict, reason } = verdictFromLog(log));
    checksTestSeconds = stepDurationSeconds(findStep(checksJob, /^Run tests$/));
  }

  const e2eShards = jobs
    .filter((j) => /^e2e \(\d+\)$/.test(j.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const e2eInfo = e2eShards.map((job) => {
    const step = findStep(job, /^Run Playwright e2e tests \(product chromium/);
    const seconds = stepDurationSeconds(step);
    let count = null;
    if (step) {
      const log = cachedText(`job-${job.databaseId}-log`, () =>
        gh(['api', `/repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`])
      );
      count = playwrightCount(log);
    }
    return { name: job.name, seconds, count };
  });

  const fontJobs = jobs.filter((j) => /^font-guards \(\d+\)$/.test(j.name));
  const fontsRan = fontJobs.some((job) => {
    const step = findStep(job, /^Run Playwright e2e tests \(font guards/);
    return step && step.conclusion !== 'skipped';
  });

  rows.push({
    run: run.databaseId,
    sha: run.headSha.slice(0, 8),
    event: run.event,
    createdAt: run.createdAt,
    conclusion: run.conclusion,
    wallSeconds,
    verdict,
    reason,
    checksTestSeconds,
    e2e: e2eInfo,
    fontsRan,
    fontJobCount: fontJobs.length,
  });
}

// --- 4. Report ---------------------------------------------------------------
if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

function median(nums) {
  const xs = nums.filter((n) => n != null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
function fmt(n) {
  return n == null ? '-' : n.toFixed(0);
}

console.log(`# CI narrowing report: ${SINCE.slice(0, 8)} (${sinceDate}) .. HEAD on ${BRANCH}\n`);
console.log(`${rows.length} completed ${WORKFLOW} runs, events: ${[...EVENTS].join(', ')}\n`);
console.log(
  '| run | sha | event | verdict | reason | wall(s) | checks-tests(s) | e2e(1) s/n | e2e(2) s/n | fonts ran |'
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const e2e = [0, 1].map((i) => r.e2e[i] ? `${fmt(r.e2e[i].seconds)}/${r.e2e[i].count ?? '-'}` : '-');
  console.log(
    `| ${r.run} | ${r.sha} | ${r.event} | ${r.verdict} | ${r.reason.replace(/\|/g, '\\|')} | ${fmt(
      r.wallSeconds
    )} | ${fmt(r.checksTestSeconds)} | ${e2e[0]} | ${e2e[1]} | ${r.fontsRan} |`
  );
}

console.log('\n## Summary\n');
const byVerdict = {};
for (const r of rows) (byVerdict[r.verdict] ??= []).push(r);
for (const [verdict, group] of Object.entries(byVerdict)) {
  const pct = ((group.length / rows.length) * 100).toFixed(0);
  console.log(
    `- **${verdict}**: ${group.length}/${rows.length} (${pct}%), median wall ${fmt(
      median(group.map((r) => r.wallSeconds))
    )}s`
  );
}
const reasonCounts = {};
for (const r of rows.filter((r) => r.verdict === 'everything')) {
  reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
}
console.log('\n### "everything" reasons\n');
for (const [reason, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`- ${n}x ${reason}`);
}
const fontsOnCount = rows.filter((r) => r.fontsRan).length;
console.log(
  `\nfont-guards Playwright step actually ran: ${fontsOnCount}/${rows.length} (${(
    (fontsOnCount / rows.length) *
    100
  ).toFixed(0)}%)`
);
