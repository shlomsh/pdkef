import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ARCH-38: "save the hand-off, then navigate" was copied seven times. It lives in
// src/lib/sendHandoff.ts now; nothing else may call the store's saveHandoff, and no tool keeps a
// HANDOFF_HREFS table of its own (the pages come from src/lib/toolIds.ts).
const ROOT = resolve(__dirname, '../../..');
const ALLOWED_CALLERS = new Set(['src/lib/sendHandoff.ts', 'src/lib/drafts/draftStore.ts']);

const sources = execFileSync('git', ['ls-files', 'src', 'api'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|jsx|astro)$/.test(f) && !/\.test\.|\.spec\.|__fixtures__/.test(f));

function offenders(pattern, allowed = new Set()) {
  return sources.filter((f) => !allowed.has(f) && pattern.test(readFileSync(join(ROOT, f), 'utf8')));
}

describe('hand-offs have one door', () => {
  it('no source calls saveHandoff( outside sendHandoff', () => {
    expect(offenders(/\bsaveHandoff\(/, ALLOWED_CALLERS)).toEqual([]);
  });

  it('no source imports saveHandoff from the store outside sendHandoff', () => {
    expect(offenders(/import\s*\{[^}]*\bsaveHandoff\b[^}]*\}/, ALLOWED_CALLERS)).toEqual([]);
  });

  it('no HANDOFF_HREFS table is declared', () => {
    expect(offenders(/\b\w*HANDOFF_HREFS\b/)).toEqual([]);
  });
});
