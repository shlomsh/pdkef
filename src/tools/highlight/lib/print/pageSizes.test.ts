import { describe, expect, it } from 'vitest';
import { pageSizes } from './pageSizes.ts';

describe('pageSizes', () => {
  it('gives every distinct sheet size a named @page with no margin, and the first size as the default', () => {
    const { names, rules } = pageSizes([{ width: 432, height: 648 }, { width: 648, height: 432 }, { width: 432, height: 648 }]);
    expect(names).toEqual(['pdkef-sheet-0', 'pdkef-sheet-1', 'pdkef-sheet-0']);
    expect(rules).toEqual([
      '@page { size: 432pt 648pt; margin: 0; }',
      '@page pdkef-sheet-0 { size: 432pt 648pt; margin: 0; }',
      '@page pdkef-sheet-1 { size: 648pt 432pt; margin: 0; }',
    ]);
  });

  it('has nothing to say about no sheets', () => {
    expect(pageSizes([])).toEqual({ names: [], rules: [] });
  });
});
