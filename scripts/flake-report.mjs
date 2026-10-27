#!/usr/bin/env node
// ARCH-85: per-spec failure and retry rates from Playwright JSON reports. Pure
// aggregation (reports in, rows and markdown out) plus a CLI that reads a
// directory of downloaded reports. The nightly job downloads the last N main
// runs' reports and calls this; reporting only.
//
//   node scripts/flake-report.mjs --dir <reports-dir> [--threshold 0.02] [--top 10]

import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// One entry per test: { key, results: [{ status, retry }] }.
export function parseReport(report) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const file = spec.file ?? suite.file ?? '';
        out.push({ key: `${file} > ${spec.title} [${test.projectName ?? ''}]`, results: test.results ?? [] });
      }
    }
    for (const child of suite.suites ?? []) walk({ ...child, file: child.file ?? suite.file });
  };
  for (const suite of report.suites ?? []) walk(suite);
  return out;
}

// Skipped attempts do not count as runs. A failure is any attempt that did not pass.
export function aggregate(reports) {
  const byKey = new Map();
  for (const report of reports) {
    for (const { key, results } of parseReport(report)) {
      const row = byKey.get(key) ?? { key, runs: 0, failures: 0, retries: 0 };
      for (const r of results) {
        if (r.status === 'skipped') continue;
        row.runs += 1;
        if (r.status !== 'passed') row.failures += 1;
        if ((r.retry ?? 0) > 0) row.retries += 1;
      }
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .filter((r) => r.runs > 0)
    .map((r) => ({ ...r, failureRate: r.failures / r.runs }))
    .sort((a, b) => b.failureRate - a.failureRate || b.retries - a.retries);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export function renderFlakeSummary(rows, { threshold = 0.02, runs = 0, top = 10 } = {}) {
  const limit = `${threshold * 100}%`;
  const above = rows.filter((r) => r.failureRate > threshold);
  const table = (list) => [
    '| Spec | Attempts | Failures | Retries | Failure rate |',
    '| --- | --- | --- | --- | --- |',
    ...list.map((r) => `| ${r.key} | ${r.runs} | ${r.failures} | ${r.retries} | ${pct(r.failureRate)} |`),
  ];
  const offenders = rows.filter((r) => r.failures > 0 || r.retries > 0).slice(0, top);
  return [
    '### Flake rates (ARCH-85)',
    '',
    `Over ${runs} main run${runs === 1 ? '' : 's'}, ${rows.length} specs.`,
    '',
    above.length ? `**Above ${limit}:**` : `No spec is above ${limit}.`,
    '',
    ...(above.length ? [...table(above), ''] : []),
    '### Top offenders',
    '',
    ...(offenders.length ? table(offenders) : ['None: every attempt passed first time.']),
    '',
  ].join('\n');
}

function jsonFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsonFiles(p) : name.endsWith('.json') ? [p] : [];
  });
}

function main(argv) {
  const arg = (name, d) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
  const files = jsonFiles(arg('--dir', 'flake-reports'));
  const reports = files.flatMap((f) => { try { return [JSON.parse(readFileSync(f, 'utf8'))]; } catch { return []; } });
  const md = renderFlakeSummary(aggregate(reports), { threshold: Number(arg('--threshold', '0.02')), top: Number(arg('--top', '10')), runs: Number(arg('--runs', files.length)) });
  process.stdout.write(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main(process.argv.slice(2));
