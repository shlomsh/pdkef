import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// MEM-42: every file under /flags/ is cached for a year with no revalidation, so a browser asks for one once.
// That holds only because a flag file's name never names different bytes: the flag files in public/flags/ come from the
// pinned country-flag-icons package (replace one and it needs a new name), and the rating board's sprite
// carries a fingerprint of its content in its name. Vercel applies every matching header rule, so the guard
// also checks that no other rule sets another Cache-Control on a /flags/ path.
const { headers } = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const WANT = 'public, max-age=31536000, immutable';
const matches = (source, path) => new RegExp(`^${source.replace(/\(\.\*\)/g, '.*')}$`).test(path);
const cacheControlOf = (path) =>
  headers.filter((rule) => matches(rule.source, path)).flatMap((rule) => rule.headers.filter((h) => h.key.toLowerCase() === 'cache-control').map((h) => ({ source: rule.source, value: h.value })));

describe('vercel.json /flags/ caching', () => {
  it.each(['/flags/IN.svg', '/flags/notes-0123456789.svg'])('%s is cached for a year, immutable, by exactly one rule', (path) => {
    expect(cacheControlOf(path)).toEqual([{ source: '/flags/(.*)', value: WANT }]);
  });

  it('gives no other path a Cache-Control of its own', () => {
    for (const rule of headers) {
      if (rule.source === '/flags/(.*)') continue;
      expect(rule.headers.map((h) => h.key.toLowerCase())).not.toContain('cache-control');
    }
  });
});
