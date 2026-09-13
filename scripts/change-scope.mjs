#!/usr/bin/env node
// Classifies a change so CI and the local pre-push chain run what the change
// can affect, and is the one place that says what the classes are. ci.yml's
// `scope` job and the local `test:e2e` script both ask here, so the answer
// cannot drift between them.
//
// Two verdicts today:
//
//   docs_only  Every changed file is a backlog task, a design record, the
//              agent guidance, or a root markdown file. A third of the commits
//              on main are board updates; they need check:backlog and
//              check:guidance and nothing that builds or opens a browser.
//              THIRD_PARTY_LICENSES.md is not in this class: a unit test reads
//              it against the licenses page.
//
//   fonts      Something the font screening guards (the `fonts` Playwright
//              project) load changed. The guards pixel-diff the shaped output
//              of the fonts in public/fonts through the export core in
//              src/editor, which reaches into src/lib; the harnesses under
//              e2e/sign read fixtures from src/test/fixtures and the manifest
//              scripts. Fonts rarely change, so when anything in that graph
//              does, all 27 guards run. `src/components/SignTool/` dropped
//              from this list under ARCH-19: an esbuild metafile of
//              src/editor/adapters/pdf/sign.js's export graph confirmed it no
//              longer reaches anything under src/components/ (registry/text.ts
//              and registry/renderers.ts, the two paths that used to pull
//              Sign's UI in, now read through registered core-owned modules
//              instead of importing the tool directly).
//
// Fails open: when the base cannot be resolved (first push of a branch, a
// force-push, no origin/main locally), nothing is docs-only and the guards run.
//
//   node scripts/change-scope.mjs --base <ref>             prints docs_only=… and fonts=…
//   node scripts/change-scope.mjs --base <ref> --run <cmd> runs <cmd> only if fonts changed
//
// Without --base it compares the working tree against the merge base with
// origin/main, which is what a developer about to push wants.

import { execFileSync, spawnSync } from 'node:child_process';

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

export const FONT_GUARD_INPUTS = [
  /^public\/fonts\//,
  /^src\/editor\//,
  /^src\/lib\//,
  /^src\/test\/fixtures\//,
  /^e2e\/sign\//,
  /^scripts\/[^/]*(font|language)/,
  /^scripts\/change-scope\.mjs$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^patches\//,
  /^playwright\.config\.js$/,
  /^astro\.config\.mjs$/,
  /^\.github\/workflows\/ci\.yml$/,
];

export function isDocsOnly(file) {
  return DOCS_ONLY.some((pattern) => pattern.test(file));
}

export function isFontGuardInput(file) {
  return FONT_GUARD_INPUTS.some((pattern) => pattern.test(file));
}

export function classify(files) {
  return {
    docs_only: files.length > 0 && files.every(isDocsOnly),
    fonts: files.some(isFontGuardInput),
  };
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
  let scope = { docs_only: false, fonts: true };
  if (!base) {
    console.error(`change-scope: no usable base (${explicitBase ?? 'origin/main'}); treating the change as touching everything.`);
  } else {
    const files = changedFiles(base);
    scope = classify(files);
    const hits = files.filter(isFontGuardInput);
    if (scope.docs_only) {
      console.error(`change-scope: all ${files.length} changed files since ${base.slice(0, 7)} are docs or backlog; only the backlog and guidance checks apply.`);
    } else if (scope.fonts) {
      console.error(`change-scope: ${hits.length} of ${files.length} changed files are font-guard inputs:`);
      for (const file of hits) console.error(`  ${file}`);
    } else {
      console.error(`change-scope: none of ${files.length} changed files since ${base.slice(0, 7)} is a font-guard input; the font guards can be skipped.`);
    }
  }

  if (!command) {
    console.log(`docs_only=${scope.docs_only}`);
    console.log(`fonts=${scope.fonts}`);
    return 0;
  }
  if (!scope.fonts) return 0;
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
