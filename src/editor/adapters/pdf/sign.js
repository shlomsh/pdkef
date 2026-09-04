import {
  PDFDocument,
  PDFName,
  PDFNumber,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  createPageGeometry,
  pagePercentToEditorPoint,
  visiblePageBox,
} from '../../geometry/coords.js';
import { getElementDefinition } from '../../registry/index.ts';
import { findUnrepresentableCharacters } from '../../text/textCoverage.js';
import { embeddedFontFile, resolveTypography } from '../../text/fonts.js';
import { HELVETICA_BASELINE_OFFSET_EM, DEFAULT_LINE_HEIGHT_EM } from '../../../constants/signGeometry.js';

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

// The coverage policy - which elements get judged, which of their characters
// actually reach the page, and which font each resolves to - lives in
// textCoverage.js, so the editor's while-typing warning runs the exact same
// rule as this refusal. See that file's header for why the two must not fork.

function baselineOffsetEm(pdfFont, lineHeightEm = DEFAULT_LINE_HEIGHT_EM) {
  try {
    const fk = pdfFont?.embedder?.font;
    if (fk?.unitsPerEm && Number.isFinite(fk?.ascent) && Number.isFinite(fk?.descent)) {
      return lineHeightEm / 2 + (fk.ascent / fk.unitsPerEm - Math.abs(fk.descent / fk.unitsPerEm)) / 2;
    }
  } catch {
    // Use the historic Helvetica fallback when fontkit metrics are unavailable.
  }
  return HELVETICA_BASELINE_OFFSET_EM;
}

// pdf-lib exposes CropBox/MediaBox/Rotate at the page API, but not /UserUnit.
// Read that one numeric page attribute through the library's typed low-level
// objects, including an inherited value when present. Invalid producer output
// falls back to the PDF default of 1, matching pdf.js.
function pageUserUnit(page) {
  try {
    const value = page.node.getInheritableAttribute(PDFName.of('UserUnit'));
    const number = page.doc.context.lookupMaybe(value, PDFNumber)?.asNumber();
    return Number.isFinite(number) && number > 0 ? number : 1;
  } catch {
    return 1;
  }
}

export function pageGeometryFromPdfLibPage(page) {
  return createPageGeometry({
    cropBox: visiblePageBox(page.getMediaBox(), page.getCropBox()),
    rotation: page.getRotation().angle,
    userUnit: pageUserUnit(page),
  });
}

// Bakes each element through its registry owner. Document loading and font caching
// stay here because they are PDF-wide concerns, not per-element behavior.
export async function signPdf(file, elements, onProgress) {
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
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
      console.warn(`Could not load custom font ${fileName}`, error);
      return null;
    }
  };

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

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const page = pdfDoc.getPage(element.pageIndex);
    const pageGeometry = pageGeometryFromPdfLibPage(page);
    const { x: pdfX, y: pdfY } = pagePercentToEditorPoint({
      x: element.left ?? element.x1 ?? 0,
      y: element.top ?? element.y1 ?? 0,
    }, pageGeometry);

    // Every registry serializer draws in one rotation/crop-neutral editor
    // space. This one graphics-state transform maps the complete result back
    // to raw PDF user space; page /Rotate then displays it exactly where the
    // pdf.js viewport and DOM overlay placed it.
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...pageGeometry.editorToPdf),
    );
    try {
      await getElementDefinition(element.type).serialize(element, {
        pdfDoc, page,
        pdfWidth: pageGeometry.width,
        pdfHeight: pageGeometry.height,
        pdfX,
        pdfY,
        pageGeometry,
        loadCustomFont,
        baselineOffset: baselineOffsetEm,
      });
    } finally {
      page.pushOperators(popGraphicsState());
    }
    onProgress?.((i + 1) / elements.length);
  }

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
}
