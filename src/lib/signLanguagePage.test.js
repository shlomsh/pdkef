/**
 * SEO-18: the language table on /sign-pdf-in-your-language/ is supposed to be
 * generated from the real font-coverage data, not hand-typed, so it cannot
 * quietly drift once a font lands or moves (see FONT-08 and its neighbours,
 * which add or move fonts in LANGUAGE_COVERAGE regularly). This is the seam
 * that enforces that: it reads the YAML content-page entry directly (the
 * same file src/content.config.ts validates at build time) and fails, naming
 * the row, if either column disagrees with src/lib/fontCoverageReport.js:
 *
 *   - column 1 (the language) must resolve to a real LANGUAGE_COVERAGE entry
 *   - every font family named in columns 2-3 must be in THAT language's
 *     `full` list (never `partial` - a page claiming a language "works"
 *     should not be backed by a font that only partially draws it)
 *
 * It also spot-checks the page's "no support at all" claim: none of the
 * scripts it names as unsupported have quietly gained a LANGUAGE_COVERAGE
 * entry (which would mean a font landed and the prose is now wrong).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { LANGUAGE_COVERAGE } from './fontCoverageReport.js';

const pagePath = path.join(process.cwd(), 'src/content/content-pages/sign-pdf-in-your-language.yaml');
const page = parse(readFileSync(pagePath, 'utf8'));

/** All real family names the catalogue can produce, longest first so a
 * substring search never matches a shorter name embedded in a longer one
 * (e.g. never let "Mukta" claim credit for a cell that actually says "Mukta
 * Mahee"). */
const ALL_FAMILIES = [...new Set(
  Object.values(LANGUAGE_COVERAGE).flatMap((entry) => [...entry.full, ...entry.partial].map((f) => f.family)),
)].sort((a, b) => b.length - a.length);

/** Resolve a table's language cell to its LANGUAGE_COVERAGE key: an exact
 * label match first, then the label with its trailing parenthetical (if any)
 * stripped, so "Japanese" still finds the "Japanese (kana + ... )" row and
 * "Devanagari (Hindi)" still needs the parenthetical to match "Bengali
 * (Bangla)" rather than partial-matching something else. */
function keyForLabel(label) {
  const stripParenthetical = (value) => value.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const wanted = stripParenthetical(label);
  for (const [key, entry] of Object.entries(LANGUAGE_COVERAGE)) {
    if (entry.label === label || stripParenthetical(entry.label) === wanted) return key;
  }
  return undefined;
}

/** Every family name mentioned in a cell, longest-match-first so "Mukta
 * Mahee" is never also reported as a spurious "Mukta" hit. */
function familiesMentionedIn(cell) {
  let remaining = cell;
  const found = [];
  for (const family of ALL_FAMILIES) {
    if (remaining.includes(family)) {
      found.push(family);
      remaining = remaining.replaceAll(family, '');
    }
  }
  return found;
}

function findTableBlock() {
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'table') return block;
    }
  }
  throw new Error('sign-pdf-in-your-language.yaml has no table block - did the language table get removed?');
}

describe('SEO-18 language table matches the generated font-coverage data', () => {
  const table = findTableBlock();
  const languageColumn = table.headers.findIndex((h) => /language/i.test(h));
  const fontColumn = table.headers.findIndex((h) => /font/i.test(h));
  const handwritingColumn = table.headers.findIndex((h) => /handwriting/i.test(h));

  it('has a language table with a language column and a font column', () => {
    expect(languageColumn).toBeGreaterThanOrEqual(0);
    expect(fontColumn).toBeGreaterThanOrEqual(0);
  });

  it('caps at 8 rows and 4 columns, per the content-page schema', () => {
    expect(table.headers.length).toBeLessThanOrEqual(4);
    expect(table.rows.length).toBeLessThanOrEqual(8);
  });

  for (const row of table.rows) {
    const label = row[languageColumn];

    it(`"${label}" is a real LANGUAGE_COVERAGE entry`, () => {
      const key = keyForLabel(label);
      expect(key, `"${label}" does not resolve to any LANGUAGE_COVERAGE entry - typo, or the row is stale`).toBeDefined();
    });

    it(`"${label}"'s font column names only fonts that fully cover it`, () => {
      const key = keyForLabel(label);
      if (!key) return; // already failed above; don't double-report
      const fullFamilies = LANGUAGE_COVERAGE[key].full.map((f) => f.family);
      const mentioned = familiesMentionedIn(row[fontColumn]);
      expect(mentioned.length, `no known font family found in "${row[fontColumn]}" for "${label}"`).toBeGreaterThan(0);
      for (const family of mentioned) {
        expect(
          fullFamilies,
          `"${label}" row names "${family}", but LANGUAGE_COVERAGE.${key}.full is ${JSON.stringify(fullFamilies)}`,
        ).toContain(family);
      }
    });

    if (handwritingColumn >= 0) {
      it(`"${label}"'s handwriting column names only fonts that fully cover it`, () => {
        const key = keyForLabel(label);
        if (!key) return;
        const fullFamilies = LANGUAGE_COVERAGE[key].full.map((f) => f.family);
        for (const family of familiesMentionedIn(row[handwritingColumn])) {
          expect(
            fullFamilies,
            `"${label}" row's handwriting column names "${family}", not in LANGUAGE_COVERAGE.${key}.full`,
          ).toContain(family);
        }
      });
    }
  }
});

describe('SEO-18 "no support at all" claim stays true', () => {
  // Copied from the page's own prose (the "Some scripts have no bundled font
  // yet" section and its mirrored FAQ answer) rather than re-derived, so this
  // test catches the page and the data disagreeing, not just the page
  // disagreeing with itself.
  const claimedUnsupported = ['Gujarati', 'Kannada', 'Odia', 'Sinhala', 'Khmer', 'Lao', 'Burmese', 'Amharic', 'Armenian', 'Georgian'];

  it('names languages that are still absent from LANGUAGE_COVERAGE', () => {
    const labels = Object.values(LANGUAGE_COVERAGE).map((entry) => entry.label);
    for (const name of claimedUnsupported) {
      const gainedSupport = labels.some((label) => label.includes(name));
      expect(gainedSupport, `"${name}" is claimed unsupported on the page but now has a LANGUAGE_COVERAGE entry - update the page`).toBe(false);
    }
  });

  it('the page really does name these scripts as unsupported (so the check above is not vacuous)', () => {
    const prose = JSON.stringify(page.sections).concat(JSON.stringify(page.faq));
    for (const name of claimedUnsupported) {
      expect(prose, `expected "${name}" to appear in the page's "not supported" copy`).toContain(name);
    }
  });
});
