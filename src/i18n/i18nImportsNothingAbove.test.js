import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ARCH-35: src/i18n/ is the bottom of the site's text stack. A message table that imports a
// type from the shell or the editor ties every string edit to those projects (and, because pages
// import i18n, closes a loop). Types and helpers a component needs live beside that component;
// i18n holds only locale ids, shared catalogues and pure helpers, and imports nothing above it.
const FORBIDDEN = ['shell', 'editor', 'editor-ui', 'tools', 'site-lib'];
const dir = fileURLToPath(new URL('.', import.meta.url));

function importSpecifiers(source) {
  const out = [];
  const pattern = /(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) out.push(match[1] ?? match[2] ?? match[3]);
  return out;
}

describe('src/i18n imports', () => {
  const files = readdirSync(dir).filter((name) => /\.(ts|tsx|js|astro)$/.test(name) && name !== 'i18nImportsNothingAbove.test.ts');

  it('finds the i18n files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports nothing from shell, editor, editor-ui, tools or site-lib', () => {
    const offenders = [];
    for (const name of files) {
      for (const specifier of importSpecifiers(readFileSync(join(dir, name), 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const segments = specifier.split('/').filter((segment) => segment && segment !== '.' && segment !== '..');
        if (specifier.startsWith('../') && FORBIDDEN.includes(segments[0])) offenders.push(`${name} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
