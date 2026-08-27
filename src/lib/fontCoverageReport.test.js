/**
 * Drift guard + non-vacuity check for src/lib/fontCoverageReport.js, the
 * generated catalogue coverage report (W7,
 * docs/wysiwyg-text-architecture.md §8 stage 7).
 *
 * Follows the same shape as src/lib/fontCoverageTable.test.js: regenerate
 * the report in memory from the same inputs the generator uses
 * (src/lib/fontCoverageTable.js's real-byte-derived glyph data and
 * scripts/font-languages.mjs's character-set definitions) and fail, naming
 * the regenerate command, if the committed file disagrees. A report that
 * only checked itself would be worthless - the whole point of this task is
 * that "which fonts cover Hebrew+Arabic" stops being a claim someone can
 * quietly get wrong, and a generator that agrees with itself proves nothing
 * about that.
 *
 * The non-vacuity half is the concrete anchor from TODO.md's W7 entry: a
 * family the report does NOT list as covering a language must genuinely be
 * unable to draw it (checked directly against fontFileHasGlyph, independent
 * of the report's own computation), and the reverse for a family it DOES
 * list. A report that claimed every family covers everything would pass
 * every "is X listed" assertion; these are the ones that would catch it.
 */
import { describe, it, expect } from 'vitest';
import { fontFileHasGlyph } from './fontCoverageTable.js';
import { HANDWRITING_FONTS, TEXT_FONTS } from './fonts.js';
import { LANGUAGES, CYRILLIC_ANCHOR_LANGUAGES, NAMED_COMBINATIONS } from '../../scripts/font-languages.mjs';
import { LANGUAGE_COVERAGE, COMBINATION_COVERAGE, CYRILLIC_ANCHOR } from './fontCoverageReport.js';

const FAMILIES = [...HANDWRITING_FONTS, ...TEXT_FONTS];

function regularFile(family) {
  return `${family.replace(/\s+/g, '')}-Regular.ttf`;
}

function isHandwriting(family) {
  return HANDWRITING_FONTS.includes(family);
}

function coverageFraction(file, codePoints) {
  if (codePoints.length === 0) return 1;
  let covered = 0;
  for (const cp of codePoints) {
    if (fontFileHasGlyph(file, cp)) covered += 1;
  }
  return covered / codePoints.length;
}

function freshLanguageCoverage() {
  const result = {};
  for (const [id, def] of Object.entries(LANGUAGES)) {
    const perFamily = FAMILIES.map((family) => ({
      family,
      style: isHandwriting(family) ? 'handwriting' : 'upright',
      fraction: coverageFraction(regularFile(family), def.codePoints),
    }));
    result[id] = {
      label: def.label,
      requiredCodePointCount: def.codePoints.length,
      full: perFamily.filter((f) => f.fraction === 1).map((f) => ({ family: f.family, style: f.style })),
      partial: perFamily
        .filter((f) => f.fraction > 0 && f.fraction < 1)
        .map((f) => ({ family: f.family, style: f.style, fraction: Math.round(f.fraction * 1000) / 1000 })),
    };
  }
  return result;
}

describe('fontCoverageReport is not stale', () => {
  it('LANGUAGE_COVERAGE matches a fresh computation from the real coverage table and the current language definitions - if this fails, run npm run generate:font-coverage-report and commit the result', () => {
    expect(LANGUAGE_COVERAGE).toEqual(freshLanguageCoverage());
  });

  it('COMBINATION_COVERAGE matches a fresh intersection of the (fresh) per-language full lists', () => {
    const fresh = freshLanguageCoverage();
    const freshCombinations = NAMED_COMBINATIONS.map(([a, b]) => {
      const fullA = new Map(fresh[a].full.map((f) => [f.family, f.style]));
      const families = fresh[b].full.filter((f) => fullA.has(f.family)).map((f) => ({ family: f.family, style: fullA.get(f.family) }));
      return { a, b, aLabel: LANGUAGES[a].label, bLabel: LANGUAGES[b].label, families };
    });
    expect(COMBINATION_COVERAGE).toEqual(freshCombinations);
  });

  it('CYRILLIC_ANCHOR matches a fresh cross-check of the seven anchor languages', () => {
    const fresh = freshLanguageCoverage();
    const perLanguageFamilies = CYRILLIC_ANCHOR_LANGUAGES.map((id) => new Set(fresh[id].full.map((f) => f.family)));
    const coversAllSeven = FAMILIES.filter((family) => perLanguageFamilies.every((set) => set.has(family)));
    expect(CYRILLIC_ANCHOR).toEqual({
      languages: CYRILLIC_ANCHOR_LANGUAGES,
      familiesCoveringAllSeven: coversAllSeven.map((family) => ({ family, style: isHandwriting(family) ? 'handwriting' : 'upright' })),
    });
  });
});

