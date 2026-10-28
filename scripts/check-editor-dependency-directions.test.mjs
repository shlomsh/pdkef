// Unit coverage for check-editor-dependency-directions.mjs's stale-exception
// detection, the same pattern check-module-boundaries.mjs's stale-allowlist
// handling already has a unit test for (check-module-boundaries.rules.test.mjs
// drives classify()/ruleViolation() the same way, against literal fixtures
// rather than the real tree). staleExceptions() is the guard's own exported
// pure function, not a reimplementation of it.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { staleExceptions } from './check-editor-dependency-directions.mjs';

describe('editor dependency-direction guard: staleExceptions()', () => {
  it('fails an exception that no resolved edge matches', () => {
    const exceptions = [
      { from: 'src/editor/model/nothing.ts', target: 'src/editor/registry/gone.ts', reason: 'no longer real' },
    ];
    expect(staleExceptions([], exceptions)).toEqual(exceptions);
  });

  it('clears a target-matched exception when a real edge matches it', () => {
    const exceptions = [
      { from: 'src/editor/registry/renderers.ts', target: 'src/editor/model/element.ts', reason: 'reads model' },
    ];
    const edges = [
      { from: 'src/editor/registry/renderers.ts', target: 'src/editor/model/element.ts', specifier: '../model/element.ts' },
    ];
    expect(staleExceptions(edges, exceptions)).toEqual([]);
  });

  it('clears a package-matched exception when a real edge matches it', () => {
    const exceptions = [
      { from: 'src/editor/registry/renderers.ts', package: 'preact', reason: 'creates Preact vnodes' },
    ];
    const edges = [
      { from: 'src/editor/registry/renderers.ts', target: null, specifier: 'preact' },
    ];
    expect(staleExceptions(edges, exceptions)).toEqual([]);
  });

  it('clears a targetPrefix-matched exception when a real edge matches it', () => {
    const exceptions = [
      { from: 'src/editor/registry/renderers.ts', targetPrefix: 'src/components/', reason: 'legacy seam' },
    ];
    const edges = [
      { from: 'src/editor/registry/renderers.ts', target: 'src/components/SignTool/Foo.tsx', specifier: '../../components/SignTool/Foo.tsx' },
    ];
    expect(staleExceptions(edges, exceptions)).toEqual([]);
  });

  it('does not clear an exception on a from-mismatch alone', () => {
    const exceptions = [
      { from: 'src/editor/registry/renderers.ts', package: 'preact', reason: 'creates Preact vnodes' },
    ];
    const edges = [
      { from: 'src/editor/registry/redactionSurface.ts', target: null, specifier: 'preact' },
    ];
    expect(staleExceptions(edges, exceptions)).toEqual(exceptions);
  });

  it('leaves a still-matched exception out of the stale list, alongside a stale one', () => {
    const liveException = { from: 'src/editor/registry/renderers.ts', package: 'preact', reason: 'live' };
    const deadException = { from: 'src/tools/sign/lib/textCoverage.js', target: 'src/editor/registry/text.ts', reason: 'retired bridge' };
    const edges = [
      { from: 'src/editor/registry/renderers.ts', target: null, specifier: 'preact' },
    ];
    expect(staleExceptions(edges, [liveException, deadException])).toEqual([deadException]);
  });
});

// ARCH-44: an aliased import (#editor/...) is resolved and judged exactly like the relative one.
describe('editor dependency-direction guard: layer aliases', () => {
  const run = (fixture) => {
    const root = fileURLToPath(new URL(`./fixtures/editor-dependency-directions/${fixture}`, import.meta.url));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-editor-dependency-directions.mjs', import.meta.url)), '--root', root], { encoding: 'utf8' });
    return result.stderr.split('\n').map((line) => line.trim());
  };
  const reasonOf = (lines, from) => lines.find((line) => line.startsWith(`${from} -> `))?.split(': ').slice(1).join(': ');

  it('flags a forbidden aliased import with the same reason as the relative spelling', () => {
    const lines = run('negative-alias');
    const viaRelative = reasonOf(lines, 'src/editor/model/viaRelative.ts');
    expect(viaRelative).toContain('model is pure');
    expect(reasonOf(lines, 'src/editor/model/viaAlias.ts')).toBe(viaRelative);
  });

  it('reports an alias that names no file like an unresolved relative import', () => {
    const lines = run('negative-alias-missing');
    expect(reasonOf(lines, 'src/editor/model/viaAlias.ts')).toContain('does not resolve to a source file');
  });
});
