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
// shard's step duration and Playwright-reported test count, the
// `e2e-webkit` job's two Playwright steps (webkit, then the perf budgets)
// the same way, whether font-guards' Playwright step actually ran (its step
// is skipped, not the job, when fonts=false - see ci.yml's font-guards job)
// and, when it did, each font-guards shard's step duration, plus the run's
// longest job. A summary block tallies verdict buckets and medians per
// bucket, then the per-job medians QUAL-06 and QUAL-09 set their targets
// against.

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

// Job wall, checkout through the last step - the statistic QUAL-06 and
// QUAL-09 set their per-job targets in (not the Playwright step alone).
function jobSeconds(job) {
  if (!job || !job.startedAt || !job.completedAt) return null;
  return (new Date(job.completedAt) - new Date(job.startedAt)) / 1000;
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
  // The run's own critical path: every job waits on `scope` (~10s) and then
  // runs in parallel, so the longest job plus `scope` is what a push costs
  // when the runners are not queueing behind other worktrees' pushes.
  // createdAt..updatedAt (wallSeconds) includes that queueing.
  const longestJob = jobs
    .map((j) => ({ name: j.name, seconds: jobSeconds(j) }))
    .filter((j) => j.seconds != null)
    .sort((a, b) => b.seconds - a.seconds)[0] ?? null;

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
    return { name: job.name, seconds, count, jobSeconds: jobSeconds(job) };
  });

  // QUAL-09's job: two Playwright steps, webkit then the perf budgets, one
  // log. Their `N passed` lines are summed rather than "last match wins" so
  // the count covers both steps.
  const webkitJob = jobs.find((j) => j.name === 'e2e-webkit');
  let webkit = null;
  if (webkitJob) {
    const webkitStep = findStep(webkitJob, /^Run Playwright e2e tests \(product webkit/);
    const perfStep = findStep(webkitJob, /^Run Playwright e2e tests \(performance budgets/);
    let count = null;
    if (webkitStep && webkitStep.conclusion !== 'skipped') {
      const log = cachedText(`job-${webkitJob.databaseId}-log`, () =>
        gh(['api', `/repos/{owner}/{repo}/actions/jobs/${webkitJob.databaseId}/logs`])
      );
      const passed = [...log.matchAll(/(\d+) passed/g)].map((m) => Number(m[1]));
      count = passed.length ? passed.reduce((a, b) => a + b, 0) : null;
    }
    webkit = {
      webkitSeconds: stepDurationSeconds(webkitStep),
      perfSeconds: stepDurationSeconds(perfStep),
      count,
      jobSeconds: jobSeconds(webkitJob),
    };
  }

  // QUAL-06's shards. Step and job duration only (no log fetch): the
  // ticket's target is the job's wall time, and the guard count is fixed by
  // playwright.config.js's two hand-balanced projects, not by narrowing.
  // Before QUAL-06 (2026-09-14) the job was unsharded and named plain
  // `font-guards`; a skipped-by-condition matrix job also reports under the
  // bare name, with its step skipped. Both shapes count for "did the guards
  // run" (fontsRan); only the `(n)` shards feed the per-shard medians, since
  // a whole-suite time is not comparable to a shard's.
  const fontJobs = jobs
    .filter((j) => /^font-guards( \(\d+\))?$/.test(j.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const fontShards = fontJobs.map((job) => {
    const step = findStep(job, /^Run Playwright e2e tests \(font guards/);
    const ran = Boolean(step) && step.conclusion !== 'skipped';
    return {
      name: job.name,
      unsharded: !/\(\d+\)$/.test(job.name),
      ran,
      seconds: ran ? stepDurationSeconds(step) : null,
      jobSeconds: ran ? jobSeconds(job) : null,
    };
  });
  const fontsRan = fontShards.some((shard) => shard.ran);

  rows.push({
    run: run.databaseId,
    sha: run.headSha.slice(0, 8),
    event: run.event,
    createdAt: run.createdAt,
    conclusion: run.conclusion,
    wallSeconds,
    longestJob,
    verdict,
    reason,
    checksTestSeconds,
    e2e: e2eInfo,
    webkit,
    fontsRan,
    fontShards,
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
  '| run | sha | event | verdict | reason | wall(s) | longest job | checks-tests(s) | e2e(1) s/n | e2e(2) s/n | webkit+perf s/n | fonts(1) s | fonts(2) s |'
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const e2e = [0, 1].map((i) => r.e2e[i] ? `${fmt(r.e2e[i].seconds)}/${r.e2e[i].count ?? '-'}` : '-');
  const webkit = r.webkit
    ? `${fmt(r.webkit.webkitSeconds)}+${fmt(r.webkit.perfSeconds)}/${r.webkit.count ?? '-'}`
    : '-';
  const fonts = [0, 1].map((i) =>
    r.fontShards[i]
      ? r.fontShards[i].ran
        ? `${fmt(r.fontShards[i].seconds)}${r.fontShards[i].unsharded ? ' (unsharded)' : ''}`
        : 'skip'
      : '-'
  );
  console.log(
    `| ${r.run} | ${r.sha} | ${r.event} | ${r.verdict} | ${r.reason.replace(/\|/g, '\\|')} | ${fmt(
      r.wallSeconds
    )} | ${r.longestJob ? `${r.longestJob.name} ${fmt(r.longestJob.seconds)}` : '-'} | ${fmt(
      r.checksTestSeconds
    )} | ${e2e[0]} | ${e2e[1]} | ${webkit} | ${fonts[0]} | ${fonts[1]} |`
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
// QUAL-06 (font shards under 120s) and QUAL-09 (chromium shards under 100s,
// webkit under 120s) each set their targets on five runs, in job time. Same
// statistic here on every green run in the window: `everything` runs (the
// full suite, what both tickets measured) and narrowed runs separately,
// since a narrowed chromium shard runs a subset and is not comparable.
const shardOnly = (r) => r.fontShards.filter((s) => !s.unsharded);
function jobMedians(group) {
  const pick = (get) => median(group.map(get));
  return {
    chromiumStep: [0, 1].map((i) => pick((r) => r.e2e[i]?.seconds)),
    chromiumJob: [0, 1].map((i) => pick((r) => r.e2e[i]?.jobSeconds)),
    webkitStep: pick((r) => r.webkit?.webkitSeconds),
    perfStep: pick((r) => r.webkit?.perfSeconds),
    webkitJob: pick((r) => r.webkit?.jobSeconds),
    fontsStep: [0, 1].map((i) => pick((r) => shardOnly(r)[i]?.seconds)),
    fontsJob: [0, 1].map((i) => pick((r) => shardOnly(r)[i]?.jobSeconds)),
    fontsN: group.filter((r) => r.fontsRan).length,
    fontsShardedN: group.filter((r) => shardOnly(r).some((s) => s.ran)).length,
    longest: pick((r) => r.longestJob?.seconds),
  };
}
console.log('\n### Per-job medians on green runs (QUAL-06 / QUAL-09 targets)\n');
console.log(
  'step = the Playwright step alone; job = checkout through the last step, the unit both tickets measured in.\n'
);
const green = rows.filter((r) => r.conclusion === 'success' && r.verdict !== 'docs_only');
for (const [label, group] of [
  ['everything (full suite)', green.filter((r) => r.verdict === 'everything')],
  ['narrow', green.filter((r) => r.verdict === 'narrow')],
]) {
  const m = jobMedians(group);
  console.log(
    `- **${label}** (n=${group.length}, guards ran on ${m.fontsN}, sharded on ${m.fontsShardedN}): ` +
      `chromium shards step ${fmt(m.chromiumStep[0])}s / ${fmt(m.chromiumStep[1])}s, job ${fmt(
        m.chromiumJob[0]
      )}s / ${fmt(m.chromiumJob[1])}s; ` +
      `webkit step ${fmt(m.webkitStep)}s + perf ${fmt(m.perfStep)}s, job ${fmt(m.webkitJob)}s; ` +
      `font shards step ${fmt(m.fontsStep[0])}s / ${fmt(m.fontsStep[1])}s, job ${fmt(
        m.fontsJob[0]
      )}s / ${fmt(m.fontsJob[1])}s; longest job ${fmt(m.longest)}s`
  );
}
const longestTally = {};
for (const r of green) {
  if (r.longestJob) longestTally[r.longestJob.name] = (longestTally[r.longestJob.name] || 0) + 1;
}
console.log(
  `\nWhich job set the wall (green, non-docs runs): ${Object.entries(longestTally)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ${n}x`)
    .join(', ')}`
);

const fontsOnCount = rows.filter((r) => r.fontsRan).length;
console.log(
  `\nfont-guards Playwright step actually ran: ${fontsOnCount}/${rows.length} (${(
    (fontsOnCount / rows.length) *
    100
  ).toFixed(0)}%)`
);
