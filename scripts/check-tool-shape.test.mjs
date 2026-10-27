import { describe, expect, it } from 'vitest';
import { findShapeViolations } from './check-tool-shape.mjs';

// ARCH-45: every src/tools/<tool>/ follows one template. Pure over relative paths.
describe('findShapeViolations', () => {
  it('fails a stray root file', () => {
    expect(findShapeViolations(['src/tools/x/helper.ts'])).toEqual(['src/tools/x/helper.ts']);
  });
  it('fails a stray top-level folder', () => {
    expect(findShapeViolations(['src/tools/x/fill/a.ts'])).toEqual(['src/tools/x/fill/a.ts']);
  });
  it('passes every allowed shape', () => {
    const ok = [
      'PdfXTool.tsx', 'PdfXTool.test.tsx', 'PdfXTool.protected.test.tsx', 'PdfXTool.test.ts',
      'PdfXToolBar.tsx', 'PdfXTool.module.css', 'messages.ts', 'messages.test.ts', 'project.json',
      'components/A.tsx', 'hooks/useA.ts', 'lib/a.js', 'state/s.ts', 'e2e/a.spec.js', 'verb/v.ts', '__fixtures__/f.pdf',
    ].map((p) => `src/tools/x/${p}`);
    expect(findShapeViolations(ok)).toEqual([]);
  });
  it('passes nested feature folders', () => {
    expect(findShapeViolations(['src/tools/x/lib/fields/corpus/a.js', 'src/tools/x/components/details/B.tsx'])).toEqual([]);
  });
  it('ignores paths outside src/tools', () => {
    expect(findShapeViolations(['src/lib/a.js'])).toEqual([]);
  });
});
