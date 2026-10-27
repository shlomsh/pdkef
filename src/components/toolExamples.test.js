import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tools } from '../data/tools.js';

const scan = tools.find((t) => t.slug === 'scan-to-pdf' || t.slug === 'scan');
const figures = scan?.examples?.figures ?? [];
const sources = (fig) => (fig.kind === 'compare' ? [fig] : fig.items);

// Scan's guide photos sit below the fold: each one is lazy, async-decoded and
// carries its intrinsic size so nothing shifts when it arrives (SCAN-03).
describe('Scan guide photos', () => {
  it('every entry carries positive width and height', () => {
    expect(figures.length).toBeGreaterThan(0);
    for (const fig of figures) {
      for (const s of sources(fig)) {
        expect(s.width, JSON.stringify(s)).toBeGreaterThan(0);
        expect(s.height, JSON.stringify(s)).toBeGreaterThan(0);
      }
    }
  });

  it('the components render every photo lazily with explicit size', () => {
    for (const file of ['ToolExamplesCard.astro', 'CompareFigure.astro']) {
      const imgs = readFileSync(`src/components/${file}`, 'utf8').match(/<img[\s\S]*?\/>/g) ?? [];
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        expect(img).toContain('loading="lazy"');
        expect(img).toContain('decoding="async"');
        expect(img).toMatch(/width=\{/);
        expect(img).toMatch(/height=\{/);
      }
    }
  });
});
