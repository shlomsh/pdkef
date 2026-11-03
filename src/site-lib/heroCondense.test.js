import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/components/tool-page/ToolStage.astro', 'utf8');
const hero = readFileSync('src/components/ToolHero.astro', 'utf8');

// Kept as source pins (907d57cd, 0fbc2836): which tools fold their hero is decided by .astro markup and CSS selectors that no vitest environment renders;
// the Playwright specs measure the fold for Compress only.
describe('loaded tool hero is one line for every tool', () => {
  it('ToolPageLayout passes condenseOnLoad for every tool, not a slug list', () => {
    const tag = layout.match(/<ToolHero [^>]*\/>/)?.[0] ?? '';
    expect(tag).toMatch(/\bcondenseOnLoad(?!=)|condenseOnLoad=\{true\}/);
    expect(tag).not.toMatch(/condenseOnLoad=\{tool\.slug/);
  });

  it('non-editors condense at every width; both editors fold on a phone', () => {
    expect(hero).toContain('[data-hero-condense-on-load]:not([data-hero-editor])');
    // Sign and Redact fold on a coarse phone once loaded (HERO-08, SNG-24). The
    // toolbar-zoom spec's 149px "jump" under the fold was visualViewportClamp
    // pulling an off-screen bar into view, not a layout fault.
    expect(hero).toContain('[data-hero-editor-fold][data-hero-condense-on-load]');
    expect(hero).toMatch(/data-hero-editor-fold=\{isEditor/);
    // Every selector that folds an editor hero requires the fold marker.
    const bare = hero.match(/\[data-hero-editor\]\[data-hero-condense-on-load\]/g) ?? [];
    expect(bare).toEqual([]);
  });

  it('a restore or hand-off pending folds the hero from first paint, with the loaded size', () => {
    for (const hint of ['data-draft-hint', 'data-merge-restore', 'data-handoff-pending']) {
      expect(hero).toMatch(new RegExp(`html\\[${hint}\\]\\) \\.tool-hero\\.tool-hero\\.tool-hero\\[data-hero-`));
    }
  });
});
