#!/usr/bin/env node
// ARCH-20 (dev-only, not wired into ci.yml or package.json's scripts):
// classifies each of the last N commits on `main` with the REAL
// scripts/affected-scope.mjs logic - no pre-move regex table. The
// arch-20-prep branch's own version of this script had to keep a
// hand-maintained "where would this file live once ARCH-17/18 land" map,
// because those folders did not exist yet on that branch. They exist now, so
// this script asks affected-scope.mjs directly, once per commit, and reports
// what it actually resolves.
//
// Buckets:
//   docs_only  every changed file is a backlog/docs/root-markdown file (or
//              the merge/rename touched nothing at all - the diff is empty)
//   narrow     affected-scope.mjs resolved without everything=true; reports
//              the affected tool/site-e2e/fonts project list
//   everything affected-scope.mjs set everything=true; reports why (the
//              `reason` string affected-scope.mjs itself prints to stderr)
//
// Usage: node scripts/nx-affected-histogram.mjs [--count 200]
//
// Caveat this run's own numbers must be read against: this worktree forked
// right at the tail of the ARCH-16..19 folder-moving sequence (see git log -
// ARCH-16 lands ~40 commits back, ARCH-17/18 in the last dozen). Most of a
// 200-commit window predates that layout, so a commit's own historical files
// (e.g. src/components/MergeTool/...) are not owned by any project this
// repo's project.json files declare today, and it is correctly classified
// `everything` (the "unowned files" rule) - not because narrowing does not
// work, but because the layout it targets did not exist yet when that commit
// landed. Read the buckets below as "what would happen if this exact diff
// landed today," not as a verdict on whether ARCH-20 narrows in general -
// scripts/affected-scope.mjs's own single-file tests (see
// docs/nx-affected-ci.md) demonstrate the narrowing directly, on paths that
// exist in the current tree.

import { execFileSync } from 'node:child_process';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const countIdx = args.indexOf('--count');
const COUNT = countIdx >= 0 ? Number(args[countIdx + 1]) : 200;
const BASE_REF = 'HEAD';

function git(gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8', cwd: ROOT }).trim();
}

// Runs affected-scope.mjs once for this commit's own diff (base=sha~1,
// head=sha) and returns its parsed KEY=value stdout plus its one-line stderr
// reason. affected-scope.mjs always exits 0 once it has resolved a scope
// (there is no failure path once `nx` itself runs cleanly), so a thrown error
// here means the shell-out itself failed (bad sha, nx crashed) - reported as
// its own bucket, not folded into `everything`.
function classifyCommit(sha) {
  try {
    const result = execFileSync(
      'node',
      [join(ROOT, 'scripts', 'affected-scope.mjs'), '--base', `${sha}~1`, '--head', sha],
      { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const kv = Object.fromEntries(
      result.trim().split('\n').filter(Boolean).map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
    );
    return {
      everything: kv.everything === 'true',
      affected: JSON.parse(kv.affected || '[]'),
      fonts: kv.fonts === 'true',
    };
  } catch (err) {
    return { error: (err.stderr || err.message || '').toString().trim() };
  }
}

function main() {
  const shas = git(['log', '--format=%H', '-n', String(COUNT), BASE_REF]).split('\n').filter(Boolean);
  console.log(`Measuring the last ${shas.length} commits on ${BASE_REF} (${shas[shas.length - 1]?.slice(0, 7)}..${shas[0]?.slice(0, 7)}).`);

  const buckets = { docs_only: 0, narrow: 0, everything: 0 };
  const narrowExamples = [];
  let processed = 0;
  let scriptErrors = 0;

  for (const sha of shas) {
    try {
      git(['rev-parse', '--verify', `${sha}~1^{commit}`]);
    } catch {
      continue; // root commit, nothing to diff against
    }

    const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean);
    const result = classifyCommit(sha);
    if (result.error) { scriptErrors += 1; continue; }

    if (files.length > 0 && result.affected.length === 0 && !result.everything) {
      buckets.docs_only += 1;
    } else if (result.everything) {
      buckets.everything += 1;
    } else {
      buckets.narrow += 1;
      if (narrowExamples.length < 12) narrowExamples.push({ sha: sha.slice(0, 7), affected: result.affected });
    }
    processed += 1;
    if (processed % 25 === 0) console.error(`  ...${processed}/${shas.length}`);
  }

  console.log(`\nBuckets (of ${processed} commits classified, ${scriptErrors} script errors):`);
  for (const [bucket, n] of Object.entries(buckets)) {
    console.log(`  ${bucket}: ${n}`);
  }

  if (narrowExamples.length > 0) {
    console.log('\nSample narrow commits (affected project list):');
    for (const { sha, affected } of narrowExamples) {
      console.log(`  ${sha}: ${affected.join(', ')}`);
    }
  }
}

main();
