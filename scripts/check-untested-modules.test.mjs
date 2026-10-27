import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findUntestedModuleProblems, isCandidate } from './check-untested-modules.mjs';

const roots = [];
function plant(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'untested-modules-'));
  roots.push(root);
  for (const [rel, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), source);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('findUntestedModuleProblems (ARCH-81)', () => {
  it('fails an unreferenced module that is not allowlisted', () => {
    const root = plant({ 'src/lib/a.ts': 'export const a = 1;\n' });
    expect(findUntestedModuleProblems(root, [])).toEqual([
      { file: 'src/lib/a.ts', reason: 'no test references it: write a test for it' },
    ]);
  });

  it('passes a module with a sibling test', () => {
    const root = plant({ 'src/lib/a.ts': 'export const a = 1;\n', 'src/lib/a.test.ts': '' });
    expect(findUntestedModuleProblems(root, [])).toEqual([]);
  });

  it('passes a module a test elsewhere imports directly', () => {
    const root = plant({
      'src/tools/x/lib/a.ts': 'export const a = 1;\n',
      'src/test/cross/a.test.ts': "import { a } from '../../tools/x/lib/a.ts';\n",
    });
    expect(findUntestedModuleProblems(root, [])).toEqual([]);
  });

  it('passes a module a scripts test imports', () => {
    const root = plant({
      'src/editor/a.js': 'export const a = 1;\n',
      'scripts/a.test.mjs': "import { a } from '../src/editor/a.js';\n",
    });
    expect(findUntestedModuleProblems(root, [])).toEqual([]);
  });

  it('passes an unreferenced module that is allowlisted', () => {
    const root = plant({ 'src/lib/a.ts': 'export const a = 1;\n' });
    expect(findUntestedModuleProblems(root, ['src/lib/a.ts'])).toEqual([]);
  });

  it('fails an allowlist entry that is now referenced', () => {
    const root = plant({ 'src/lib/a.ts': 'export const a = 1;\n', 'src/lib/a.test.ts': '' });
    expect(findUntestedModuleProblems(root, ['src/lib/a.ts'])).toEqual([
      { file: 'src/lib/a.ts', reason: 'allowlisted but now referenced: remove it from the allowlist' },
    ]);
  });

  it('fails an allowlist entry whose file no longer exists', () => {
    const root = plant({ 'src/lib/b.ts': '', 'src/lib/b.test.ts': '' });
    expect(findUntestedModuleProblems(root, ['src/lib/gone.ts'])).toEqual([
      { file: 'src/lib/gone.ts', reason: 'allowlisted but no longer exists: remove it from the allowlist' },
    ]);
  });

  it('ignores hooks, tsx, d.ts, e2e and fixtures', () => {
    const root = plant({
      'src/lib/useThing.ts': 'export const useThing = 1;\n',
      'src/lib/Comp.tsx': 'export const C = 1;\n',
      'src/lib/types.d.ts': 'export {};\n',
      'src/tools/x/e2e/helper.ts': 'export {};\n',
      'src/lib/__fixtures__/f.js': 'export {};\n',
      'src/shell/outside.js': 'export {};\n',
    });
    expect(findUntestedModuleProblems(root, [])).toEqual([]);
  });

  it('keeps a lowercase use-prefixed file as a candidate', () => {
    expect(isCandidate('src/lib/user.ts')).toBe(true);
    expect(isCandidate('src/lib/useThing.ts')).toBe(false);
  });
});
