/**
 * RED-17: the check follows a covered word to its repeats, on three real
 * forms (a US tax form, a US employment form, a Hebrew health declaration).
 * Same pdf.js-in-Node setup as `redact.test.js`: the legacy build runs
 * outside a browser, and every `getDocument()` passes `wasmUrl` per
 * `pdfjsWasm.js`'s rule. No mocks of the feature code itself; this is the
 * real pipeline `runCheck.ts` drives, minus the dynamic import.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, beforeAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readGlyphs } from '../../../editor/adapters/pdf/readGlyphs.js';
import { pageGeometryFromPdfJsPage } from '../../../editor/geometry/coords.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { readTextItems } from '../../../lib/pdfTextItems.ts';
import { findMatches } from '../find/findMatches.ts';
import { foldForSearch, termFinder } from '../find/finders.ts';
import { buildPageText } from '../find/pageText.ts';
import { checkSavedFile } from './checkSavedFile.ts';
import { coveredTerms, MIN_COVERED_CHARS } from './coveredTerms.ts';

beforeAll(() => {
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerUrl = pathToFileURL(workerPath).href;

  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() { /* ignore - keep it pointed at the real worker file */ },
    configurable: true,
  });
});

const CORPUS_DIR = path.resolve(__dirname, '../../../../spikes/red-01/corpus');

function loadOriginalDoc(filename) {
  const bytes = fs.readFileSync(path.join(CORPUS_DIR, filename));
  return pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: PDFJS_WASM_URL });
}

/** `original` `SearchablePage[]`, built the way `runCheck.ts` builds it. */
async function buildOriginalPages(doc) {
  const pages = [];
  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex + 1);
    const geometry = pageGeometryFromPdfJsPage(page);
    const items = (await readTextItems(page)).filter((item) => typeof item.str === 'string');
    pages.push({ text: buildPageText(pageIndex, items), geometry });
  }
  return pages;
}

/** Every word of at least `MIN_COVERED_CHARS` letters, in reading order,
 * first occurrence only - the candidates `pickCoveredTerm` tries in turn. No
 * word is hardcoded, so a corpus fixture change can't make this pass by
 * accident. `\p{L}+` covers Hebrew as well as Latin letters. */
