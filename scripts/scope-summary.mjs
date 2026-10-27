#!/usr/bin/env node
// ARCH-83: how far did affected-scope narrow this run? Pure functions turn the
// verdicts of change-scope / affected-scope / unit-scope into a markdown table
// for $GITHUB_STEP_SUMMARY; the CLI at the bottom gathers the inputs. Reporting
// only: nothing here decides what CI runs.
//
//   DOCS_ONLY=true|false node scripts/scope-summary.mjs --base <sha> >> "$GITHUB_STEP_SUMMARY"

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export const countSpecFiles = (names) => names.filter((n) => /\.spec\.(m?js|tsx?)$/.test(n)).length;

// scope: affected-scope's verdict (or null when docs-only), unit: unit-scope's
// (or null), specCount(path): spec files under one e2e path.
export function summarizeScope({ docsOnly, scope, unit, specCount, totals }) {
  if (docsOnly || !scope || !unit) {
    return {
      docsOnly: Boolean(docsOnly),
      widened: false,
      projects: { narrowed: 0, total: totals.projects },
      specs: { narrowed: 0, total: totals.specs },
      unit: { narrowed: 0, total: totals.unit },
      fonts: false,
      exportGuards: false,
      reasons: docsOnly ? ['docs-only change: no build, no browser'] : ['no scope verdict: CI fails open and runs everything'],
    };
  }
  const specs = scope.everything
    ? totals.specs
    : scope.e2e_paths.split(' ').filter(Boolean).reduce((n, p) => n + specCount(p), 0);
  return {
    docsOnly: false,
    widened: scope.everything || unit.all,
    projects: { narrowed: scope.everything ? totals.projects : scope.affected.length, total: totals.projects },
    specs: { narrowed: specs, total: totals.specs },
    unit: { narrowed: unit.all ? totals.unit : unit.seeds.length, total: totals.unit },
    fonts: scope.fonts,
    exportGuards: scope.export_guards,
    reasons: [scope.reason, ...unit.reasons],
  };
}

export function renderScopeSummary(s) {
  const row = (name, v) => `| ${name} | ${v.narrowed} | ${v.total} |`;
  return [
    '### Narrowing summary (ARCH-83)',
    '',
    '| | Narrowed | Full |',
    '| --- | --- | --- |',
    row('Projects', s.projects),
    row('E2E specs', s.specs),
    row('Unit files', s.unit),
    '',
    `- **verdict**: ${s.docsOnly ? 'docs-only' : s.widened ? 'widened to the full suite (partly or wholly)' : 'narrowed'}`,
    `- **font guards**: ${s.fonts ? 'run' : 'skipped'}; **export guards**: ${s.exportGuards ? 'run' : 'skipped'}`,
    ...s.reasons.map((r) => `- **reason**: ${r}`),
    '',
  ].join('\n');
}

async function main(argv) {
  const { resolveScope } = await import('./affected-scope.mjs');
  const { resolveUnitScope } = await import('./unit-scope.mjs');
  const i = argv.indexOf('--base');
  const base = i >= 0 ? argv[i + 1] : undefined;
  const docsOnly = process.env.DOCS_ONLY === 'true';
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  const totals = {
    projects: JSON.parse(execFileSync('npx', ['nx', 'show', 'projects', '--json'], { encoding: 'utf8', env: { ...process.env, NX_DAEMON: 'false' } })).length,
    specs: countSpecFiles(files),
    unit: files.filter((f) => /\.test\.(m?js|tsx?)$/.test(f)).length,
  };
  const specCount = (p) => countSpecFiles(files.filter((f) => f === p || f.startsWith(`${p.replace(/\/$/, '')}/`)));
  const scope = docsOnly ? null : resolveScope({ explicitBase: base });
  const unit = docsOnly ? null : resolveUnitScope({ explicitBase: base });
  const md = renderScopeSummary(summarizeScope({ docsOnly, scope, unit, specCount, totals }));
  process.stdout.write(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`scope-summary: ${err.message}`);
    process.exit(0); // reporting only: never fail CI
  });
}
