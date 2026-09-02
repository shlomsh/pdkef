#!/usr/bin/env node
/**
 * Generates src/lib/fontCoverageReport.js: the catalogue coverage report
 * (W7, docs/wysiwyg-text-architecture.md §8 stage 7 and TODO.md's W7 entry).
 *
 * Answers, from the real font bytes and nothing else: for each language, and
 * for each of the seven named script combinations, which bundled families
 * can actually draw it. This is what makes "should we add a font" a data
 * question instead of a session of manual probing - re-derives §4.1's
 * matrix rather than trusting it, and this is the first place with an answer
 * for Hebrew + Arabic at all.
 *
 * Deliberately does NOT re-parse any .ttf file. src/lib/fontCoverageTable.js
 * (scripts/generate-font-coverage.mjs) already range-encodes every bundled
 * font file's real glyph coverage; this script only asks it questions
 * (fontFileHasGlyph), the same way src/lib/fonts.js's covers() does. The
 * character sets each language is judged against live in
 * scripts/font-languages.mjs, imported here and by
 * src/lib/fontCoverageReport.test.js so both sides of the drift check use
 * the exact same definitions.
 *
 * This report is a Node/build-time artifact only - it is never imported by
 * tools.js or any Preact island, so it costs zero browser page weight
 * (checked by npm run test:weight). What the Sign page's Languages card
 * actually shows stays curated prose in src/data/tools.js; a test
 * (src/lib/languageCoverage.test.js) keeps that prose honest against this
 * report instead of a runtime import doing it.
 *
 * Run with: npm run generate:font-coverage-report
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_COVERAGE_FILES, fontFileHasGlyph } from '../src/lib/fontCoverageTable.js';
import { HANDWRITING_FONTS, TEXT_FONTS, requestedFontFile } from '../src/editor/text/fonts.js';
import { LANGUAGES, CYRILLIC_ANCHOR_LANGUAGES, NAMED_COMBINATIONS } from './font-languages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_FILE = join(REPO_ROOT, 'src', 'lib', 'fontCoverageReport.js');

/** Every catalogue family, each judged by its -Regular.ttf file - matching
 * how docs/wysiwyg-text-architecture.md §4.1 probed "every bundled
 * -Regular.ttf". Weight/style variants share the base font's cmap on every
 * bundled family (see fontCoverage.test.js), so Regular is the right file to
 * judge whether the *family* can draw a script at all. */
const FAMILIES = [...HANDWRITING_FONTS, ...TEXT_FONTS];

function regularFile(family) {
  return requestedFontFile(family, 'normal', 'normal');
}

function isHandwriting(family) {
  return HANDWRITING_FONTS.includes(family);
}

/** Fraction of `codePoints` that `file` has a glyph for, via fontFileHasGlyph
 * - never re-parses a font, only asks the committed coverage table. */
function coverageFraction(file, codePoints) {
  if (!FONT_COVERAGE_FILES.includes(file)) return 0;
  if (codePoints.length === 0) return 1;
  let covered = 0;
  for (const cp of codePoints) {
    if (fontFileHasGlyph(file, cp)) covered += 1;
  }
  return covered / codePoints.length;
}

