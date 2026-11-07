import { describe, expect, it } from 'vitest';
import { listedTools, tools } from './tools.js';
import { relatedFor } from './relatedTools.js';

const listed = new Set(listedTools.map((t) => t.slug));

describe('relatedFor (SITE-47)', () => {
  it.each([...listed])('%s gets three distinct other listed tools', (slug) => {
    const related = relatedFor(slug);
    expect(related).toHaveLength(3);
    expect(new Set(related).size).toBe(3);
    expect(related).not.toContain(slug);
    for (const r of related) expect(listed.has(r), r).toBe(true);
  });

  it('gives a page that is no tool three listed tools', () => {
    const related = relatedFor('');
    expect(related).toHaveLength(3);
    for (const r of related) expect(listed.has(r), r).toBe(true);
  });

  it('gives a variant page its parent tool list, never the variant itself', () => {
    const variants = tools.filter((t) => 'variantOf' in t && t.variantOf);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(relatedFor(v.slug)).toEqual(relatedFor(v.variantOf));
      expect(relatedFor(v.slug)).not.toContain(v.slug);
    }
  });
});
