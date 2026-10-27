import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Homepage Tooltips', () => {
  it('ensures app-tooltip has industry-standard margin and arrow styles', () => {
    // LOC-09: the home page's markup/CSS moved from index.astro into the
    // shared home layout, and with ARCH-56 into its first-screen section, HomeHero.astro,
    // so the hero's own style block lives there now.
    const astroPath = path.join(process.cwd(), 'src/components/home/HomeHero.astro');
    const content = fs.readFileSync(astroPath, 'utf8');

    // Extract the <style> block
    const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch[1];

    // Assert that the tooltip has a top margin via bottom positioning
    // We expect bottom: calc(100% + 14px);
    expect(css).toMatch(/\.app-tooltip\s*{[^}]*bottom:\s*calc\(100%\s*\+\s*14px\)/);

    // Assert that the tooltip has a downward pointing arrow via ::after
    expect(css).toMatch(/\.app-tooltip::after\s*{[^}]*border-width:\s*6px/);
    expect(css).toMatch(/\.app-tooltip::after\s*{[^}]*border-color:\s*var\(--color-surface\)\s*transparent\s*transparent\s*transparent/);
  });
  describe('SITE-42 woken toolbar', () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/components/home/HomeHero.astro'), 'utf8');
    const css = content.match(/<style>([\s\S]*?)<\/style>/)[1];

    it('gives every dock link a data-tool attribute', () => {
      const links = content.match(/<a [^>]*class="app-card"[^>]*>/g) ?? [];
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link).toContain('data-tool={tool.slug}');
    });

    it('dims tools that do not fit and rings the ones that do', () => {
      expect(css).toMatch(/\.home-hero\[data-picking\]\s+\.app-card:not\(\[data-fits\]\)\s*{[^}]*opacity:\s*0\.35/);
      expect(css).toMatch(/\[data-picking\]\s+\.app-card\[data-fits\]\s+\.app-tile\s*{[^}]*box-shadow:[^;}]*var\(--home-citron\)/);
    });

    it('lets the edge-fade strips cover the dock padding', () => {
      expect(css).toMatch(/\.home-dock::after\s*{[^}]*margin-block:\s*-10px/);
    });
  });
});
