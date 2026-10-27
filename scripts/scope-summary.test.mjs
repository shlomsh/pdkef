import { describe, expect, it } from 'vitest';
import { countSpecFiles, renderScopeSummary, summarizeScope } from './scope-summary.mjs';

const totals = { projects: 40, specs: 137, unit: 509 };

describe('summarizeScope', () => {
  it('shows zero e2e, projects and unit files for a docs-only change', () => {
    const s = summarizeScope({ docsOnly: true, scope: null, unit: null, specCount: () => 99, totals });
    expect(s.projects.narrowed).toBe(0);
    expect(s.specs.narrowed).toBe(0);
    expect(s.unit.narrowed).toBe(0);
    expect(s.reasons).toEqual(['docs-only change: no build, no browser']);
    const md = renderScopeSummary(s);
    expect(md).toContain('| E2E specs | 0 | 137 |');
    expect(md).toContain('| Unit files | 0 | 509 |');
  });

  it('reports the full suite and the widening reasons when everything is affected', () => {
    const s = summarizeScope({
      docsOnly: false,
      scope: { everything: true, affected: ['lib', 'site'], e2e_paths: '', reason: 'core project affected: lib' },
      unit: { all: true, seeds: [], reasons: ['widen rule "x"'] },
      specCount: () => 0,
      totals,
    });
    expect(s.specs.narrowed).toBe(137);
    expect(s.unit.narrowed).toBe(509);
    expect(s.widened).toBe(true);
    const md = renderScopeSummary(s);
    expect(md).toContain('| E2E specs | 137 | 137 |');
    expect(md).toContain('core project affected: lib');
    expect(md).toContain('widen rule "x"');
  });

  it('counts narrowed specs from e2e_paths and seeds', () => {
    const s = summarizeScope({
      docsOnly: false,
      scope: { everything: false, affected: ['tool-sign'], e2e_paths: 'src/tools/sign/e2e e2e/home', reason: 'narrowed to tool-sign' },
      unit: { all: false, seeds: ['a.test.js', 'b.test.js'], reasons: ['narrowed to vitest related'] },
      specCount: (p) => (p === 'src/tools/sign/e2e' ? 12 : 3),
      totals,
    });
    expect(s.specs.narrowed).toBe(15);
    expect(s.unit.narrowed).toBe(2);
    expect(s.projects.narrowed).toBe(1);
    expect(s.widened).toBe(false);
  });
});

describe('countSpecFiles', () => {
  it('counts spec files in a list of names', () => {
    expect(countSpecFiles(['a.spec.js', 'b.spec.ts', 'c.test.js', 'd.js'])).toBe(2);
  });
});