function computeLanguageCoverage() {
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

/** A family covers a combination when it fully covers BOTH languages' real
 * character sets - not a union sampled loosely, an intersection of two
 * independently-defined "full" sets. */
function computeCombinationCoverage(languageCoverage) {
  return NAMED_COMBINATIONS.map(([a, b]) => {
    const fullA = new Map(languageCoverage[a].full.map((f) => [f.family, f.style]));
    const families = languageCoverage[b].full
      .filter((f) => fullA.has(f.family))
      .map((f) => ({ family: f.family, style: fullA.get(f.family) }));
    return { a, b, aLabel: LANGUAGES[a].label, bLabel: LANGUAGES[b].label, families };
  });
}

/** The seven Cyrillic anchor languages, cross-checked against exactly which
 * families cover all seven at once - the concrete, already-measured claim
 * TODO.md's W7 entry and this task both name as the sanity anchor. */
function computeCyrillicAnchor(languageCoverage) {
  const perLanguageFamilies = CYRILLIC_ANCHOR_LANGUAGES.map((id) => new Set(languageCoverage[id].full.map((f) => f.family)));
  const coversAllSeven = FAMILIES.filter((family) => perLanguageFamilies.every((set) => set.has(family)));
  return {
    languages: CYRILLIC_ANCHOR_LANGUAGES,
    familiesCoveringAllSeven: coversAllSeven.map((family) => ({ family, style: isHandwriting(family) ? 'handwriting' : 'upright' })),
  };
}

function formatFamilyList(families) {
  if (families.length === 0) return '[]';
  const entries = families.map((f) => `{ family: ${JSON.stringify(f.family)}, style: ${JSON.stringify(f.style)}${'fraction' in f ? `, fraction: ${f.fraction}` : ''} }`);
  return `[${entries.join(', ')}]`;
}

function generateSource(languageCoverage, combinationCoverage, cyrillicAnchor) {
  const languageEntries = Object.entries(languageCoverage)
    .map(
      ([id, entry]) => `  ${JSON.stringify(id)}: {
    label: ${JSON.stringify(entry.label)},
    requiredCodePointCount: ${entry.requiredCodePointCount},
    full: ${formatFamilyList(entry.full)},
    partial: ${formatFamilyList(entry.partial)},
  },`,
    )
    .join('\n');

  const combinationEntries = combinationCoverage
    .map(
      (c) => `  { a: ${JSON.stringify(c.a)}, b: ${JSON.stringify(c.b)}, aLabel: ${JSON.stringify(c.aLabel)}, bLabel: ${JSON.stringify(c.bLabel)}, families: ${formatFamilyList(c.families)} },`,
    )
    .join('\n');

  return `/**
 * GENERATED FILE - do not hand-edit.
 *
 * Produced by scripts/generate-font-coverage-report.mjs from
 * src/lib/fontCoverageTable.js (itself generated from the real font bytes in
 * public/fonts/) and the character-set definitions in
 * scripts/font-languages.mjs. Rerun that script
 * (npm run generate:font-coverage-report) and commit the result whenever a
 * font file or a language definition changes.
 * src/lib/fontCoverageReport.test.js regenerates this in memory and fails if
 * it disagrees with what is committed here.
 *
 * "full" means the family's -Regular.ttf has a glyph for every codepoint the
 * language's real alphabet needs (scripts/font-languages.mjs). "partial"
 * means some but not all, reported as a fraction - never rounded up to full.
 *
 * "Full" is full against a stated alphabet, and two exclusions are worth
 * knowing before quoting a row: Hebrew omits meteg (U+05BD) and rafe
 * (U+05BF), and Devanagari omits the Dravidian-loan letters U+0929/U+0934.
 * Both are reasoned in scripts/font-languages.mjs. Meteg in particular is
 * genuinely absent from Heebo, Assistant, Gveret Levin and Alef, so a
 * "Hebrew: full" row for those four means ordinary vowelized Hebrew, not
 * every mark the block defines - and someone who does type one still gets
 * named the character at typing time (src/lib/textCoverage.js), which is
 * where that honesty is enforced rather than here.
 * A family absent from both lists has zero of that language's codepoints.
 *
 * Not imported by any browser bundle - see the header of
 * generate-font-coverage-report.mjs for why the Sign page's Languages card
 * is instead cross-checked against this at test time
 * (src/lib/languageCoverage.test.js), not fed from it at runtime.
 */

/** @typedef {{ family: string, style: 'handwriting' | 'upright' }} CoveringFamily */
/** @typedef {CoveringFamily & { fraction: number }} PartialCoveringFamily */

/**
 * @type {Record<string, {
 *   label: string,
 *   requiredCodePointCount: number,
 *   full: CoveringFamily[],
 *   partial: PartialCoveringFamily[],
 * }>}
 */
export const LANGUAGE_COVERAGE = {
${languageEntries}
};

/**
 * The seven named script combinations from
 * docs/wysiwyg-text-architecture.md §4.1 / §8 stage 7 and TODO.md's W7
 * entry. A family appears here only if it fully covers BOTH languages' real
 * character sets, not a loose union.
 *
 * @type {Array<{ a: string, b: string, aLabel: string, bLabel: string, families: CoveringFamily[] }>}
 */
export const COMBINATION_COVERAGE = [
${combinationEntries}
];

/**
 * The concrete anchor from TODO.md's W7 entry: which families fully cover
 * all seven of Russian, Ukrainian, Belarusian, Bulgarian, Serbian,
 * Macedonian and Kazakh at once (whole alphabet, including capitals).
 *
 * @type {{ languages: string[], familiesCoveringAllSeven: CoveringFamily[] }}
 */
export const CYRILLIC_ANCHOR = {
  languages: ${JSON.stringify(cyrillicAnchor.languages)},
  familiesCoveringAllSeven: ${formatFamilyList(cyrillicAnchor.familiesCoveringAllSeven)},
};
`;
}

function main() {
  const languageCoverage = computeLanguageCoverage();
  const combinationCoverage = computeCombinationCoverage(languageCoverage);
  const cyrillicAnchor = computeCyrillicAnchor(languageCoverage);
  const source = generateSource(languageCoverage, combinationCoverage, cyrillicAnchor);
  writeFileSync(OUT_FILE, source);
  console.log(`Wrote ${OUT_FILE}`);

  console.log('\nCombinations:');
  for (const c of combinationCoverage) {
    const names = c.families.map((f) => `${f.family}${f.style === 'handwriting' ? ' (handwriting)' : ''}`);
    console.log(`  ${c.aLabel} + ${c.bLabel}: ${names.length > 0 ? names.join(', ') : 'none'}`);
  }
  console.log(
    `\nCyrillic anchor (Russian, Ukrainian, Belarusian, Bulgarian, Serbian, Macedonian, Kazakh - all seven): ${cyrillicAnchor.familiesCoveringAllSeven.map((f) => f.family).join(', ') || 'none'}`,
  );
}

main();
