import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Guard-rail for a whole class of silent bug. This project uses raw Preact
// (@astrojs/preact, no compat), which — unlike React — does NOT convert camelCase
// SVG presentation attributes to kebab-case. Writing `strokeWidth=` / `vectorEffect=`
// on a raw <svg> element emits an invalid attribute the browser ignores, so the
// stroke silently falls back to 1px. That's what made the Sign tool's thickness
// picker do nothing and its lines hard to grab. See project_preact_svg_kebab_attrs.
//
// lucide-preact ICON COMPONENTS (<PilcrowLeft strokeWidth={2.5} />) legitimately
// take `strokeWidth` as a component prop, so camelCase on a Capitalized tag is fine
// and is excluded below. Only lowercase raw-SVG tags must use kebab-case.

const CAMEL_SVG_ATTRS = [
  'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray',
  'strokeOpacity', 'fillOpacity', 'fillRule', 'clipRule',
];

// This guard predates the shell/editor-ui split (ARCH-16) and the src/tools/
// split (ARCH-17): it used to scan only its own directory because every
// island and its shared chrome lived flat in src/components/. A folder list
// is exactly the thing a future move silently falls out of, so it now walks
// all of src/ instead of naming folders one by one - a file that changes
// owner (components -> shell/editor-ui -> tools/<name>) stays covered
// automatically instead of dropping out until someone remembers to add its
// new home here too.
const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectTsxFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsxFiles(full, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

describe('raw-SVG attributes use kebab-case (raw Preact does not convert camelCase)', () => {
  for (const file of collectTsxFiles(SRC_ROOT)) {
    const label = path.relative(SRC_ROOT, file).split(path.sep).join('/');
    it(`${label} has no camelCase SVG attributes on raw elements`, () => {
      const src = fs.readFileSync(file, 'utf8');
      const offenders = [];
      for (const attr of CAMEL_SVG_ATTRS) {
        // Match the attribute only where it's used as a JSX attribute (`attr=`),
        // which never matches our data-model `strokeWidth:` keys or `.strokeWidth`
        // accesses. Allow it on Capitalized (component) tags via the preceding-char
        // heuristic: flag when the nearest preceding `<` opens a lowercase tag.
        const re = new RegExp(`${attr}=`, 'g');
        let m;
        while ((m = re.exec(src)) !== null) {
          const before = src.slice(0, m.index);
          const openTag = before.lastIndexOf('<');
          const nextChar = src[openTag + 1] || '';
          const onComponent = nextChar >= 'A' && nextChar <= 'Z';
          if (!onComponent) {
            const line = before.split('\n').length;
            offenders.push(`${attr}= at ${label}:${line}`);
          }
        }
      }
      expect(offenders, `Use kebab-case (e.g. stroke-width) on raw SVG:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
