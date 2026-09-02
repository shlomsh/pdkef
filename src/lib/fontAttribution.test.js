/**
 * Every bundled font is OFL, and the OFL requires its copyright notice to
 * travel with the font. The canonical manifest feeds the /licenses/ table
 * directly and generates the family lists in THIRD_PARTY_LICENSES.md.
 *
 * Before the manifest, they were not. Ten families (Arimo, Tinos, Cousine, Assistant, Heebo, the
 * four Noto CJK faces and Noto Sans Bengali) shipped selectable in the Sign
 * editor while appearing on neither surface, and the markdown still credited
 * Almarai months after it was replaced by Scheherazade New. Nothing failed,
 * because nothing was looking. The manifest removes those parallel edit
 * sites; this test now guards the generated Markdown and build-time page.
 *
 * This is the same last-mile guard as fonts.test.js's editorFonts.css block
 * and FontPickerMenu's catalogue-sync test, pointed at attribution instead of
 * rendering. It asserts coverage in both directions - a family with no notice,
 * and a notice for a family we no longer ship - because the second is how
 * Almarai survived its own removal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HANDWRITING_FONTS, TEXT_FONTS } from '../editor/text/fonts.js';
import { FONT_MANIFEST } from '../../scripts/font-manifest.mjs';

const CATALOGUE = [...HANDWRITING_FONTS, ...TEXT_FONTS];

const astro = readFileSync(join(process.cwd(), 'src', 'pages', 'licenses.astro'), 'utf8');
const markdown = readFileSync(join(process.cwd(), 'THIRD_PARTY_LICENSES.md'), 'utf8');

// THIRD_PARTY_LICENSES.md groups the fonts under two OFL headings, each a
// bullet list of "- Family (<url>)".
function markdownSection(heading) {
  const body = markdown.split(`## ${heading} — SIL Open Font License (OFL-1.1)`)[1];
  if (body === undefined) return null;
  return [...body.split('\n## ')[0].matchAll(/^- (.+?) \(</gm)].map(([, family]) => family);
}
const markdownHandwriting = markdownSection('Handwriting Fonts');
const markdownText = markdownSection('Text Fonts');

describe('font attribution surfaces', () => {
  // Non-vacuity: every assertion below is a set difference, so a parse that
  // silently returned nothing would make all of them pass.
  it('parses both surfaces, so the coverage assertions are not comparing empty lists', () => {
    expect(astro).toContain("import { FONT_MANIFEST } from '../../scripts/font-manifest.mjs'");
    expect(astro).toContain('FONT_MANIFEST.map');
    expect(FONT_MANIFEST).toHaveLength(CATALOGUE.length);
    expect(markdownHandwriting).not.toBeNull();
    expect(markdownText).not.toBeNull();
    expect(markdownHandwriting.length + markdownText.length).toBeGreaterThanOrEqual(CATALOGUE.length);
  });

  it('gives every catalogue family complete license metadata used by /licenses/', () => {
    for (const font of FONT_MANIFEST) {
      expect(font.license.version).toBeTruthy();
      expect(font.license.url).toMatch(/^https:\/\//);
      expect(font.license.copyright).toMatch(/Copyright|\(c\)|©/i);
    }
  });

  it('lists every catalogue family in THIRD_PARTY_LICENSES.md, under its own kind of heading', () => {
    expect(HANDWRITING_FONTS.filter((family) => !markdownHandwriting.includes(family))).toEqual([]);
    expect(TEXT_FONTS.filter((family) => !markdownText.includes(family))).toEqual([]);
  });

  it('credits nothing we no longer ship, so a replaced family cannot outlive its removal', () => {
    const stale = (listed) => listed.filter((family) => !CATALOGUE.includes(family));
    expect(stale([...markdownHandwriting, ...markdownText])).toEqual([]);
  });

  it('has a catalogue entry for every TTF on disk, which is what the surfaces are checked against', () => {
    // The check above is only as complete as the catalogue, so a font bundled
    // but never registered would be invisible to it.
    const bundled = new Set(
      readdirSync(join(process.cwd(), 'public', 'fonts'))
        .filter((file) => file.endsWith('.ttf'))
        .map((file) => file.replace(/-(Bold|Regular)?(Italic)?\.ttf$/, ''))
    );
    const registered = new Set(CATALOGUE.map((family) => family.replace(/\s+/g, '')));
    expect([...bundled].filter((base) => !registered.has(base))).toEqual([]);
  });
});
