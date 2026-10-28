import { describe, expect, it } from 'vitest';
import { findLibShapeViolations, findShapeViolations } from './check-tool-shape.mjs';

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

// ARCH-101: src/lib/ root holds only project.json; everything else lives in a domain folder.
describe('findLibShapeViolations', () => {
  it('fails a flat root file', () => {
    expect(findLibShapeViolations(['src/lib/pageOps.ts'])).toEqual(['src/lib/pageOps.ts']);
  });
  it('passes project.json at the root', () => {
    expect(findLibShapeViolations(['src/lib/project.json'])).toEqual([]);
  });
  it('passes a file in an allowed folder', () => {
    expect(findLibShapeViolations(['src/lib/pdf/loadPdfPages.ts'])).toEqual([]);
  });
  it('passes a nested file under an allowed folder', () => {
    expect(findLibShapeViolations(['src/lib/drafts/store/a/b.ts'])).toEqual([]);
  });
  it('fails a file in an unknown folder', () => {
    expect(findLibShapeViolations(['src/lib/misc/a.ts'])).toEqual(['src/lib/misc/a.ts']);
  });
  it('ignores paths outside src/lib', () => {
    expect(findLibShapeViolations(['src/tools/x/helper.ts', 'src/editor/a.js'])).toEqual([]);
  });
});
