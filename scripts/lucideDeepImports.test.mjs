import { describe, expect, it } from 'vitest';
import { readIconMap, rewriteLucideImports } from './lucideDeepImports.mjs';

const map = new Map([['Undo2', '/x/undo-2.mjs'], ['Undo2Icon', '/x/undo-2.mjs'], ['Spline', '/x/spline.mjs']]);

describe('rewriteLucideImports', () => {
  it('turns each named icon into its own default import, keeping aliases', () => {
    const out = rewriteLucideImports("import { Undo2, Spline as Curve } from 'lucide-preact';\nuse();", map);
    expect(out).toBe('import Undo2 from "/x/undo-2.mjs";\nimport Curve from "/x/spline.mjs";\nuse();');
  });
  it('leaves names that are not icons on the barrel', () => {
    const out = rewriteLucideImports("import { Undo2, LucideProvider } from 'lucide-preact';", map);
    expect(out).toBe('import Undo2 from "/x/undo-2.mjs";\nimport { LucideProvider } from \'lucide-preact\';');
  });
  it('returns null when there is nothing to do', () => {
    expect(rewriteLucideImports("import { a } from 'other';", map)).toBeNull();
    expect(rewriteLucideImports("import { LucideProvider } from 'lucide-preact';", map)).toBeNull();
  });
  it('reads the real package barrel', () => {
    const real = readIconMap();
    expect(real.get('Undo2')).toMatch(/icons[\\/]undo-2\.mjs$/);
    expect(real.get('createLucideIcon')).toMatch(/[\\/]createLucideIcon\.mjs$/);
    expect(real.size).toBeGreaterThan(1000);
  });
});