function candidateWords(pages) {
  const seen = new Set();
  const words = [];
  for (const page of pages) {
    for (const match of page.text.text.matchAll(/\p{L}+/gu)) {
      const word = match[0];
      if (word.length < MIN_COVERED_CHARS) continue;
      const key = word.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return words;
}

/**
 * Finds a word, a page to cover one of its occurrences on, and a covering
 * box for it built the way Find would (`findMatches` with shape `'core'` to
 * locate the occurrence, the default `'cover'` shape for the box itself -
 * the same pairing `uncoveredMatches` uses internally). `coveredTerms()`
 * then reads back what that box actually covers on the real page glyphs -
 * on a real form a covering box sized off character *counts* (no font
 * metrics are available in Node) can reach a neighbouring word on a long
 * text run, so the resulting covered term is not always the single word we
 * started from. What matters for RED-17 is that term: whether *it* repeats,
 * uncovered, on another page (or twice on the same page for a one-page
 * form). `allowSamePage` gates the single-page fallback so cross-page
 * repeats are always preferred when the form has more than one page.
 */
async function pickCoveredTerm(doc, pages, { allowSamePage }) {
  const glyphsByPage = new Map();
  async function glyphsForPage(pageIndex) {
    if (!glyphsByPage.has(pageIndex)) {
      const page = await doc.getPage(pageIndex + 1);
      glyphsByPage.set(pageIndex, await readGlyphs(pdfjs, page));
    }
    return glyphsByPage.get(pageIndex);
  }

  for (const word of candidateWords(pages)) {
    const finder = termFinder(word);
    const coreMatches = findMatches(pages, finder, undefined, 'core');
    if (coreMatches.length === 0) continue;

    // Try the pages with fewest occurrences of the word first: the best
    // chance a single box covers everything the word has on that page.
    const pagesWithWord = [...new Set(coreMatches.map((match) => match.pageIndex))].sort((a, b) => {
      const countA = coreMatches.filter((match) => match.pageIndex === a).length;
      const countB = coreMatches.filter((match) => match.pageIndex === b).length;
      return countA - countB || a - b;
    });

    for (const coveredPageIndex of pagesWithWord) {
      const coveredMatch = coreMatches.find((match) => match.pageIndex === coveredPageIndex);
      const coverMatch = findMatches(pages, finder).find((match) => match.id === coveredMatch.id);
      if (!coverMatch) continue;

      const glyphs = await glyphsForPage(coveredPageIndex);
      if (!glyphs) continue;

      const terms = coveredTerms([{ glyphs, geometry: pages[coveredPageIndex].geometry, boxes: coverMatch.boxes }]);
      const foldedWord = foldForSearch(word).folded;
      const matchingTerm = terms.find((term) => foldForSearch(term.label).folded.includes(foldedWord));
      if (!matchingTerm) continue;

      // The box drawn above was sized for `word` alone, but the glyphs it
      // actually reached (`matchingTerm.label`) can be wider on a long text
      // run (no real font metrics in Node - see the doc comment). Rebuild
      // the box from the *term's own* finder, so it is the box that would
      // actually cover every occurrence `checkSavedFile` looks for: it
      // re-derives coverage from `term.finder`, not from `word`.
      const termCoreMatches = findMatches(pages, matchingTerm.finder, undefined, 'core')
        .filter((match) => match.pageIndex === coveredPageIndex);
      const termCoreMatch = termCoreMatches.find((match) => match.start <= coveredMatch.start && match.end >= coveredMatch.end)
        ?? termCoreMatches[0];
      if (!termCoreMatch) continue;
      const termCoverMatch = findMatches(pages, matchingTerm.finder).find((match) => match.id === termCoreMatch.id);
      if (!termCoverMatch) continue;

      const coveredMatchCount = matchingTerm.finder(pages[coveredPageIndex].text.text).length;
      const pagesWithPhrase = pages
        .filter((page) => matchingTerm.finder(page.text.text).length > 0)
        .map((page) => page.text.pageIndex);
      const otherPageCandidates = pagesWithPhrase.filter((pageIndex) => pageIndex !== coveredPageIndex);

      let otherPageIndex;
      if (otherPageCandidates.length > 0) {
        otherPageIndex = Math.min(...otherPageCandidates);
      } else if (allowSamePage && coveredMatchCount >= 2) {
        otherPageIndex = coveredPageIndex;
      } else {
        continue;
      }

      const boxes = termCoverMatch.boxes.map((box) => ({ ...box, pageIndex: coveredPageIndex, type: 'blackout' }));
      return { word, matchingTerm, coveredPageIndex, otherPageIndex, coveredMatchCount, boxes };
    }
  }

  return null;
}

async function runFormCheck(filename) {
  const loadingTask = loadOriginalDoc(filename);
  const doc = await loadingTask.promise;
  try {
    const original = await buildOriginalPages(doc);

    // Cross-page repeats are tried first; the same-page fallback (for a
    // one-page form, or a term this corpus only repeats on its own page)
    // only runs if nothing cross-page was found - and a one-page form has
    // no cross-page pass to try at all.
    const picked = (original.length > 1 && (await pickCoveredTerm(doc, original, { allowSamePage: false })))
      || (await pickCoveredTerm(doc, original, { allowSamePage: true }));
    expect(picked, `${filename}: expected some word's covered term to repeat, cross-page or on its own page`).toBeTruthy();
    const { word, matchingTerm, coveredPageIndex, otherPageIndex, coveredMatchCount, boxes } = picked;

    // Step 4a: the saved file kept every page's text, including the other
    // occurrence's page - an in-text finding names it.
    const outcomeKeptText = checkSavedFile({
      terms: [matchingTerm],
      original,
      boxes,
      saved: { pages: original, places: [], picturePages: [], attachmentCount: 0 },
    });
    expect(outcomeKeptText[0].findings).toContainEqual({ kind: 'in-text', pageIndex: otherPageIndex });

    // Step 4b: the other occurrence's page was saved as a picture instead -
    // a visible-in-picture finding names it.
    const savedAsPicture = original.filter((page) => page.text.pageIndex !== otherPageIndex);
    const outcomeAsPicture = checkSavedFile({
      terms: [matchingTerm],
      original,
      boxes,
      saved: { pages: savedAsPicture, places: [], picturePages: [otherPageIndex], attachmentCount: 0 },
    });
    expect(outcomeAsPicture[0].findings).toContainEqual({ kind: 'visible-in-picture', pageIndex: otherPageIndex });

    // Step 4c: when the covered occurrence is the *only* one on its page,
    // covering it and saving that page as a picture produces no finding for
    // it - the box hid the one thing there was to find.
    if (coveredMatchCount === 1) {
      const coveredPageAsPicture = original.filter((page) => page.text.pageIndex !== coveredPageIndex);
      const outcomeCoveredAsPicture = checkSavedFile({
        terms: [matchingTerm],
        original,
        boxes,
        saved: { pages: coveredPageAsPicture, places: [], picturePages: [coveredPageIndex], attachmentCount: 0 },
      });
      expect(outcomeCoveredAsPicture[0].findings.some((finding) => finding.pageIndex === coveredPageIndex)).toBe(false);
    }

    return { word, term: matchingTerm.label, coveredPageIndex, otherPageIndex };
  } finally {
    await loadingTask.destroy();
  }
}

describe('RED-17 real forms: a covered word followed to its repeats', () => {
  it('IRS 1040 (2024): a covered term repeated across its two pages', async () => {
    const picked = await runFormCheck('real-world-irs-1040-2024.pdf');
    expect(picked.coveredPageIndex).not.toBe(picked.otherPageIndex);
    // QUAL-17: ~1.4s alone (about 1.0s is the pick loop: pdf.js cold start plus
    // 15 candidate words through findMatches), but over the 5s default when the
    // whole suite runs in parallel. Nothing cheaper to trim without weakening it.
  }, 30000);

  it('USCIS I-9 (2025): a covered term repeated across its four pages', async () => {
    const picked = await runFormCheck('real-world-uscis-i9-2025.pdf');
    expect(picked.coveredPageIndex).not.toBe(picked.otherPageIndex);
  });

  it('Hebrew health declaration (2021): one page, a covered term repeated on it', async () => {
    const picked = await runFormCheck('real-world-health-declaration-2021.pdf');
    // Single-page form: no other page exists, so the fallback repeats the
    // term on its own page (see pickCoveredTerm's doc comment).
    expect(picked.coveredPageIndex).toBe(picked.otherPageIndex);
    expect(/\p{L}/u.test(picked.word)).toBe(true);
  });
});