describe('the concrete anchor from TODO.md W7: seven Cyrillic languages, four families, whole alphabet', () => {
  it('exactly Arimo, Tinos, Cousine and PT Sans fully cover all seven', () => {
    expect(CYRILLIC_ANCHOR.familiesCoveringAllSeven.map((f) => f.family).sort()).toEqual(['Arimo', 'Cousine', 'PT Sans', 'Tinos'].sort());
  });

  it('none of the four anchor families are handwriting - there is genuinely no handwriting-style Cyrillic face', () => {
    for (const f of CYRILLIC_ANCHOR.familiesCoveringAllSeven) {
      expect(f.style).toBe('upright');
    }
  });
});

describe('Hebrew + Arabic: the one combination with no answer today', () => {
  it('the report says none, matching TODO.md W7 and docs/wysiwyg-text-architecture.md §4.1', () => {
    const row = COMBINATION_COVERAGE.find((c) => c.a === 'hebrew' && c.b === 'arabic');
    expect(row.families).toEqual([]);
  });
});

describe('non-vacuity: a family the report lists genuinely covers the language, and one it omits genuinely does not', () => {
  const HEBREW_ALEF = 0x05d0;
  const ARABIC_ALEF = 0x0627;
  const CYRILLIC_A = 0x0410;
  const GREEK_ALPHA_CAP = 0x0391;

  it('every family LANGUAGE_COVERAGE.hebrew.full lists genuinely has the Hebrew alef glyph', () => {
    for (const f of LANGUAGE_COVERAGE.hebrew.full) {
      expect(fontFileHasGlyph(regularFile(f.family), HEBREW_ALEF)).toBe(true);
    }
  });

  it('Pacifico (Latin-only handwriting face) is absent from Hebrew coverage, and genuinely lacks the alef glyph', () => {
    expect(LANGUAGE_COVERAGE.hebrew.full.some((f) => f.family === 'Pacifico')).toBe(false);
    expect(LANGUAGE_COVERAGE.hebrew.partial.some((f) => f.family === 'Pacifico')).toBe(false);
    expect(fontFileHasGlyph('Pacifico-Regular.ttf', HEBREW_ALEF)).toBe(false);
  });

  it('every family LANGUAGE_COVERAGE.arabic.full lists genuinely has the Arabic alef glyph', () => {
    for (const f of LANGUAGE_COVERAGE.arabic.full) {
      expect(fontFileHasGlyph(regularFile(f.family), ARABIC_ALEF)).toBe(true);
    }
  });

  it('Arimo (no bundled Arabic coverage) is absent from Arabic coverage, and genuinely lacks the Arabic alef glyph', () => {
    expect(LANGUAGE_COVERAGE.arabic.full.some((f) => f.family === 'Arimo')).toBe(false);
    expect(LANGUAGE_COVERAGE.arabic.partial.some((f) => f.family === 'Arimo')).toBe(false);
    expect(fontFileHasGlyph('Arimo-Regular.ttf', ARABIC_ALEF)).toBe(false);
  });

  it('every family in the Cyrillic anchor genuinely has the Cyrillic capital A glyph', () => {
    for (const f of CYRILLIC_ANCHOR.familiesCoveringAllSeven) {
      expect(fontFileHasGlyph(regularFile(f.family), CYRILLIC_A)).toBe(true);
    }
  });

  it('Heebo (Hebrew-capable, not Cyrillic-capable) is absent from every Cyrillic language row, and genuinely lacks the Cyrillic capital A glyph', () => {
    for (const id of CYRILLIC_ANCHOR_LANGUAGES) {
      expect(LANGUAGE_COVERAGE[id].full.some((f) => f.family === 'Heebo')).toBe(false);
    }
    expect(fontFileHasGlyph('Heebo-Regular.ttf', CYRILLIC_A)).toBe(false);
  });

  it('every family LANGUAGE_COVERAGE.greek.full lists genuinely has the Greek capital alpha glyph', () => {
    for (const f of LANGUAGE_COVERAGE.greek.full) {
      expect(fontFileHasGlyph(regularFile(f.family), GREEK_ALPHA_CAP)).toBe(true);
    }
  });

  it('a language id the report has no data for is not silently treated as fully uncovered by every family (sanity: the fixture set itself is non-empty)', () => {
    expect(Object.keys(LANGUAGE_COVERAGE).length).toBeGreaterThan(10);
  });
});
