/**
 * `contentPagesForTool` feeds RelatedGuides.astro, which is the only inbound
 * link most content pages have from a tool page. Order matters there for the
 * same reason the links exist at all: the first card is the most prominent
 * one a visitor sees and the strongest in-page link position.
 *
 * SEO-06 added `alsoHub`, a secondary hub so a page can also be linked from a
 * tool page with real search authority (`/redact/`, `/compress/`) without
 * moving the primary `hub` off the tool it actually belongs to. The first
 * implementation was a flat
 * `filter(hub === slug || alsoHub.includes(slug))`, which returns registry
 * order - and because the `sign`-hubbed entries are listed first, `/redact/`
 * rendered two loosely-related secondary cards ABOVE its own two topical
 * guides. A redact visitor's first "Documentation" card was a form-filling
 * guide, and the best link slot went to the least relevant page: the exact
 * inversion of what the secondary hubs were added to achieve. Nothing failed,
 * because nothing was looking.
 *
 * These tests pin the mechanism (primary before secondary, and hub slugs that
 * actually resolve), deliberately NOT the editorial mapping of which page
 * points where - that is a judgment call that should stay free to change
 * without a test telling someone they are wrong.
 */
import { describe, it, expect } from 'vitest';
import { contentPages, contentPagesForTool } from './contentPages.js';
import { toolsBySlug } from './tools.js';

const secondaryHubs = [
  ...new Set(contentPages.flatMap((page) => page.alsoHub ?? [])),
];

describe('contentPagesForTool', () => {
  it('returns every page hubbed to the tool, primary and secondary alike', () => {
    for (const slug of Object.keys(toolsBySlug)) {
      const expected = contentPages.filter(
        (page) => page.hub === slug || page.alsoHub?.includes(slug),
      );
      expect(contentPagesForTool(slug).map((page) => page.href).sort())
        .toEqual(expected.map((page) => page.href).sort());
    }
  });

  it('orders primary-hub pages before secondary alsoHub ones', () => {
    for (const slug of Object.keys(toolsBySlug)) {
      const kinds = contentPagesForTool(slug).map((page) =>
        page.hub === slug ? 'primary' : 'secondary',
      );
      const firstSecondary = kinds.indexOf('secondary');
      if (firstSecondary === -1) continue;
      expect(
        kinds.slice(firstSecondary).every((kind) => kind === 'secondary'),
        `${slug} interleaves a primary-hub guide after a secondary one: ${kinds.join(', ')}`,
      ).toBe(true);
    }
  });

  it('leads /redact/ with its own topical guides, not its secondary ones', () => {
    // The concrete case the flat filter got wrong. Asserted on hub kind rather
    // than on specific slugs so re-pointing a secondary hub stays free.
    const [first, second] = contentPagesForTool('redact');
    expect(first.hub).toBe('redact');
    expect(second.hub).toBe('redact');
  });

  it('never lists a page under a tool that does not exist', () => {
    // A typo in `hub` or `alsoHub` renders nothing at all, silently - the page
    // just keeps the orphan status the field was added to fix.
    expect(secondaryHubs.length).toBeGreaterThan(0);
    for (const page of contentPages) {
      expect(toolsBySlug[page.hub], `${page.href} has an unknown hub`).toBeDefined();
      for (const slug of page.alsoHub ?? []) {
        expect(toolsBySlug[slug], `${page.href} has an unknown alsoHub`).toBeDefined();
        expect(slug, `${page.href} lists its primary hub as a secondary one`)
          .not.toBe(page.hub);
      }
    }
  });
});
