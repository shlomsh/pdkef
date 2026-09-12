import { describe, expect, it } from 'vitest';
import { tools } from '../data/tools.js';
import { contentPages } from '../data/contentPages.js';
import { getToolCardCopy, getGuideCardCopy } from './cardMessages';

describe('getToolCardCopy', () => {
  it('has a Hebrew card entry for every tool in tools.js', () => {
    const missing = tools.filter((tool) => !getToolCardCopy('he', tool.slug)).map((tool) => tool.slug);
    expect(missing).toEqual([]);
  });
});

describe('getGuideCardCopy', () => {
  it('has a Hebrew card entry for every page in contentPages, keyed the way RelatedGuides.astro keys it', () => {
    // Same derivation as RelatedGuides.astro: strip the leading and trailing
    // slash off `href` to get the pageId passed to getGuideCardCopy.
    const missing = contentPages
      .map((page) => page.href.replace(/^\//, '').replace(/\/$/, ''))
      .filter((pageId) => !getGuideCardCopy('he', pageId));
    expect(missing).toEqual([]);
  });
});
