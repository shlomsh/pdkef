import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALIZED_TOOL_ISLANDS } from './localizedTools.ts';

// ARCH-33: every localized tool has its own route file, so a page imports only
// its own island. A slug without one would silently drop out of the build.
const root = fileURLToPath(new URL('..', import.meta.url));
const contentDir = join(root, 'content', 'localized-tools');

function contentSlugs() {
  const slugs = new Set();
  for (const locale of readdirSync(contentDir, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    for (const file of readdirSync(join(contentDir, locale.name))) {
      if (file.endsWith('.yaml')) slugs.add(file.replace(/\.yaml$/, ''));
    }
  }
  return [...slugs];
}

describe('localized tool route files', () => {
  const slugs = [...new Set([...LOCALIZED_TOOL_ISLANDS, ...contentSlugs()])].sort();

  it('finds the slugs to check', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(6);
  });

  it.each(slugs)('%s has src/pages/[locale]/%s.astro', (slug) => {
    expect(existsSync(join(root, 'pages', '[locale]', `${slug}.astro`))).toBe(true);
  });
});
