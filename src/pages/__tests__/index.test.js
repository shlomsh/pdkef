import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Homepage Tooltips', () => {
  it('ensures app-tooltip has industry-standard margin and arrow styles', () => {
    // LOC-09: the home page's markup/CSS moved from index.astro into the
    // shared HomePageLayout.astro (also rendered by src/pages/[locale]/index.astro),
    // so the English page's own style block lives there now.
    const astroPath = path.join(process.cwd(), 'src/layouts/HomePageLayout.astro');
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
});
