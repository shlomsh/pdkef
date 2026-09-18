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
// Fails open: when the base cannot be resolved (first push of a branch, a
// force-push, no origin/main locally), nothing is docs-only.
//
//   node scripts/change-scope.mjs --base <ref>   prints docs_only=…
//
// Without --base it compares the working tree against the merge base with
// origin/main, which is what a developer about to push wants.

import { execFileSync } from 'node:child_process';

export const DOCS_ONLY = [
  /^backlog\//,
  /^docs\//,
  /^BACKLOG\.md$/,
  /^TODO\.md$/,
  /^README\.md$/,
  /^CLAUDE\.md$/,
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
export function resolveBase(explicit) {
  if (explicit) {
    try {
      git(['rev-parse', '--verify', `${explicit}^{commit}`]);
      return explicit;
    } catch {
      return null;
    }
  }
  try {
    return git(['merge-base', 'origin/main', 'HEAD']);
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
// src/components/SignTool` is 0, and 37 with `--no-renames`. A rename must
// affect both its source and its destination owners.
export function changedFiles(base, head, run = git) {
  if (head) {
    return run(['diff', '--no-renames', '--name-only', base, head]).split('\n').filter(Boolean);
  }
  const tracked = run(['diff', '--no-renames', '--name-only', base]).split('\n').filter(Boolean);
  const untracked = run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;

  const base = resolveBase(explicitBase);
  let scope = { docs_only: false };
  if (!base) {
    console.error(`change-scope: no usable base (${explicitBase ?? 'origin/main'}); treating the change as touching everything.`);
  } else {
    const files = changedFiles(base);
    scope = classify(files);
    if (scope.docs_only) {
      console.error(`change-scope: all ${files.length} changed files since ${base.slice(0, 7)} are docs or backlog; only the backlog and guidance checks apply.`);
    } else {
      console.error(`change-scope: ${files.length} changed files since ${base.slice(0, 7)} are not all docs; the build and test jobs apply.`);
    }
  }

  console.log(`docs_only=${scope.docs_only}`);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
