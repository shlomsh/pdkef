#!/usr/bin/env node
// ARCH-123: how often the last N pushes to main narrowed. Lists the ci.yml push runs on main, pairs each
// with the push before it, replays the scope verdict for that range against today's project graph, and
// writes a markdown tally to the step summary. Reporting only: nothing reads it and it never gates a run.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, classify } from './change-scope.mjs';
import { resolveScope } from './affected-scope.mjs';

const KINDS = ['docs_only', 'narrowed', 'everything', 'nothing', 'unknown'];

// `runs` is newest first. Each run pairs with the next older run's head; re-runs of one head collapse.
export function pushRanges(runs) {
  const heads = [];
  for (const { head_sha: sha } of runs) if (!heads.includes(sha)) heads.push(sha);
  return heads.slice(0, -1).map((head, i) => ({ base: heads[i + 1], head }));
}

export function tallyVerdicts(verdicts) {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const reasons = {};
  for (const { kind, reason } of verdicts) {
    counts[kind] += 1;
    if (kind === 'everything') reasons[reason ?? 'no reason given'] = (reasons[reason ?? 'no reason given'] ?? 0) + 1;
  }
  return { counts, total: verdicts.length, reasons };
}

export function renderShare({ counts, total, reasons }, { window }) {
  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const lines = [
    `## Narrowed share of the last ${window} pushes to main`,
    '',
    'Each push is replayed against today\'s project graph, so older pushes show what the scope would be now.',
    '',
    '| Verdict | Pushes | Share |',
    '| --- | ---: | ---: |',
    ...KINDS.map((k) => `| ${k} | ${counts[k]} | ${pct(counts[k])}% |`),
  ];
  const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length) lines.push('', '**Why `everything` ran**', '', ...sorted.map(([reason, n]) => `- ${reason} (${n})`));
  return `${lines.join('\n')}\n`;
}

function hasCommit(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function verdictFor({ base, head }) {
  if (!hasCommit(base) || !hasCommit(head)) return { kind: 'unknown' };
  if (classify(changedFiles(base, head)).docs_only) return { kind: 'docs_only' };
  const scope = resolveScope({ explicitBase: base, explicitHead: head });
  if (scope.everything) return { kind: 'everything', reason: scope.reason };
  if (scope.affected.length === 0 && !scope.e2e_paths) return { kind: 'nothing' };
  return { kind: 'narrowed' };
}

function repoName() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return JSON.parse(execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' })).nameWithOwner;
}

function main() {
  const at = process.argv.indexOf('--limit');
  const limit = at === -1 ? 50 : Number(process.argv[at + 1]);
  const endpoint = `repos/${repoName()}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=${limit + 1}`;
  const { workflow_runs: runs } = JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const ranges = pushRanges(runs);
  const md = renderShare(tallyVerdicts(ranges.map(verdictFor)), { window: ranges.length });
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  else process.stdout.write(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
