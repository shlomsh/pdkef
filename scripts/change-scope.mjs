#!/usr/bin/env node
// Classifies a change so CI and the local pre-push chain run what the change
// can affect, and is the one place that says what the classes are. ci.yml's
// `scope` job asks here for its own verdict; `scripts/affected-scope.mjs`
// imports this file's base resolution and changed-file list so the two
// scripts cannot resolve two different diffs.
//
// One verdict today:
//
//   docs_only  Every changed file is a backlog task, a design record, the
//              agent guidance, or a root markdown file. A third of the commits
//              on main are board updates; they need check:backlog and
//              check:guidance and nothing that builds or opens a browser.
//              THIRD_PARTY_LICENSES.md is not in this class: a unit test reads
//              it against the licenses page. DOCS_ONLY is a deliberate list of
//              exact root files, not a `*.md` pattern - ARCH-22 checked
//              whether THIRD_PARTY_LICENSES.md belonged in it (it is
//              generated, root-level, and unowned by any Nx project, so it
//              forces `scripts/affected-scope.mjs`'s "everything" rule
//              whenever it's the only non-source file in a push) and left it
//              out on purpose: it is never the *only* changed file in a real
//              push (its two generators always change a source file alongside
//              it), and the one case where it would be the sole change - a
//              hand edit no generator produced - is exactly the drift this
//              file's own comment above protects against. Widening on it is
//              cheap and correct; skipping the test that reads it is not.
//
// `fonts` (whether the 25 font screening guards must run) used to live here
// as a hand-kept list of glob patterns (`FONT_GUARD_INPUTS`). ARCH-20 retired
// that list in favour of asking Nx whether `scripts/affected-scope.mjs`'s
// `fonts` project (`public/fonts/`, `src/editor/`, `src/lib/`, `tool-sign`)
// was affected; ARCH-23 (2026-09-18) found that whole-project edge ran all
// the guards on any Sign/Redact UI change for zero coverage benefit, so
// `affected-scope.mjs` now decides `fonts` with its own small file-glob
// (`matchesFontsGlob`) instead of the Nx-affected verdict - see that
// function's own comment. The two guards that exercise the real export
// pipeline moved to a separate `export-guards` project, which still keeps a
// coarse Nx dependency on `editor`/`lib`/`tool-sign` on purpose. Either way,
// this file never decided `fonts` itself; it only supplies the base
// resolution and changed-file list both scripts share.
//
// The docs_only verdict has two readers, so CI and the deploy cannot disagree
// on what counts as docs-only: ci.yml's `scope` job, and vercel.json's
// `ignoreCommand`, which greps this script's output for docs_only=true to skip
// the production build (exit 0 skips, anything else builds). Vercel compares
// against the last deployed commit, VERCEL_GIT_PREVIOUS_SHA, and runs before
// npm install, so this file stays plain node and git.
//
// Fails open: when the base cannot be resolved (first push of a branch, a
// force-push, no origin/main locally, an empty previous deploy SHA), or --head
// does not resolve, nothing is docs-only.
//
//   node scripts/change-scope.mjs --base <ref>               prints docs_only=…
//   node scripts/change-scope.mjs --base <ref> --head <ref>  same, for the fixed
//                                                            commit range only
//
// Without --base it compares the working tree against the merge base with
// origin/main, which is what a developer about to push wants. With --head it
// looks at the commit range alone, with no working-tree or untracked files,
// which is what a deploy wants.

import { execFileSync } from 'node:child_process';

import { isEntry } from './is-entry.mjs';

export const DOCS_ONLY = [
  /^backlog\//,
  /^docs\//,
  /^BACKLOG\.md$/,
  /^TODO\.md$/,
  /^README\.md$/,
  /^CLAUDE\.md$/,
  /^ANALYTICS\.md$/, // ARCH-34: a hand-written doc; no test, build step or page reads it
  /^LICENSE$/,
  /^\.claude\//,
  /^\.impeccable\//,
];

export function isDocsOnly(file) {
  return DOCS_ONLY.some((pattern) => pattern.test(file));
}

export function classify(files) {
  return {
    docs_only: files.length > 0 && files.every(isDocsOnly),
  };
}

export function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Exported for scripts/affected-scope.mjs, so the two scripts resolve the
// same base the same way and cannot drift.
export function resolveBase(explicit, run = git) {
  if (explicit) {
    try {
      run(['rev-parse', '--verify', `${explicit}^{commit}`]);
      return explicit;
    } catch {
      return null;
    }
  }
  try {
    return run(['merge-base', 'origin/main', 'HEAD']);
  } catch {
    return null;
  }
}

