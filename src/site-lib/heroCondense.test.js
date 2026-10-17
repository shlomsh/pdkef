import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/layouts/ToolPageLayout.astro', 'utf8');
const hero = readFileSync('src/components/ToolHero.astro', 'utf8');

describe('loaded tool hero is one line for every tool', () => {
  it('ToolPageLayout passes condenseOnLoad for every tool, not a slug list', () => {
    const tag = layout.match(/<ToolHero [^>]*\/>/)?.[0] ?? '';
    expect(tag).toMatch(/\bcondenseOnLoad(?!=)|condenseOnLoad=\{true\}/);
    expect(tag).not.toMatch(/condenseOnLoad=\{tool\.slug/);
  });

  it('non-editors condense at every width; Redact folds on a phone; Sign keeps its own hero', () => {
    expect(hero).toContain('[data-hero-condense-on-load]:not([data-hero-editor])');
    // Folding Sign on a phone lifted the form field and made Sign's field
    // toolbar jump 149px sideways at 1.8x pinch zoom
    // (toolbar-zoom-physical-size.spec.js:292). Its phone layout waits for the
    // next generation (HERO-08), so only Redact carries the fold marker.
    expect(hero).toContain('[data-hero-editor-fold][data-hero-condense-on-load]');
    expect(hero).toMatch(/data-hero-editor-fold=\{slug === 'redact'/);
    // Every selector that folds an editor hero requires the Redact-only marker.
    const bare = hero.match(/\[data-hero-editor\]\[data-hero-condense-on-load\]/g) ?? [];
    expect(bare).toEqual([]);
  });

  it('a restore or hand-off pending folds the hero from first paint, with the loaded size', () => {
    for (const hint of ['data-draft-hint', 'data-merge-restore', 'data-handoff-pending']) {
      expect(hero).toMatch(new RegExp(`html\\[${hint}\\]\\) \\.tool-hero\\.tool-hero\\.tool-hero\\[data-hero-`));
    }
  });
});
