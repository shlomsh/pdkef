import { describe, expect, it } from 'vitest';
import { dockOrder, variantGroups } from './homeDock.js';

describe('dockOrder', () => {
  it('leads with Redact, Sign, Highlight, Compress, Merge and Scan, then the rest in registry order', () => {
    const tools = ['sign', 'redact', 'merge', 'pdf-to-image', 'compress', 'highlight-pdf', 'split', 'scan-to-pdf'].map((slug) => ({ slug }));
    expect(dockOrder(tools).map((t) => t.slug)).toEqual(['redact', 'sign', 'highlight-pdf', 'compress', 'merge', 'scan-to-pdf', 'pdf-to-image', 'split']);
  });

  it('skips a lead tool that is not listed', () => {
    expect(dockOrder([{ slug: 'split' }, { slug: 'sign' }]).map((t) => t.slug)).toEqual(['sign', 'split']);
  });
});

describe('variantGroups', () => {
  it('puts each variant under its listed parent, parents in dock order, and skips parents without variants', () => {
    const tools = [
      { slug: 'split' },
      { slug: 'organize-pdf' },
      { slug: 'sign' },
      { slug: 'extract-pdf-pages', variantOf: 'split' },
      { slug: 'rotate-pdf', variantOf: 'organize-pdf' },
      { slug: 'remove-pages', variantOf: 'organize-pdf' },
    ];
    expect(variantGroups(tools).map((g) => [g.parent.slug, g.variants.map((v) => v.slug)])).toEqual([
      ['split', ['extract-pdf-pages']],
      ['organize-pdf', ['rotate-pdf', 'remove-pages']],
    ]);
  });
});
