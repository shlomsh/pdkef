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
 * tools.js for why: that file feeds RecentFiles' client bundle, and
 * importing the report there would cost real page weight on a page already
 * near its budget), it only fails the build when the two disagree.
 */
import { describe, it, expect } from 'vitest';
import { tools } from './../data/tools.js';
import { HANDWRITING_FONTS, TEXT_FONTS } from '../editor/text/fonts.js';
import { LANGUAGE_COVERAGE, COMBINATION_COVERAGE, CYRILLIC_ANCHOR } from './fontCoverageReport.js';

const signTool = tools.find((t) => t.slug === 'sign');
const signLanguages = signTool.languages;

function faqAnswer(fragment) {
  const entry = signTool.faq.find((item) => item.question.includes(fragment));
  if (!entry) throw new Error(`No Sign FAQ question containing ${JSON.stringify(fragment)} - did the copy get renamed?`);
  return entry.answer;
}

function supportedNote(name) {
  const entry = signLanguages.supported.find((l) => l.name === name);
  if (!entry) throw new Error(`No "supported" entry named ${JSON.stringify(name)} in tools.js's sign.languages - did the copy get renamed?`);
  return entry.note;
}

describe('Sign Languages card: "supported" claims match the generated coverage report', () => {
  it('Hebrew: six text fonts plus Gveret Levin and Amatic SC, matching LANGUAGE_COVERAGE.hebrew.full', () => {
    const full = LANGUAGE_COVERAGE.hebrew.full;
    const upright = full.filter((f) => f.style === 'upright');
    const handwriting = full.filter((f) => f.style === 'handwriting');
    expect(upright).toHaveLength(6);
    // FONT-08: Amatic SC joined Gveret Levin as Hebrew's second handwriting
    // face, screened via H8 (src/editor/registry/hebrewMarkPlacement.test.js)
    // before its acceptance.hebrewMarkPlacement flag was set - see
    // scripts/font-manifest.mjs.
    expect(handwriting.map((f) => f.family)).toEqual(['Gveret Levin', 'Amatic SC']);
    const note = supportedNote('Hebrew');
    expect(note).toContain('Six text fonts');
    expect(note).toContain('Gveret Levin');
    expect(note).toContain('Amatic SC');
  });

  it('Hindi, Marathi, and Devanagari: Kalam, Tillana and Mukta, matching LANGUAGE_COVERAGE.devanagari.full and .marathi.full', () => {
    // FONT-08a: Mukta (upright) joined the previously Kalam-only (handwriting)
    // Devanagari row, closing the "no upright option at all" gap. Tillana
    // (handwriting, landed 2026-09-12) is the second handwriting face - it
    // sits between Kalam and Mukta in this array because HANDWRITING_FONTS
    // (manifest order) is judged before TEXT_FONTS, and within the manifest
    // Tillana was appended after Kalam's sibling handwriting faces.
    expect(LANGUAGE_COVERAGE.devanagari.full.map((f) => f.family)).toEqual(['Kalam', 'Tillana', 'Mukta']);
    // Marathi is a separate report row (Devanagari's set - ळ/ऱ already sit
    // inside it, see scripts/font-languages.mjs) so a font that covered Hindi
    // but not those two letters would show up here as a real disagreement.
    expect(LANGUAGE_COVERAGE.marathi.full.map((f) => f.family)).toEqual(['Kalam', 'Tillana', 'Mukta']);
    const note = supportedNote('Hindi, Marathi, and Devanagari');
    expect(note).toContain('Kalam');
    expect(note).toContain('Tillana');
    expect(note).toContain('Mukta');
    expect(note).toContain('ळ');
    expect(note).toContain('ऱ');
  });

  it('Thai: Mali and IBM Plex Sans Thai, matching LANGUAGE_COVERAGE.thai.full', () => {
    expect(LANGUAGE_COVERAGE.thai.full.map((f) => f.family).sort()).toEqual(['IBM Plex Sans Thai', 'Mali']);
    const note = supportedNote('Thai');
    expect(note).toContain('Mali');
    expect(note).toContain('IBM Plex Sans Thai');
  });

  it('Russian/Ukrainian/other Cyrillic: PT Sans is one of the anchor families, and none of the anchor is handwriting', () => {
    expect(CYRILLIC_ANCHOR.familiesCoveringAllSeven.map((f) => f.family)).toContain('PT Sans');
    // FONT-08: Amatic SC does not cover the eight extra Kazakh letters (Ә Ғ
    // Қ Ң Ө Ұ Ү Һ), so it never joins the all-seven anchor - this stays
    // upright-only even though Cyrillic now has a handwriting option for the
    // six languages it does cover, see the next test.
    expect(CYRILLIC_ANCHOR.familiesCoveringAllSeven.every((f) => f.style === 'upright')).toBe(true);
    const note = supportedNote('Russian, Ukrainian, and other Cyrillic');
    expect(note).toContain('PT Sans');
    expect(note).toContain('Neucha');
  });

  it('Russian/Ukrainian/other Cyrillic: Amatic SC is the six-language handwriting option, matching LANGUAGE_COVERAGE.cyrillicRussian.full', () => {
    // FONT-08: Amatic SC is Cyrillic's first handwriting face (the gap
    // docs/font-candidate-research-brief.md's "no handwriting option at all"
    // row named), covering Russian/Ukrainian/Belarusian/Bulgarian/Serbian/
    // Macedonian but not Kazakh - see the anchor test above.
    expect(LANGUAGE_COVERAGE.cyrillicRussian.full.map((f) => f.family)).toContain('Amatic SC');
    expect(LANGUAGE_COVERAGE.cyrillicKazakh.full.map((f) => f.family)).not.toContain('Amatic SC');
    const note = supportedNote('Russian, Ukrainian, and other Cyrillic');
    expect(note).toContain('Amatic SC');
    expect(note).toContain('capitals only');
    expect(note).toContain('Kazakh');
  });

  it('Neucha (FONT-08, handwriting): full on six of the seven Cyrillic anchor languages, partial on Kazakh', () => {
    const sixFull = ['cyrillicRussian', 'cyrillicUkrainian', 'cyrillicBelarusian', 'cyrillicBulgarian', 'cyrillicSerbian', 'cyrillicMacedonian'];
    for (const id of sixFull) {
      expect(LANGUAGE_COVERAGE[id].full.map((f) => f.family)).toContain('Neucha');
    }
    expect(LANGUAGE_COVERAGE.cyrillicKazakh.full.map((f) => f.family)).not.toContain('Neucha');
    const kazakhPartial = LANGUAGE_COVERAGE.cyrillicKazakh.partial.find((f) => f.family === 'Neucha');
    expect(kazakhPartial).toBeTruthy();
    const note = supportedNote('Russian, Ukrainian, and other Cyrillic');
    expect(note).toContain('Neucha');
    expect(note).toContain('Kazakh');
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

  it('Arabic: Scheherazade New and Vazirmatn, matching LANGUAGE_COVERAGE.arabic.full', () => {
    // FONT-08b: Vazirmatn (upright geometric sans) joined the previously
    // Scheherazade-New-only (traditional Naskh) Arabic-family row, giving it
    // a second, stylistically distinct choice the way Devanagari/Thai got
    // from FONT-08a.
    expect(LANGUAGE_COVERAGE.arabic.full.map((f) => f.family).sort()).toEqual(['Scheherazade New', 'Vazirmatn']);
    const note = supportedNote('Arabic');
    expect(note).toContain('Scheherazade New');
    expect(note).toContain('Vazirmatn');
  });

  it('Dari and Farsi: Scheherazade New and Vazirmatn, matching LANGUAGE_COVERAGE.farsi.full', () => {
    expect(LANGUAGE_COVERAGE.farsi.full.map((f) => f.family).sort()).toEqual(['Scheherazade New', 'Vazirmatn']);
    const note = supportedNote('Dari and Farsi');
    expect(note).toContain('Scheherazade New');
    expect(note).toContain('Vazirmatn');
  });

  it('Urdu: Scheherazade New and Vazirmatn, matching LANGUAGE_COVERAGE.urdu.full, and the note states the Nastaliq/Naskh caveat', () => {
    expect(LANGUAGE_COVERAGE.urdu.full.map((f) => f.family).sort()).toEqual(['Scheherazade New', 'Vazirmatn']);
    const note = supportedNote('Urdu');
    expect(note).toContain('Scheherazade New');
    expect(note).toContain('Vazirmatn');
    // The caveat is the point of this claim, not a footnote - never let the
    // copy shrink to an unqualified "we support Urdu". Both fonts here are
    // upright, so the caveat applies to both, not just to Scheherazade New.
    expect(note).toContain('Nastaliq');
    expect(note).toContain('Naskh');
  });

  it('Pashto: Scheherazade New and Vazirmatn, matching LANGUAGE_COVERAGE.pashto.full', () => {
    expect(LANGUAGE_COVERAGE.pashto.full.map((f) => f.family).sort()).toEqual(['Scheherazade New', 'Vazirmatn']);
    const note = supportedNote('Pashto');
    expect(note).toContain('Scheherazade New');
    expect(note).toContain('Vazirmatn');
    // The eleven letters are the entire reason Pashto has its own line and
    // its own font swap - never let the copy shrink to an unqualified claim.
    expect(note).toContain('ټ');
    expect(note).toContain('ۍ');
  });

  it('Vietnamese: exactly Arimo, Tinos, Cousine, Mali and Amatic SC, matching LANGUAGE_COVERAGE.vietnamese.full', () => {
    // FONT-08: Amatic SC's full Latin Extended coverage (measured against
    // the real bytes) turned out to include every Vietnamese tone-and-
    // diacritic vowel too, even though the font is a capitals-only display
    // face - a codepoint either has a glyph or it doesn't, regardless of the
    // letterform it draws.
    expect(LANGUAGE_COVERAGE.vietnamese.full.map((f) => f.family).sort()).toEqual(['Amatic SC', 'Arimo', 'Cousine', 'Mali', 'Tinos']);
    const note = supportedNote('Vietnamese');
    for (const family of ['Arimo', 'Tinos', 'Cousine', 'Mali', 'Amatic SC']) {
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

  it('Turkish: the same font list as Latin-Ext, matching LANGUAGE_COVERAGE.turkish.full', () => {
    // Turkish's three letters not proven by Latin-Ext (Ğ, İ, Ş) happen to be
    // drawn by exactly the same families that carry the full Latin-Ext
    // sample - a real, checkable fact, not a coincidence to assume without
    // checking. If a future font swap ever makes these two lists diverge,
    // this comparison catches it rather than the note quietly going stale.
    const turkish = LANGUAGE_COVERAGE.turkish.full.map((f) => f.family).sort();
    const ext = LANGUAGE_COVERAGE.latinExt.full.map((f) => f.family).sort();
    expect(turkish).toEqual(ext);
    expect(turkish).toContain('Kalam');
    expect(turkish).toContain('Mali');
    const note = supportedNote('Turkish');
    expect(note).toContain('Eleven text fonts');
    expect(note).toContain('Kalam');
    expect(note).toContain('Mali');
    expect(note).toContain('Ğ');
    expect(note).toContain('İ');
    expect(note).toContain('Ş');
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

describe('Sign Languages card: request and contribution path', () => {
  it('the currently uncovered scripts do not appear as a LANGUAGE_COVERAGE id with any coverage', () => {
    // These ids are deliberately NOT in scripts/font-languages.mjs at all -
    // the report has no row for emoji or for India's remaining scripts
    // because no bundled family draws any of them (see
    // docs/wysiwyg-text-architecture.md §4.2). Japanese, Bengali, Korean,
    // Pashto and - as of 2026-08-28 - Tamil, Telugu and Punjabi did have ids
    // like these once and were removed from this list when their own
    // catalogue rows landed. Chinese never got one (it has no compact
    // alphabet the way Korean's Hangul does, see fonts.js's CATALOGUE
    // comment and font-languages.mjs's header), so 'zh' was never a real id
    // and its absence here is definitional, not a graduation. Asserting the
    // real ids' absence means a language quietly gaining a report row - the
    // generator's own signal that some font now covers it - would show up as
    // a new key this list does not know about, rather than silently going
    // unnoticed.
    const notYetIds = ['emoji', 'gu', 'kn', 'or', 'ml'];
    for (const id of notYetIds) {
      expect(LANGUAGE_COVERAGE[id]).toBeUndefined();
    }
  });

  /**
   * The card does NOT enumerate the scripts with no bundled font, by an
   * explicit owner decision (2026-09-11). SEO-07's acceptance had asked for
   * the opposite and it was built that way first; the call on reading it was
   * that a list of gaps sitting inside the strongest claim on the page reads
   * as a disclaimer, and dates badly besides, since languages here are added
   * on request and the list is wrong the week someone asks. See the comment
   * above `languages:` in tools.js.
   *
   * The disclosure it replaces is not lost, it moved: the editor names any
   * character it cannot draw while you are typing it, which is the FAQ entry
   * pinned in the next describe. This test keeps the card on the request
   * path - the failure it guards against is a future agent reading SEO-07's
   * acceptance list, or this file's own history, and helpfully putting the
   * list back.
   */
  it('points at a request rather than enumerating gaps', () => {
    const notYet = signLanguages.notYet;
    const faq = faqAnswer('empty boxes');

    for (const script of ['Gujarati', 'Kannada', 'Odia', 'Sinhala', 'Khmer', 'Lao', 'Burmese', 'Amharic', 'Armenian', 'Georgian', 'emoji']) {
      expect(notYet, `"${script}" is back in the card's request copy`).not.toContain(script);
      expect(faq, `"${script}" is back in the coverage FAQ`).not.toContain(script);
    }
    expect(notYet.toLowerCase()).toContain('ask');
  });

  it('never names a supported language as a gap either', () => {
    for (const term of ['Japanese', 'Bengali', 'Chinese', 'Korean', 'Pashto', 'Tamil', 'Telugu', 'Punjabi', 'Malayalam', 'Hebrew', 'Thai', 'Turkish', 'Vietnamese', 'Greek']) {
      expect(signLanguages.notYet).not.toContain(term);
    }
  });

  it('offers direct request and contribution links', () => {
    expect(signLanguages.languageRequestUrl).toContain('github.com/shlomsh/pdkef/issues/new');
    expect(signLanguages.contributeUrl).toBe('https://github.com/shlomsh/pdkef');
  });
});

/**
 * SEO-07: the three things the Sign page's language story is *for*, pinned
 * where the copy actually says them. Each one shipped in the product long
 * before it was stated anywhere a visitor reads, which is the whole finding
 * that ticket recorded - so these guard the statement, not the behaviour.
 */
describe('Sign page: the guarantees SEO-07 brought up out of the design docs', () => {
  it('the subhead and the card heading both name the count the card actually lists, so none of the three can drift', () => {
    const count = signLanguages.supported.length;
    expect(signTool.subhead).toContain(`${count} languages and scripts`);
    expect(signLanguages.heading).toContain(String(count));
    expect(signLanguages.lead).toContain(`${count} languages and scripts`);
  });

  /**
   * The guarantee is stated as a promise kept ("it comes out right"), not as
   * a caveat, which is why it lives in the FAQ and not in the card's lead -
   * but it must still be stated. Losing the "while you are typing" half turns
   * it into an ordinary coverage boast that every competitor also makes.
   */
  it('states the refuse-while-typing guarantee in the FAQ, telling-you-first half included', () => {
    const faq = faqAnswer('empty boxes');
    expect(faq).toContain('while you are typing it');
    expect(faq).toContain('not after you have filled in the whole form');
  });

  it('states right-to-left growth in plain words rather than design-doc vocabulary', () => {
    expect(signLanguages.lead).toContain('grows leftward from a fixed right edge');
    expect(signLanguages.heading.toLowerCase()).toContain('right-to-left');
  });

  it('states comb fields in plain words, in the subhead, a step, and the FAQ', () => {
    expect(signTool.subhead).toContain('one letter per box');
    const step = signTool.steps.find((s) => s.text.includes('one character per box'));
    expect(step, 'no "How it works" step mentions the printed boxes').toBeTruthy();
    const faq = faqAnswer('row of little boxes');
    expect(faq).toContain('one character per box');
    // Never let it shrink to "comb field", which is the form-printing term of
    // art and means nothing to the person holding the form.
    expect(faq).not.toContain('comb');
  });

  it('keeps the six Bengali shaper divergences named in the FAQ', () => {
    const bengali = faqAnswer('Bengali');
    for (const cluster of ['ট্র', 'ঠ্র', 'টি', 'ক্ক', 'স্ক', 'দ্ধ']) {
      expect(bengali).toContain(cluster);
    }
  });
});

/**
 * Korean: an upright text face (not handwriting), the same shape of pin as
 * the Japanese/Bengali blocks above - except Korean genuinely has no
 * partial-coverage nuance to state, since Hangul (unlike Han or Hebrew
 * niqud) is a closed, contiguous block. Kept as its own describe rather than
 * folded into the "supported" loop above, matching Japanese and Bengali's
 * own dedicated blocks.
 */
describe('Korean', () => {
  it('exactly Noto Sans KR, matching LANGUAGE_COVERAGE.korean.full - full Hangul, not a curated subset', () => {
    expect(LANGUAGE_COVERAGE.korean.full.map((f) => f.family)).toEqual(['Noto Sans KR']);
    const note = supportedNote('Korean');
    expect(note).toContain('Noto Sans KR');
    expect(note).toContain('11,172');
    expect(note).toContain('no handwriting-style Korean face');
  });
});

/**
 * Chinese has no LANGUAGE_COVERAGE row (see the "not yet" describe above and
 * fonts.js's CATALOGUE comment) - there is no compact alphabet to check
 * "full" against the way Korean's Hangul or Japanese's kana are, the same
 * reason Japanese kanji is prose-only in the "Japanese" block above. These
 * pin the measured counts and the Han-unification caveat directly, since
 * nothing else can verify this card against the font bytes.
 */
describe('Chinese, Simplified and Traditional', () => {
  it('names both fonts, the measured counts, and the shared-with-Japanese substitution caveat', () => {
    const note = supportedNote('Chinese, Simplified and Traditional');
    expect(note).toContain('Noto Sans SC');
    expect(note).toContain('Noto Sans TC');
    expect(note).toContain('7,900');
    expect(note).toContain('11,100');
    expect(note).toContain('Japanese');
    expect(note.toLowerCase()).toContain('no handwriting');
  });
});

/**
 * Punjabi, Telugu and Tamil (landed 2026-08-28). Each is an upright text
 * face with no handwriting counterpart, the same shape of pin as the
 * Japanese/Bengali/Korean blocks above.
 *
 * Two of the three are pinned on something the others are not: the family is
 * deliberately NOT that script's Noto Sans face, because fontkit crashes
 * shaping Noto Sans Gurmukhi and Noto Sans Telugu (see the module docs in
 * e2e/sign/fixtures/gurmukhiCorpus.js and teluguCorpus.js for the
 * measurements, and TODO.md's entry for the decision). The card says so in
 * its own words rather than quietly shipping a different font than a reader
 * would expect, so these assert the card keeps explaining it.
 */
describe('Punjabi, Telugu and Tamil', () => {
  it('Telugu: Anek Telugu and Suranna, and the card explains why neither is the Noto face', () => {
    expect(LANGUAGE_COVERAGE.telugu.full.map((f) => f.family)).toEqual(['Anek Telugu', 'Suranna']);
    const note = supportedNote('Telugu');
    expect(note).toContain('Anek Telugu');
    expect(note).toContain('Suranna');
    expect(note).toContain('Noto Sans Telugu');
    // Suranna (FONT-08b) ships Regular only - the card says so plainly rather
    // than letting a user discover it by finding the Bold button does nothing.
    expect(note.toLowerCase()).toContain('one weight');
    expect(note.toLowerCase()).toContain('no handwriting-style telugu face');
  });

  it('Punjabi: Mukta Mahee and Tiro Gurmukhi, and the card explains why neither is the Noto face', () => {
    expect(LANGUAGE_COVERAGE.punjabi.full.map((f) => f.family)).toEqual(['Mukta Mahee', 'Tiro Gurmukhi']);
    const note = supportedNote('Punjabi');
    expect(note).toContain('Mukta Mahee');
    expect(note).toContain('Tiro Gurmukhi');
    expect(note).toContain('Noto Sans Gurmukhi');
    expect(note.toLowerCase()).toContain('no handwriting-style gurmukhi face');
  });

  it('Tamil: Noto Sans Tamil and Tiro Tamil, and the card names the countries beyond India', () => {
    // FONT-08b: Tiro Tamil (serif) joined the previously Noto-Sans-Tamil-only
    // row, closing Tamil's "no second choice" gap the same way Mukta closed
    // Devanagari's.
    expect(LANGUAGE_COVERAGE.tamil.full.map((f) => f.family)).toEqual(['Noto Sans Tamil', 'Tiro Tamil']);
    const note = supportedNote('Tamil');
    expect(note).toContain('Noto Sans Tamil');
    expect(note).toContain('Tiro Tamil');
    // Tamil is official in three countries on the traffic list, which is why
    // it outranked larger scripts in TODO.md's ordering - the card says so.
    for (const country of ['Sri Lanka', 'Singapore', 'Malaysia']) {
      expect(note).toContain(country);
    }
    expect(note.toLowerCase()).toContain('no handwriting-style tamil face');
  });
});

/**
 * Malayalam (FONT-03, landed after Punjabi/Telugu/Tamil; FONT-08 added
 * Gayathri as a second upright choice next to Anek Malayalam). Same shape of
 * pin as Telugu/Punjabi above: neither family is Noto Sans Malayalam,
 * because fontkit's GPOSProcessor.getAnchor crashes on 33/35 reph cases
 * (RA+virama+consonant, syllable-initial - not a rare pattern, see
 * e2e/sign/fixtures/malayalamCorpus.js's module doc for the measurements).
 * Gayathri crashes 0/478 on the same corpus - see
 * e2e/sign/malayalam-gayathri-shaping-guard.spec.js.
 */
describe('Malayalam', () => {
  it('Malayalam: Anek Malayalam and Gayathri, and the card explains why neither is the Noto face and names the UAE/Gulf audience', () => {
    expect(LANGUAGE_COVERAGE.malayalam.full.map((f) => f.family)).toEqual(['Anek Malayalam', 'Gayathri']);
    const note = supportedNote('Malayalam');
    expect(note).toContain('Anek Malayalam');
    expect(note).toContain('Gayathri');
    expect(note).toContain('Noto Sans Malayalam');
    expect(note).toContain('UAE');
    expect(note.toLowerCase()).toContain('no handwriting-style malayalam face');
  });
});

function numberWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
}
