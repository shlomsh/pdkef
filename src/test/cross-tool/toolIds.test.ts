import { describe, expect, expectTypeOf, it } from 'vitest';
import { tools, toolIdOf } from '../../data/tools.js';
import { LOCALIZED_TOOL_ISLANDS } from '../../i18n/localizedTools.ts';
import { ANALYTICS_TOOLS } from '../../lib/usageEventSchema.ts';
import { RATING_TOOLS } from '../../lib/ratingSchema.ts';
import type { HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import type { ToolSlug } from '../../site-lib/routeFiles.ts';
import { TOOL_PAGES, TOOL_IDS, type ToolPage, type HandoffTargetId, LOCALIZED_ISLAND_SLUGS, handoffKeyOf, handoffHrefOf } from '../../lib/toolIds.ts';

// ARCH-38: src/lib/toolIds.ts is the one list a new tool is added to; src/data/tools.js stays the
// SEO/content registry. These two must name the same pages, or one of them has been edited alone.
describe('toolIds.ts and src/data/tools.js agree', () => {
  it('every page in tools.js is in toolIds.ts, and the other way round, in the same order', () => {
    expect(TOOL_PAGES.map((p) => p.slug)).toEqual(tools.map((t) => t.slug));
  });

  it.each(tools.map((t) => [t.slug, t] as const))('%s: href, tool id and variant match', (slug, tool) => {
    const page: ToolPage = TOOL_PAGES.find((p) => p.slug === slug)!;
    expect(page.href).toBe(tool.href);
    expect(page.href).toMatch(/^\/[a-z0-9-]+\/$/);
    expect(page.id).toBe(toolIdOf(tool));
    expect(page.variantOf).toBe(tool.variantOf);
  });

  it('the analytics and rating lists are the registry ids (plus Protect, which has no page of its own)', () => {
    expect([...ANALYTICS_TOOLS]).toEqual([...TOOL_IDS]);
    expect([...RATING_TOOLS]).toEqual([...TOOL_IDS]);
    expect(TOOL_IDS).toContain('protect');
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length);
  });

  it('the localized-island set in i18n is the registry flag', () => {
    expect([...LOCALIZED_TOOL_ISLANDS].sort()).toEqual([...LOCALIZED_ISLAND_SLUGS].sort());
    expect(LOCALIZED_ISLAND_SLUGS.length).toBeGreaterThan(0);
  });

  it('a hand-off key is the island id, except Compress Image, which is the Compress island in image mode', () => {
    expect(handoffKeyOf('compress-image')).toBe('compress');
    expect(handoffKeyOf('rotate-pdf')).toBe('edit-pdf');
    expect(handoffKeyOf('sign')).toBe('sign');
  });

  it('a hand-off href is the listed page of the id, with the trailing slash', () => {
    expect(handoffHrefOf('edit-pdf')).toBe('/organize-pdf/');
    expect(handoffHrefOf('compress')).toBe('/compress/');
    expect(handoffHrefOf('protect')).toBeUndefined();
  });
});

// ARCH-64: the tool-keyed unions derive from the registry; these pin them to today's members, so a
// row added or flagged without meaning to fails typecheck here (tsc covers this file).
describe('registry-derived tool unions', () => {
  it('HandoffTool is exactly the five hand-off targets', () => {
    expectTypeOf<HandoffTool>().toEqualTypeOf<'compress' | 'sign' | 'merge' | 'redact' | 'edit-pdf'>();
  });

  it('HandoffTargetId is the registry flag and HandoffTool is that type', () => {
    expectTypeOf<HandoffTool>().toEqualTypeOf<HandoffTargetId>();
  });

  it('ToolSlug is exactly the ten pages the home dropzone can route to', () => {
    expectTypeOf<ToolSlug>().toEqualTypeOf<
      'sign' | 'redact' | 'merge' | 'pdf-to-image' | 'image-to-pdf' | 'split' | 'compress' | 'compress-image' | 'unlock' | 'organize-pdf'
    >();
  });
});
