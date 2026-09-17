#!/usr/bin/env node
/**
 * MOBI-10 spike: non-anydoc signal extraction.
 *
 * Reads one page of a PDF and writes four files into `--out`:
 *   - candidates.native-widget.json  (AcroForm widget annotations, via pdf.js)
 *   - candidates.pdfjs-layout.json   (existing comb/checkbox detector, via formGrid.js)
 *   - text-items.json                (every pdf.js text run, for later label association)
 *   - page.json                      (page size, rotation, and the counts above)
 *
 * Coordinates: see scripts/spike/mobi-10/CONTRACT.md. Every bounds object in every
 * output file is normalized to the page as fractions 0..1, origin top-left, y down.
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/extract.mjs --input <pdf> [--page 1] --out <dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectPageRegions } from '../../../src/editor/adapters/pdf/formGrid.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { page: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--input') args.input = argv[(i += 1)];
    else if (flag === '--page') args.page = Number(argv[(i += 1)]);
    else if (flag === '--out') args.out = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.input || !args.out || !Number.isInteger(args.page) || args.page < 1) {
    throw new Error('Usage: extract.mjs --input <pdf> [--page <1-based, default 1>] --out <dir>');
  }
  return args;
}

/**
 * PDF user-space rect (origin bottom-left, y up) -> CONTRACT.md's normalized
 * top-left model: x = x0/pageWidth, y = (pageHeight - y1)/pageHeight, width and
 * height divided by the matching page dimension. The one transform in this
 * script; every candidate and every text item bounds goes through it.
 */
function pdfRectToFraction({ x0, y0, x1, y1 }, pageWidth, pageHeight) {
  return {
    x: x0 / pageWidth,
    y: (pageHeight - y1) / pageHeight,
    width: (x1 - x0) / pageWidth,
    height: (y1 - y0) / pageHeight,
  };
}

/**
 * formGrid.js's detectPageRegions returns `{left, top, width, height}` in the
 * editor's page-PERCENT model (0..100, top-left origin, y down — see
 * pdfPointToPagePercent in src/editor/geometry/coords.ts). CONTRACT.md wants
 * FRACTIONS (0..1) in the same top-left/y-down orientation, so the only
 * conversion needed here is dividing by 100. This was verified empirically by
 * rendering overlay.pdfjs-layout.png and confirming the boxes sit on the
 * printed combs/checkboxes (see README.md "Coordinate conversion").
 */
function percentBoxToFraction({ left, top, width, height }) {
  return { x: left / 100, y: top / 100, width: width / 100, height: height / 100 };
}

const FIELD_TYPE_KIND = { Tx: 'text', Ch: 'select', Sig: 'signature' };

function widgetKind(annotation) {
  if (annotation.fieldType === 'Tx') return annotation.comb ? 'comb' : 'text';
  if (annotation.fieldType === 'Btn') {
    if (annotation.radioButton) return 'radio';
    return 'checkbox';
  }
  return FIELD_TYPE_KIND[annotation.fieldType] || 'unknown';
}

function extractNativeWidgetCandidates(annotations, pageWidth, pageHeight, pageIndex) {
  const widgets = annotations.filter((a) => a.fieldType);
  return widgets.map((a, index) => {
    const [x0, y0, x1, y1] = a.rect;
    const required = typeof a.fieldFlags === 'number' ? (a.fieldFlags & 2) !== 0 : 'unknown';
    const candidate = {
      id: `native-${String(index).padStart(4, '0')}`,
      pageIndex,
      bounds: pdfRectToFraction({ x0, y0, x1, y1 }, pageWidth, pageHeight),
      kind: widgetKind(a),
      label: a.fieldName || undefined,
      required,
      confidence: 1.0,
      source: 'native-widget',
    };
    if (Array.isArray(a.options) && a.options.length > 0) {
      candidate.options = a.options.map((o) => ({
        label: o.displayValue ?? o.exportValue ?? String(o),
        value: o.exportValue,
      }));
    }
    return candidate;
  });
}

function extractPdfjsLayoutCandidates(combs, checkboxes, pageIndex) {
  const out = [];
  combs.forEach((comb, index) => {
    out.push({
      id: `pdfjs-layout-comb-${String(index).padStart(4, '0')}`,
      pageIndex,
      bounds: percentBoxToFraction(comb),
      kind: 'comb',
      cells: comb.cells,
      required: 'unknown',
      confidence: 0.8,
      source: 'pdfjs-layout',
      notes: comb.boxed ? 'boxed cells' : 'teeth on a baseline',
    });
  });
  checkboxes.forEach((box, index) => {
    out.push({
      id: `pdfjs-layout-checkbox-${String(index).padStart(4, '0')}`,
      pageIndex,
      bounds: percentBoxToFraction(box),
      kind: 'checkbox',
      required: 'unknown',
      confidence: 0.8,
      source: 'pdfjs-layout',
    });
  });
  return out;
}

