import { degrees } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { resolveCommentBoxes } from '#editor/comments/anchors.ts';
import { drawElements } from '#editor/export/drawElements.ts';
import { findUnrepresentableCharacters } from './textCoverage.js';
import { embeddedFontFile, resolveTypography } from '#editor/text/fonts.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { applyRotation } from '#lib/pages/pageOps.js';
import { flattenDoc } from './flatten.js';

/**
 * Thrown by signPdf's coverage pre-pass (docs/hebrew-text-shaping-export.md,
 * "Layer 3") before any element is serialized, so a document with a character
 * no bundled font can draw for it is refused whole rather than downloaded
 * with that content silently missing. `characters` is deduplicated, in
 * first-seen order, for the caller to name in its own message.
 */
export class UnrepresentableTextError extends Error {
  constructor(characters, pageNumbers = []) {
    super(`No bundled font can draw: ${characters.join(', ')}`);
    this.name = 'UnrepresentableTextError';
    this.characters = characters;
    // 1-based page numbers, so the message can point at where to look. A
    // document refused without saying where is one the user cannot act on.
    this.pageNumbers = pageNumbers;
  }
}

/** A selected bundled face could not be loaded; never substitute silently. */
export class FontUnavailableError extends Error {
  constructor(family) {
    super(`${family} is not available for PDF export`);
    this.name = 'FontUnavailableError';
    this.family = family;
  }
}

export { FormFlattenError } from './flatten.js';

// The coverage policy - which elements get judged, which of their characters
// actually reach the page, and which font each resolves to - lives in
// textCoverage.js, so the editor's while-typing warning runs the exact same
// rule as this refusal. See that file's header for why the two must not fork.

// pdf-lib exposes CropBox/MediaBox/Rotate at the page API, but not /UserUnit.
// Read that one numeric page attribute through the library's typed low-level
// objects, including an inherited value when present. Invalid producer output
// falls back to the PDF default of 1, matching pdf.js.
// Export policy (MOBI-02): a source PDF that carries an AcroForm is flattened
// before any of PDkef's own content is drawn. Without this, every widget
// annotation ships intact and still empty, and most viewers paint widget
// annotations above ordinary page content - so the recipient can open the
// returned form and see a live, empty field box covering the text PDkef just
// drew. The sender never sees this: pdf.js paints widget appearances as page
// content in the editor's own canvas. Flattening removes that gap and is
// almost always what a recipient wants from a returned form; the tradeoff
// (the document stops being fillable) is accepted because the answers are
// already baked into page content by the time export runs. See
// backlog/tasks/MOBI-02.md for the two alternatives considered and rejected.
//
// Each element is baked through its registry owner by `drawElements` (src/editor/export).
// Document loading, font caching, page turns, coverage and flattening stay here.
// `pageTurns` (SIGN-43) maps a page index to the extra clockwise quarter turns the
// person gave it; elements are stored in percent of that turned page.
/**
 * @param {*} file
 * @param {*} sourceElements
 * @param {((progress: number) => void) | undefined} onProgress
 * @param {{ pageTurns?: Readonly<Record<number, 1 | 2 | 3>> }} [options]
 */
export async function signPdf(file, sourceElements, onProgress, { pageTurns = {} } = {}) {
  const { doc: pdfDoc } = await openPdfDoc(file);
  pdfDoc.registerFontkit(fontkit);
  const loadedFonts = {};

  const fetchFont = async (fileName) => {
    if (loadedFonts[fileName]) return loadedFonts[fileName];
    const res = await fetch(`/fonts/${fileName}`);
    if (!res.ok) throw new Error(`${fileName}: ${res.status}`);
    const customFont = await pdfDoc.embedFont(await res.arrayBuffer(), { subset: true });
    loadedFonts[fileName] = customFont;
    return customFont;
  };

  const loadCustomFont = async (fontFamily, fontWeight, fontStyle) => {
    const fileName = embeddedFontFile(fontFamily, fontWeight, fontStyle);
    if (!fileName) {
      console.warn(`Could not load unknown custom font ${fontFamily}`);
      return null;
    }
    try {
      return await fetchFont(fileName);
    } catch (error) {
      // A failed fetch is the network (offline, not yet provisioned), which is
      // expected. Classified by its message, read here and never sent; any other
      // TypeError, like WebKit's `undefined is not a function`, is ours.
      const network = error instanceof TypeError && /fetch|load failed|network/i.test(error.message);
      if (!network) reportError('fonts', error, 'fetch_custom_font');
      console.warn(`Could not load custom font ${fileName}`, error);
      return null;
    }
  };

  // Turn the pages before any geometry is read: pageGeometryFromPdfLibPage
  // reads /Rotate, so every element below, and land in the turned frame. Flattening draws in raw user space, so
  // it is unaffected by the turn.
  for (const [index, turns] of Object.entries(pageTurns)) {
    if (!(Number(index) in pdfDoc.getPages())) continue;
    const page = pdfDoc.getPage(Number(index));
    applyRotation(page, 90 * turns);
    // applyRotation can leave 360; /Rotate is kept in 0-270 so geometry reads stay canonical.
    const angle = page.getRotation().angle;
    if (angle >= 360) page.setRotation(degrees(angle % 360));
  }

  // The coverage pre-passes judge the elements as drawn, so the comment boxes resolve first;
  // drawElements resolves them again, which is a no-op on an already-resolved list.
  const elements = resolveCommentBoxes(sourceElements);

  // Load every exact face the document needs before coverage checking or page
  // mutation. The old generic Arimo fallback made an uncached Latin display
  // face look successful offline while exporting in a visibly different
  // font. A named refusal keeps the draft intact and points the UI back to the
  // font picker's explicit provisioning action instead.
  for (const element of elements) {
    if (element.type !== 'text' || !element.text) continue;
    const typography = resolveTypography(
      element.fontFamily,
      element.text,
      element.fontWeight,
      element.fontStyle,
      element.fontSize,
    );
    if (!await loadCustomFont(typography.family, typography.weight, typography.style)) {
      throw new FontUnavailableError(typography.family);
    }
  }

  // Refuse before writing anything, rather than embed a document some of
  // whose text silently has no glyphs (docs/hebrew-text-shaping-export.md,
  // "Layer 3"). Must run before the loop below touches pdfDoc at all - the
  // whole point is "refused" and "partially written" are never both true.
  const { characters: missingCharacters, pageNumbers } = await findUnrepresentableCharacters(elements, loadCustomFont);
  if (missingCharacters.length > 0) throw new UnrepresentableTextError(missingCharacters, pageNumbers);

  // Flatten before drawing any element, not after: the flattener appends each
  // annotation's appearance to its page (the same `page.pushOperators` this
  // file uses below for its own elements), so flattening first keeps PDkef's
  // own content on top of the flattened field rather than under it -
  // flattening after the draw loop would reproduce the "empty box on top of
  // the answer" defect (MOBI-02). It is inert on a document with no
  // annotations and never calls `getForm()`, which would strip XFA data.
  flattenDoc(pdfDoc);

  await drawElements(pdfDoc, elements, { loadCustomFont, onProgress });

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
}
