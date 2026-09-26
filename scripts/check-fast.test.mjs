import { describe, it, expect } from 'vitest';
import { chooseTypecheck, parseArgs, summaryLine } from './check-fast.mjs';
import { ORACLE_FILES } from './unit-scope.mjs';

describe('chooseTypecheck', () => {
  const ok = { astroTypesExist: true };

  it('runs tsc for a .ts/.tsx-only edit', () => {
    expect(chooseTypecheck({ ...ok, files: ['src/tools/sign/fill/fillTap.ts', 'src/tools/sign/PdfSignTool.tsx'] }).tool).toBe('tsc');
  });

  it('runs tsc for an empty diff', () => {
    expect(chooseTypecheck({ ...ok, files: [] }).tool).toBe('tsc');
  });

  it.each([
    'src/pages/index.astro',
    'tsconfig.json',
    'astro.config.mjs',
    'package.json',
    'package-lock.json',
    'src/content.config.ts',
    'scripts/check-fast.mjs',
  ])('runs astro check when %s changed', (file) => {
    expect(chooseTypecheck({ ...ok, files: ['src/lib/pdfRender.js', file] }).tool).toBe('astro');
  });

  it('fails open to astro check without a base', () => {
    expect(chooseTypecheck({ ...ok, files: null }).tool).toBe('astro');
  });

  it('fails open to astro check before .astro/types.d.ts exists', () => {
    expect(chooseTypecheck({ files: ['src/lib/a.ts'], astroTypesExist: false }).tool).toBe('astro');
  });
});

describe('parseArgs', () => {
  it('defaults to no --since', () => {
    expect(parseArgs([])).toEqual({ since: undefined });
  });

  it('reads --since <ref>', () => {
    expect(parseArgs(['--since', 'abc1234'])).toEqual({ since: 'abc1234' });
  });

  it('rejects --since without a ref', () => {
    expect(parseArgs(['--since'])).toHaveProperty('error');
    expect(parseArgs(['--since', '--other'])).toHaveProperty('error');
  });
});

describe('summaryLine', () => {
  const steps = [
    { name: 'guards', seconds: 1.3 },
    { name: 'units', seconds: 9.4, detail: '5 seeds' },
    { name: 'tsc', seconds: 2 },
  ];

  it('reports a pass with per-step times and the --since ref', () => {
    expect(summaryLine({ ok: true, since: 'abc1234', base: 'abc1234', steps })).toBe(
      'check:fast PASS in 12.7s, since abc1234: guards 1.3s, units 9.4s (5 seeds), tsc 2.0s',
    );
  });

  it('names the failed step and the merge-base when no --since was given', () => {
    expect(summaryLine({ ok: false, failed: 'units', base: 'deadbeefcafe', steps: steps.slice(0, 2) })).toBe(
      'check:fast FAIL at units in 10.7s, since merge-base deadbee: guards 1.3s, units 9.4s (5 seeds)',
    );
  });
});

it('is itself an oracle file, so changing it widens the unit run', () => {
  expect(ORACLE_FILES.has('scripts/check-fast.mjs')).toBe(true);
});
