import { describe, expect, it } from 'vitest';
import { dockOrder } from './homeDock.js';

describe('dockOrder', () => {
  it('leads with Redact, Sign, Highlight, Compress and Merge, then the rest in registry order', () => {
    const tools = ['sign', 'redact', 'merge', 'pdf-to-image', 'compress', 'highlight-pdf', 'split'].map((slug) => ({ slug }));
    expect(dockOrder(tools).map((t) => t.slug)).toEqual(['redact', 'sign', 'highlight-pdf', 'compress', 'merge', 'pdf-to-image', 'split']);
  });

  it('skips a lead tool that is not listed', () => {
    expect(dockOrder([{ slug: 'split' }, { slug: 'sign' }]).map((t) => t.slug)).toEqual(['sign', 'split']);
  });
});
