#!/usr/bin/env node
// CI speed: split the chromium e2e spec files over N shards by recorded time
// (scripts/e2e-spec-seconds.json) instead of Playwright's path-order split.
//
// Usage: node scripts/e2e-shard-plan.mjs --shard <i>/<n> [--paths "<space separated paths>"]
//        node scripts/e2e-shard-plan.mjs --record <dir-of-playwright-json-reports>
// --shard prints this shard's files on one line, each as a Playwright filter
// matching exactly that file (empty line for an empty shard). Every job computes
// the same plan, so each file lands in exactly one shard. --record rewrites the
// seconds file: per spec, the sum of chromium retry-0 durations, median over runs.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECONDS_FILE = new URL('./e2e-spec-seconds.json', import.meta.url);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Distinct repo-relative spec files with at least one test, sorted. */
export function specFiles(report) {
  const files = new Set();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) if (spec.file) files.add(spec.file);
    for (const child of suite.suites ?? []) walk(child);
  };
  (report?.suites ?? []).forEach(walk);
  return [...files].sort();
}

/** Greedy longest-first into the least-loaded shard; returns n arrays of files. */
export function splitByTime(files, seconds, n) {
  const known = [...new Set(files)].map((f) => seconds[f]).filter((s) => typeof s === 'number');
  const fallback = known.length ? median(known) : 1;
  const weight = (f) => seconds[f] ?? fallback;
  const order = [...new Set(files)].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1));
  const shards = Array.from({ length: n }, () => ({ load: 0, files: [] }));
  for (const f of order) {
    const to = shards.reduce((best, s) => (s.load < best.load ? s : best));
    to.load += weight(f);
    to.files.push(f);
  }
  return shards.map((s) => s.files.sort());
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A Playwright path filter matching exactly this one file: anchored at the repo root, so a same-named
 * spec in another folder stays in its own shard. */
export const toFilter = (file, root = ROOT) => `^${resolve(root, file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

export function parseShard(value) {
  const m = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const [i, n] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`bad --shard "${value}", want <i>/<n> with 1 <= i <= n`);
  return { i, n };
}

function record(dir) {
  const runs = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'results.json') runs.push({ run: p.slice(dir.length).split('/')[1], report: JSON.parse(readFileSync(p, 'utf8')) });
    }
  };
  walk(dir);
  const perRun = new Map();
  const walkSuite = (run, suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.projectName !== 'chromium') continue;
        const ms = (t.results ?? []).filter((r) => r.retry === 0).reduce((a, r) => a + r.duration, 0);
        const m = perRun.get(run) ?? perRun.set(run, {}).get(run);
        m[spec.file] = (m[spec.file] ?? 0) + ms / 1000;
      }
    }
    for (const c of suite.suites ?? []) walkSuite(run, c);
  };
  for (const { run, report } of runs) (report.suites ?? []).forEach((s) => walkSuite(run, s));
  const all = {};
  for (const m of perRun.values()) for (const [f, s] of Object.entries(m)) (all[f] ??= []).push(s);
  const out = Object.fromEntries(Object.keys(all).sort().map((f) => [f, Math.round(median(all[f]) * 10) / 10]));
  writeFileSync(SECONDS_FILE, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`e2e-shard-plan: ${Object.keys(out).length} files from ${perRun.size} runs`);
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? '') : undefined);
  if (arg('--record') !== undefined) return record(arg('--record'));
  const { i, n } = parseShard(arg('--shard'));
  const paths = (arg('--paths') ?? '').trim().split(/\s+/).filter(Boolean);
  const res = spawnSync('npx', ['playwright', 'test', '--list', '--project=chromium', '--reporter=json', '--pass-with-no-tests', ...paths], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) throw new Error(`playwright --list failed (${res.error?.message ?? `exit ${res.status}`})`);
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    throw new Error('could not parse playwright --list output');
  }
  const seconds = JSON.parse(readFileSync(SECONDS_FILE, 'utf8'));
  console.log(splitByTime(specFiles(report), seconds, n)[i - 1].map((f) => toFilter(f)).join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(`e2e-shard-plan: ${e.message}`);
    process.exit(1);
  }
}
