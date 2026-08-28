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

  it('Hindi, Marathi, and Devanagari: exactly Kalam, matching LANGUAGE_COVERAGE.devanagari.full and .marathi.full', () => {
    expect(LANGUAGE_COVERAGE.devanagari.full.map((f) => f.family)).toEqual(['Kalam']);
    // Marathi is a separate report row (Devanagari's set - ळ/ऱ already sit
    // inside it, see scripts/font-languages.mjs) so a font that covered Hindi
    // but not those two letters would show up here as a real disagreement.
    expect(LANGUAGE_COVERAGE.marathi.full.map((f) => f.family)).toEqual(['Kalam']);
    const note = supportedNote('Hindi, Marathi, and Devanagari');
    expect(note).toContain('Kalam');
    expect(note).toContain('ळ');
    expect(note).toContain('ऱ');
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

  // The accent sentence in that same note used to read "Everyday accents work
  // throughout", and nothing checked it, because the test above only looks at
  // `latin` - unaccented ASCII, which every bundled family covers by
  // definition. The sentence is about `latinExt`, where three text fonts and
  // six handwriting faces are NOT complete, so it was false on the row it was
  // actually describing while passing the row it was checked against. It also
  // contradicted the card's own Vietnamese entry, which is a Latin-script
  // language and correctly names three text fonts. This is that sentence
  // checked against the row it means.
  it('Every Latin-script language: the accent sentence matches LANGUAGE_COVERAGE.latinExt, not the ASCII row', () => {
    const ext = LANGUAGE_COVERAGE.latinExt.full;
    const uprightFull = ext.filter((f) => f.style === 'upright').length;
    const handwritingFull = ext.filter((f) => f.style === 'handwriting').length;

    // Non-vacuity: if this ever stops being true the note needs rewriting to
    // say so, rather than the assertions below quietly passing on equality.
    expect(uprightFull).toBeLessThan(TEXT_FONTS.length);
    expect(handwritingFull).toBeLessThan(HANDWRITING_FONTS.length);

    const note = supportedNote('Every Latin-script language');
    expect(note).toContain(`${numberWord(uprightFull)} of the ${numberWord(TEXT_FONTS.length)} text fonts`);
    expect(note).toContain(
      `${numberWord(handwritingFull)} of the ${numberWord(HANDWRITING_FONTS.length)} handwriting faces`
    );
    expect(note).not.toContain('accents work throughout');
  });

  it('Arabic: exactly Almarai, matching LANGUAGE_COVERAGE.arabic.full', () => {
    expect(LANGUAGE_COVERAGE.arabic.full.map((f) => f.family)).toEqual(['Almarai']);
    expect(supportedNote('Arabic')).toContain('Almarai');
  });

  it('Dari and Farsi: exactly Almarai, matching LANGUAGE_COVERAGE.farsi.full', () => {
    expect(LANGUAGE_COVERAGE.farsi.full.map((f) => f.family)).toEqual(['Almarai']);
    expect(supportedNote('Dari and Farsi')).toContain('Almarai');
  });

  it('Urdu: exactly Almarai, matching LANGUAGE_COVERAGE.urdu.full, and the note states the Nastaliq/Naskh caveat', () => {
    expect(LANGUAGE_COVERAGE.urdu.full.map((f) => f.family)).toEqual(['Almarai']);
    const note = supportedNote('Urdu');
    expect(note).toContain('Almarai');
    // The caveat is the point of this claim, not a footnote - never let the
    // copy shrink to an unqualified "we support Urdu".
    expect(note).toContain('Nastaliq');
    expect(note).toContain('Naskh');
  });

  it('Vietnamese: exactly Arimo, Tinos, Cousine and Mali, matching LANGUAGE_COVERAGE.vietnamese.full', () => {
    expect(LANGUAGE_COVERAGE.vietnamese.full.map((f) => f.family).sort()).toEqual(['Arimo', 'Cousine', 'Mali', 'Tinos']);
    const note = supportedNote('Vietnamese');
    for (const family of ['Arimo', 'Tinos', 'Cousine', 'Mali']) {
      expect(note).toContain(family);
    }
  });

  it('Japanese: exactly Noto Sans JP for kana, matching LANGUAGE_COVERAGE.japanese.full', () => {
    expect(LANGUAGE_COVERAGE.japanese.full.map((f) => f.family)).toEqual(['Noto Sans JP']);
    const note = supportedNote('Japanese');
    expect(note).toContain('Noto Sans JP');
    expect(note).toContain('jōyō');
    expect(note).toContain('jinmeiyō');
    expect(note).toContain('no handwriting-style Japanese face');
  });

  it('Bengali: exactly Noto Sans Bengali, matching LANGUAGE_COVERAGE.bengali.full, and the note also claims Assamese', () => {
    expect(LANGUAGE_COVERAGE.bengali.full.map((f) => f.family)).toEqual(['Noto Sans Bengali']);
    // Same font, same claim - LANGUAGE_COVERAGE.assamese is a separate report
    // row (Bengali's set plus RA/VA) so a font that only covered Bengali
    // proper and not the two extra Assamese letters would show up here as a
    // real disagreement, not something this test has to hand-derive.
    expect(LANGUAGE_COVERAGE.assamese.full.map((f) => f.family)).toEqual(['Noto Sans Bengali']);
    const note = supportedNote('Bengali');
    expect(note).toContain('Noto Sans Bengali');
    expect(note).toContain('Assamese');
    expect(note).toContain('no handwriting-style Bengali face');
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
    // the report has no row for Chinese/Korean/emoji/Tamil/Telugu/Pashto
    // because no bundled family draws any of them (see
    // docs/wysiwyg-text-architecture.md §4.2; Japanese and Bengali did have
    // ids like these once and were removed from this list when their own
    // catalogue rows landed). Asserting their absence here
    // means a language quietly gaining a report row - the generator's own
    // signal that some font now covers it - would show up as a new key this
    // list does not know about, rather than silently going unnoticed.
    const notYetIds = ['zh', 'ko', 'emoji', 'ta', 'te', 'ps'];
    for (const id of notYetIds) {
      expect(LANGUAGE_COVERAGE[id]).toBeUndefined();
    }
  });

  it("the notYet copy still names Pashto, Chinese, Korean, emoji and India's other remaining scripts, and does not list Japanese or Bengali as unavailable", () => {
    const notYet = signLanguages.notYet;
    for (const term of ['Pashto', 'Chinese', 'Korean', 'emoji', 'Tamil', 'Telugu']) {
      expect(notYet).toContain(term);
    }
    // Only the opening clause - the one that says what "aren't there yet" -
    // is checked for Japanese. The copy after it mentions Japanese on
    // purpose: Han unification means a Chinese word built from characters
    // that are also on the Japanese kanji lists draws in Noto Sans JP, in the
    // Japanese shapes, so Chinese is genuinely half-covered and saying which
    // half needs naming the font that covers it. A blunt `not.toContain`
    // over the whole string forbids explaining that, which is how honest
    // copy loses to a test that was only ever meant to catch Japanese still
    // being listed as missing.
    const unavailableClause = notYet.split(/(?<=\.)\s/)[0];
    expect(unavailableClause).toContain('Pashto');
    expect(unavailableClause).not.toContain('Japanese');
    // Bengali graduated out of this list entirely (it has its own
    // LANGUAGE_COVERAGE row and its own "supported" card entry now), so
    // unlike Japanese/Chinese there is no half-covered nuance to preserve -
    // the whole notYet string should simply no longer name it.
    expect(notYet).not.toContain('Bengali');
  });
});

function numberWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
}
