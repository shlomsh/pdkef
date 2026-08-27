/**
 * The seam between the generated catalogue coverage report
 * (src/lib/fontCoverageReport.js, W7) and the Sign page's Languages card
 * copy (src/data/tools.js's `languages` entry, rendered by
 * src/components/ToolLanguagesCard.astro).
 *
 * The card's prose stays hand-written on purpose - "Kalam, a handwriting
 * face that also works for a typed signature" or the Ukrainian ї/є/і/ґ note
 * are not things a generator should be inventing. What a generator CAN do is
 * catch the prose going stale: a family count that used to be right, a
 * language quietly losing coverage after a font swap, a "not yet" item that
 * quietly became true. This file is that check - it does not touch tools.js
 * or the card at runtime (see the comment above the `languages:` key in
 * tools.js for why: that file feeds ResumeDraftCard's client bundle, and
 * importing the report there would cost real page weight on a page already
 * near its budget), it only fails the build when the two disagree.
 */
import { describe, it, expect } from 'vitest';
import { tools } from './../data/tools.js';
import { HANDWRITING_FONTS, TEXT_FONTS } from './fonts.js';
import { LANGUAGE_COVERAGE, COMBINATION_COVERAGE, CYRILLIC_ANCHOR } from './fontCoverageReport.js';

const signLanguages = tools.find((t) => t.slug === 'sign').languages;

function supportedNote(name) {
  const entry = signLanguages.supported.find((l) => l.name === name);
  if (!entry) throw new Error(`No "supported" entry named ${JSON.stringify(name)} in tools.js's sign.languages - did the copy get renamed?`);
  return entry.note;
}

describe('Sign Languages card: "supported" claims match the generated coverage report', () => {
  it('Hebrew: six text fonts plus Gveret Levin, matching LANGUAGE_COVERAGE.hebrew.full', () => {
    const full = LANGUAGE_COVERAGE.hebrew.full;
    const upright = full.filter((f) => f.style === 'upright');
    const handwriting = full.filter((f) => f.style === 'handwriting');
    expect(upright).toHaveLength(6);
    expect(handwriting.map((f) => f.family)).toEqual(['Gveret Levin']);
    const note = supportedNote('Hebrew');
    expect(note).toContain('Six text fonts');
    expect(note).toContain('Gveret Levin');
  });

  it('Hindi and Devanagari: exactly Kalam, matching LANGUAGE_COVERAGE.devanagari.full', () => {
    expect(LANGUAGE_COVERAGE.devanagari.full.map((f) => f.family)).toEqual(['Kalam']);
    expect(supportedNote('Hindi and Devanagari')).toContain('Kalam');
  });

  it('Thai: exactly Mali, matching LANGUAGE_COVERAGE.thai.full', () => {
    expect(LANGUAGE_COVERAGE.thai.full.map((f) => f.family)).toEqual(['Mali']);
    expect(supportedNote('Thai')).toContain('Mali');
  });

  it('Russian/Ukrainian/other Cyrillic: PT Sans is one of the anchor families, and none of the anchor is handwriting', () => {
    expect(CYRILLIC_ANCHOR.familiesCoveringAllSeven.map((f) => f.family)).toContain('PT Sans');
    expect(CYRILLIC_ANCHOR.familiesCoveringAllSeven.every((f) => f.style === 'upright')).toBe(true);
    const note = supportedNote('Russian, Ukrainian, and other Cyrillic');
    expect(note).toContain('PT Sans');
    expect(note).toContain('no handwriting-style Cyrillic face');
  });

  it('Greek: Arimo, Tinos and Cousine, matching LANGUAGE_COVERAGE.greek.full', () => {
    expect(LANGUAGE_COVERAGE.greek.full.map((f) => f.family).sort()).toEqual(['Arimo', 'Cousine', 'Tinos']);
    const note = supportedNote('Greek');
    expect(note).toContain('Arimo');
    expect(note).toContain('Tinos');
    expect(note).toContain('Cousine');
  });

  it('Every Latin-script language: every bundled family covers Latin, and the card names the real family counts', () => {
    expect(LANGUAGE_COVERAGE.latin.full).toHaveLength(TEXT_FONTS.length + HANDWRITING_FONTS.length);
    const note = supportedNote('Every Latin-script language');
    expect(note).toContain(`All ${numberWord(TEXT_FONTS.length)} text fonts`);
    expect(note).toContain(`${numberWord(HANDWRITING_FONTS.length)} handwriting faces`);
  });

  it('Arabic: exactly Almarai, matching LANGUAGE_COVERAGE.arabic.full', () => {
    expect(LANGUAGE_COVERAGE.arabic.full.map((f) => f.family)).toEqual(['Almarai']);
    expect(supportedNote('Arabic')).toContain('Almarai');
  });

  it('Dari and Farsi: exactly Almarai, matching LANGUAGE_COVERAGE.farsi.full', () => {
    expect(LANGUAGE_COVERAGE.farsi.full.map((f) => f.family)).toEqual(['Almarai']);
    expect(supportedNote('Dari and Farsi')).toContain('Almarai');
  });
});

describe('Sign Languages card: combination claims implied by the copy', () => {
  it('Hebrew + Latin genuinely has a covering family (the card lists Hebrew as fully supported alongside every Latin-script language)', () => {
    const row = COMBINATION_COVERAGE.find((c) => c.a === 'hebrew' && c.b === 'latin');
    expect(row.families.length).toBeGreaterThan(0);
  });

  it('Hebrew + Arabic has none - the card never claims a document can mix them, and TODO.md names this as the one open gap', () => {
    const row = COMBINATION_COVERAGE.find((c) => c.a === 'hebrew' && c.b === 'arabic');
    expect(row.families).toEqual([]);
  });
});

describe('Sign Languages card: "not yet" list is still true', () => {
  it('none of the named not-yet scripts (CJK, Perso-Arabic extras aside, Devanagari-family scripts other than Hindi) appear as a LANGUAGE_COVERAGE id with any coverage', () => {
    // These ids are deliberately NOT in scripts/font-languages.mjs at all -
    // the report has no row for Chinese/Japanese/Korean/emoji/Bengali/Tamil/
    // Telugu/Pashto because no bundled family draws any of them (see
    // docs/wysiwyg-text-architecture.md §4.2). Asserting their absence here
    // means a language quietly gaining a report row - the generator's own
    // signal that some font now covers it - would show up as a new key this
    // list does not know about, rather than silently going unnoticed.
    const notYetIds = ['zh', 'ja', 'ko', 'emoji', 'bn', 'ta', 'te', 'ps'];
    for (const id of notYetIds) {
      expect(LANGUAGE_COVERAGE[id]).toBeUndefined();
    }
  });

  it("the notYet copy still names Pashto, CJK, emoji and India's other scripts", () => {
    const notYet = signLanguages.notYet;
    for (const term of ['Pashto', 'Chinese', 'Japanese', 'Korean', 'emoji', 'Bengali', 'Tamil', 'Telugu']) {
      expect(notYet).toContain(term);
    }
  });
});

function numberWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
}