// A Hebrew word that STARTS with a final-form letter (ם ן ץ ף ך) could only be
// correct if the string had been reversed — those forms are letter-final only.
const FINAL_FORM_LETTERS = new Set(['ם', 'ן', 'ץ', 'ף', 'ך']); // ם ן ץ ף ך
const HEBREW_RANGE = /[֐-׿]/;

function isSuspectedReversedHebrew(str, dir) {
  const trimmed = str.trim();
  if (dir !== 'rtl' || trimmed.length < 2 || !HEBREW_RANGE.test(trimmed[0])) return false;
  return FINAL_FORM_LETTERS.has(trimmed[0]);
}

function extractTextItems(items, pageWidth, pageHeight) {
  return items.map((item) => {
    const [, , , , e, f] = item.transform;
    const bounds = pdfRectToFraction(
      { x0: e, y0: f, x1: e + item.width, y1: f + item.height },
      pageWidth,
      pageHeight,
    );
    return {
      str: item.str,
      dir: item.dir,
      bounds,
      suspectedReversed: isSuspectedReversedHebrew(item.str, item.dir),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pageIndex = args.page - 1;
  const inputBytes = fs.readFileSync(path.resolve(args.input));

  // pdf-lib for the AcroForm/layout side (matches how formGrid.js and its own
  // fixture generator load pages elsewhere in this repo).
  const pdfLibDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true, updateMetadata: false });
  if (pageIndex >= pdfLibDoc.getPageCount()) {
    throw new Error(`--page ${args.page} is out of range; ${args.input} has ${pdfLibDoc.getPageCount()} page(s)`);
  }
  const pdfLibPage = pdfLibDoc.getPage(pageIndex);
  const { width: pageWidth, height: pageHeight } = pdfLibPage.getSize();
  const rotation = pdfLibPage.getRotation().angle;

  // pdf.js (legacy/node build, same pattern as scripts/generate-test-fixtures.mjs)
  // for AcroForm widget annotations and text content. standardFontDataUrl/cMapUrl
  // point at the package's own bundled data so embedded CID fonts (the Hebrew
  // text in these forms) resolve without a "standardFontDataUrl" warning.
  const pdfjsPackageDir = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
  const pdfjsDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(inputBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: `${path.join(pdfjsPackageDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsPackageDir, 'cmaps')}${path.sep}`,
    cMapPacked: true,
  }).promise;
  const pdfjsPage = await pdfjsDoc.getPage(args.page);
  const annotations = await pdfjsPage.getAnnotations({ intent: 'display' });
  const textContent = await pdfjsPage.getTextContent();

  const { combs, checkboxes } = detectPageRegions(pdfLibPage, pageIndex);

  const nativeWidgetCandidates = extractNativeWidgetCandidates(annotations, pageWidth, pageHeight, pageIndex);
  const pdfjsLayoutCandidates = extractPdfjsLayoutCandidates(combs, checkboxes, pageIndex);
  const textItems = extractTextItems(textContent.items, pageWidth, pageHeight);
  const suspectedReversedCount = textItems.filter((item) => item.suspectedReversed).length;
  const rtlItemCount = textItems.filter((item) => item.dir === 'rtl').length;

  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const write = (name, data) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);

  write('candidates.native-widget.json', nativeWidgetCandidates);
  write('candidates.pdfjs-layout.json', pdfjsLayoutCandidates);
  write('text-items.json', textItems);
  write('page.json', {
    input: path.basename(args.input),
    page: args.page,
    pageIndex,
    pageSize: { width: pageWidth, height: pageHeight },
    rotation,
    counts: {
      nativeWidget: nativeWidgetCandidates.length,
      pdfjsLayoutCombs: combs.length,
      pdfjsLayoutCheckboxes: checkboxes.length,
      pdfjsLayoutTotal: pdfjsLayoutCandidates.length,
      textItems: textItems.length,
      rtlTextItems: rtlItemCount,
      suspectedReversedRtlTextItems: suspectedReversedCount,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `${path.basename(args.input)} page ${args.page}: `
    + `native-widget=${nativeWidgetCandidates.length} `
    + `pdfjs-layout(combs=${combs.length}, checkboxes=${checkboxes.length}) `
    + `text-items=${textItems.length} (rtl=${rtlItemCount}, suspected-reversed=${suspectedReversedCount})`,
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