// `head` is optional: with it, this is a fixed commit range (no working-tree
// or untracked files - used when affected-scope.mjs is asked to classify a
// specific historical commit). Without it, this is "what would I push right
// now" - the working tree against `base`, plus untracked files.
//
// Both `git diff` calls pass `--no-renames`: with git's default rename
// detection the old path of a moved file is absent from `--name-only`
// output, so a file moved from one tool's folder to another's affects only
// the destination and the source's tests are skipped (DEBT-03). Measured on
// this repo, `git diff --name-only 370ace3~1 370ace3 | grep -c
// SignTool` is 0, and 37 with `--no-renames`. A rename must
// affect both its source and its destination owners.
export function changedFiles(base, head, run = git) {
  if (head) {
    return run(['diff', '--no-renames', '--name-only', base, head]).split('\n').filter(Boolean);
  }
  const tracked = run(['diff', '--no-renames', '--name-only', base]).split('\n').filter(Boolean);
  const untracked = run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

// ARCH-28 (scripts/unit-scope.mjs): same shape as changedFiles() above, but
// keeps each file's git status ('A'/'M'/'D') instead of throwing it away -
// unit-scope.mjs needs to tell an unpaired deletion apart from an ordinary
// add/modify, since `vitest related` on a path that no longer exists
// silently selects zero tests (a deletion-blind widen rule has to catch
// that).
//
// Unlike changedFiles() above, this call leaves git's rename detection ON
// (`-M`): a real content-preserving move (`git diff --name-status -M`
// reports it as a single `R100\told\tnew` line) is reported here as the
// **new** path with status 'A' - it carries the same real import edges the
// old path did, so `vitest related` needs no special handling for it (per
// the ARCH-28 blind-spot inventory's Category 5). Only a path with no
// same-content match on the other side - a genuine deletion - keeps status
// 'D'. This is a deliberate divergence from changedFiles()'s own
// `--no-renames` choice: that function exists to decide Nx *ownership*,
// where DEBT-03 wants both a rename's source and destination folder treated
// as affected independently; this one exists to decide whether a path can
// still be fed to `vitest related` at all; a rename that changes not just
// location but the same import edges the old path had should not force the
// whole suite. A tracked file's status always wins over untracked (a file
// cannot be both); untracked files are reported as 'A', the only status
// `git ls-files --others` implies.
export function changedFilesWithStatus(base, head, run = git) {
  // -z output: NUL-separated tokens, names never quoted; a rename or copy is status, old, new.
  function parseNameStatus(output) {
    const tokens = output.split('\0').filter(Boolean);
    const files = [];
    for (let i = 0; i < tokens.length; ) {
      const status = tokens[i];
      if (status[0] === 'R' || status[0] === 'C') {
        // Report only the destination, which is what still exists and still carries the real edges.
        files.push({ path: tokens[i + 2], status: 'A', renamedFrom: tokens[i + 1] });
        i += 3;
      } else {
        files.push({ path: tokens[i + 1], status: status[0] });
        i += 2;
      }
    }
    return files;
  }

  if (head) {
    return parseNameStatus(run(['diff', '-z', '-M', '--name-status', base, head]));
  }
  const tracked = parseNameStatus(run(['diff', '-z', '-M', '--name-status', base]));
  const trackedPaths = new Set(tracked.map((f) => f.path));
  const untracked = run(['ls-files', '-z', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean)
    .filter((path) => !trackedPaths.has(path))
    .map((path) => ({ path, status: 'A' }));
  return [...tracked, ...untracked];
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function resolvesToCommit(ref, run) {
  try {
    run(['rev-parse', '--verify', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export function main(argv = [], { cwd = process.cwd(), log = console.log, err = console.error } = {}) {
  const run = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const explicitBase = flag(argv, '--base');
  const head = flag(argv, '--head');

  // A fixed range needs a real base: an empty one (no previous deploy) must not
  // fall back to the merge base with origin/main.
  const base = head !== undefined && !explicitBase ? null : resolveBase(explicitBase, run);
  let scope = { docs_only: false };
  if (!base) {
    err(`change-scope: no usable base (${explicitBase ?? 'origin/main'}); treating the change as touching everything.`);
  } else if (head !== undefined && !resolvesToCommit(head, run)) {
    err(`change-scope: no usable head (${head}); treating the change as touching everything.`);
  } else {
    const files = changedFiles(base, head, run);
    scope = classify(files);
    if (scope.docs_only) {
      err(`change-scope: all ${files.length} changed files since ${base.slice(0, 7)} are docs or backlog; only the backlog and guidance checks apply.`);
    } else {
      err(`change-scope: ${files.length} changed files since ${base.slice(0, 7)} are not all docs; the build and test jobs apply.`);
    }
  }

  log(`docs_only=${scope.docs_only}`);
  return 0;
}

if (isEntry(import.meta.url)) process.exit(main(process.argv.slice(2)));
