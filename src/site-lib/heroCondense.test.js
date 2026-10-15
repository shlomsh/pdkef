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

  it('non-editors condense at every width; editors only below 1024px', () => {
    expect(hero).toContain('[data-hero-condense-on-load]:not([data-hero-editor])');
    expect(hero).toMatch(/@media \(max-width: 1023\.98px\) \{[\s\S]*\[data-hero-editor\]\[data-hero-condense-on-load\]/);
  });
});
