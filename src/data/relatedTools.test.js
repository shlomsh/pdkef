import { describe, expect, it } from 'vitest';
import { listedTools, tools } from './tools.js';
import { DEFAULT_RELATED, RELATED_COUNT, relatedFor, relatedTools } from './relatedTools.js';

const listed = new Set(listedTools.map((t) => t.slug));

describe('relatedTools (SITE-47)', () => {
  it('has a list for every listed tool and for nothing else', () => {
    expect(Object.keys(relatedTools).sort()).toEqual([...listed].sort());
  });

  it.each(Object.entries(relatedTools))('%s lists three distinct other listed tools', (slug, related) => {
    expect(related).toHaveLength(RELATED_COUNT);
    expect(new Set(related).size).toBe(RELATED_COUNT);
    expect(related).not.toContain(slug);
    for (const r of related) expect(listed.has(r), r).toBe(true);
  });

  it('gives a page that is no tool the default three', () => {
    expect(DEFAULT_RELATED).toHaveLength(RELATED_COUNT);
    for (const r of DEFAULT_RELATED) expect(listed.has(r), r).toBe(true);
    expect(relatedFor('')).toEqual(DEFAULT_RELATED);
  });

  it('gives a variant page its parent tool list, never the variant itself', () => {
    const variants = tools.filter((t) => 'variantOf' in t && t.variantOf);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(relatedFor(v.slug)).toEqual(relatedTools[v.variantOf]);
      expect(relatedFor(v.slug)).not.toContain(v.slug);
    }
  });
});
