#!/usr/bin/env node
// Commit gate: `git commit` is refused when the most recent `npm run check:fast`
// FAILED on exactly the current working tree. Any change since, no record, or a
// PASS means the commit goes ahead. check-fast.mjs writes the record; the
// .githooks/pre-commit hook runs this file's main.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const RECORD_PATH = join('node_modules', '.cache', 'check-fast-last.json');

// Pure. sha1 of head, the binary diff against HEAD, and every untracked file (path and bytes).
export function fingerprintOf({ head, diff, untracked }) {
  const h = createHash('sha1');
  h.update(`${head}\n`);
  h.update(diff);
  for (const { path, content } of untracked) {
    h.update(`\0${path}\0${Buffer.byteLength(content)}\0`);
    h.update(content);
  }
  return h.digest('hex');
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return r.stdout;
}

// Throws when git fails; callers decide what that means.
export function treeFingerprint(cwd) {
  const head = git(cwd, ['rev-parse', 'HEAD']).toString().trim();
  // Files new since HEAD count as "untracked" whether or not they are staged, and are left out of the diff,
  // so `git add` before `git commit` does not change the fingerprint.
  const diff = git(cwd, ['diff', 'HEAD', '--binary', '--no-renames', '--diff-filter=a']);
  const fresh = git(cwd, ['ls-files', '-o', '--exclude-standard', '-z']).toString().split('\0');
  const added = git(cwd, ['diff', 'HEAD', '--name-only', '--no-renames', '--diff-filter=A', '-z']).toString().split('\0');
  const paths = [...new Set([...fresh, ...added])].filter(Boolean).sort();
  const untracked = paths.map((path) => {
    let content;
    try {
      content = readFileSync(join(cwd, path));
    } catch {
      content = Buffer.alloc(0); // a file that vanished or is a dangling link
    }
    return { path, content };
  });
  return fingerprintOf({ head, diff, untracked });
}

// Pure. Refuse only a FAIL recorded for exactly this tree.
export function decide(record, currentFingerprint) {
  if (!record || record.verdict !== 'FAIL' || !currentFingerprint || record.fingerprint !== currentFingerprint) {
    return { refuse: false, message: '' };
  }
  return { refuse: true, message: `commit refused: check:fast failed at ${record.failed} on this exact tree. Fix it, or commit with --no-verify.` };
}

function main(cwd) {
  try {
    const record = JSON.parse(readFileSync(join(cwd, RECORD_PATH), 'utf8'));
    const { refuse, message } = decide(record, treeFingerprint(cwd));
    if (refuse) {
      console.error(message);
      return 1;
    }
  } catch {
    // missing or unreadable record, or git failed: never block a commit
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.cwd()));
}
