#!/usr/bin/env node
// Decides whether the font screening guards (the `fonts` Playwright project)
// can be skipped for a change, and is the one place that says what their
// inputs are. ci.yml's font-guard-inputs job and the local `test:e2e` script
// both ask here, so the answer cannot drift between them.
//
// The guards pixel-diff the shaped output of the fonts in public/fonts through
// the export core in src/editor, which reaches into src/lib and the SignTool
// messages; the harnesses under e2e/sign read fixtures from src/test/fixtures
// and the manifest scripts. A change anywhere in that graph, to the guards
// themselves, or to the dependency set runs them. A copy, page, backlog or
// other-tool change does not.
//
// Fails open: when the base cannot be resolved (first push of a branch, a
// force-push, no origin/main locally), the guards run.
//
//   node scripts/font-guard-inputs.mjs --base <ref>            prints changed=true|false
//   node scripts/font-guard-inputs.mjs --base <ref> --run <cmd> runs <cmd> only if changed
//
// Without --base it compares the working tree against the merge base with
// origin/main, which is what a developer about to push wants.

import { execFileSync, spawnSync } from 'node:child_process';

export const FONT_GUARD_INPUTS = [
  /^public\/fonts\//,
  /^src\/editor\//,
  /^src\/lib\//,
  /^src\/components\/SignTool\//,
  /^src\/test\/fixtures\//,
  /^e2e\/sign\//,
  /^scripts\/[^/]*(font|language)/,
  /^scripts\/font-guard-inputs\.mjs$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^patches\//,
  /^playwright\.config\.js$/,
  /^astro\.config\.mjs$/,
  /^\.github\/workflows\/ci\.yml$/,
];

export function isFontGuardInput(file) {
  return FONT_GUARD_INPUTS.some((pattern) => pattern.test(file));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function resolveBase(explicit) {
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

function changedFiles(base) {
  const tracked = git(['diff', '--name-only', base]).split('\n').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const runIndex = argv.indexOf('--run');
  const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  const command = runIndex >= 0 ? argv.slice(runIndex + 1) : null;

  const base = resolveBase(explicitBase);
  let changed = true;
  if (!base) {
    console.error(`font-guard-inputs: no usable base (${explicitBase ?? 'origin/main'}); the font guards run.`);
  } else {
    const files = changedFiles(base);
    const hits = files.filter(isFontGuardInput);
    changed = hits.length > 0;
    if (changed) {
      console.error(`font-guard-inputs: ${hits.length} of ${files.length} changed files are font-guard inputs:`);
      for (const file of hits) console.error(`  ${file}`);
    } else {
      console.error(`font-guard-inputs: none of ${files.length} changed files since ${base.slice(0, 7)} is a font-guard input; the font guards can be skipped.`);
    }
  }

  if (!command) {
    console.log(`changed=${changed}`);
    return 0;
  }
  if (!changed) return 0;
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
