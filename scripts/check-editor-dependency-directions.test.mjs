// Unit coverage for check-editor-dependency-directions.mjs's stale-exception
// detection, the same pattern check-module-boundaries.mjs's stale-allowlist
// handling already has a unit test for (check-module-boundaries.rules.test.mjs
// drives classify()/ruleViolation() the same way, against literal fixtures
// rather than the real tree). staleExceptions() is the guard's own exported
// pure function, not a reimplementation of it.
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
    const deadException = { from: 'src/editor/text/textCoverage.js', target: 'src/editor/registry/text.ts', reason: 'retired bridge' };
    const edges = [
      { from: 'src/editor/registry/renderers.ts', target: null, specifier: 'preact' },
    ];
    expect(staleExceptions(edges, [liveException, deadException])).toEqual([deadException]);
  });
});
