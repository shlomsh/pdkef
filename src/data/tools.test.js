import { describe, it, expect } from 'vitest';
import { tools, toolsBySlug, toolIdOf, listedTools, pageForToolId } from './tools.js';

describe('tool registry helpers', () => {
  it('toolIdOf is the slug unless the entry or its parent says otherwise', () => {
    expect(toolIdOf(toolsBySlug['split'])).toBe('split');
    expect(toolIdOf(toolsBySlug['organize-pdf'])).toBe('edit-pdf');
  });

  it('a variant inherits its parent toolId', () => {
    expect(toolIdOf(toolsBySlug['rotate-pdf'])).toBe('edit-pdf');
    expect(toolIdOf(toolsBySlug['remove-pages'])).toBe('edit-pdf');
    expect(toolIdOf(toolsBySlug['add-page-numbers-to-pdf'])).toBe('edit-pdf');
    expect(toolIdOf(toolsBySlug['extract-pdf-pages'])).toBe('split');
  });

  it('listedTools leaves out variants only', () => {
    expect(listedTools.some((t) => t.variantOf)).toBe(false);
    expect(listedTools).toHaveLength(tools.filter((t) => !t.variantOf).length);
    expect(listedTools.map((t) => t.slug)).toContain('organize-pdf');
  });

  it('pageForToolId resolves a stored id to the listed page', () => {
    expect(pageForToolId('edit-pdf').slug).toBe('organize-pdf');
    expect(pageForToolId('split').slug).toBe('split');
    expect(pageForToolId('nope')).toBeUndefined();
  });

  it('every variant points at a listed parent and keeps slug = URL', () => {
    for (const t of tools.filter((x) => x.variantOf)) {
      expect(listedTools).toContain(toolsBySlug[t.variantOf]);
      expect(t.href).toBe(`/${t.slug}/`);
    }
  });
});
