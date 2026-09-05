#!/usr/bin/env node
/**
 * Builds the geometry-only fixtures the form-grid detector is tested against.
 *
 * ## Why these are reduced rather than the official PDFs
 *
 * MOBI-03 says to check each evidence form's redistribution terms rather than
 * assuming a published government form may be republished. Neither source PDF
 * carries a licence, a rights statement, or a reuse grant of any kind - the
 * only metadata in the income tax form is `Adobe Illustrator 29.6 (Windows)`.
 * Israeli state works are copyright of the State under the Copyright Act
 * 5768-2007 s.42 and there is no blanket open-data grant covering ministry
 * forms, so committing either file whole into a public MIT repository is not
 * something this repo can establish a right to do.
 *
 * What the detector actually consumes is the page's *path* geometry, and that
 * is what these fixtures keep. Every construction and painting operator is
 * copied through byte for byte, inside its original `q`/`Q`/`cm` nesting -
 * which is the part that matters, since income tax form 101 issues 370 `cm`
 * operators on page 1 and a walk that ignores them recovers none of its combs.
 * Everything expressive is dropped: no `BT`/`ET` text, no fonts, no XObjects,
 * no emblem, no colours drawn from the page's resources. The result is a page
 * of unlabelled rules and ticks that yields byte-identical detector output and
 * republishes none of the form's content.
 *
 * ## Regenerating
 *
 *   node scripts/generate-form-grid-fixtures.mjs \
 *     --itc101 "~/Downloads/Service_Pages_Income_tax_annual-report-2024_itc101.pdf" \
 *     --health "~/Downloads/services_health-declaration-2021.pdf"
 *
 * The sources are blank official templates downloaded from the publishing
 * agency. Never point this at a filled-in copy: a completed form carries
 * someone's identity number.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFNumber } from '@cantoo/pdf-lib';
import { getPageContentBytes } from '../src/editor/adapters/pdf/pdfObjects.js';
import { tokenize } from '../src/editor/adapters/pdf/contentStream.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(here, '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__');

/**
 * Operators kept verbatim: graphics state that positions a path, the path
 * construction operators, and the painting operators that decide whether a
 * path is ink. Anything that reaches into `/Resources` (`gs`, `cs`, `scn`,
 * `Do`, `Tf`) is dropped along with the resource dictionary itself, so the
 * fixture has no external references to resolve.
 */
const KEPT_OPERATORS = new Set([
  'q', 'Q', 'cm',
  'm', 'l', 'c', 'v', 'y', 'h', 're',
  'W', 'W*',
  'n', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*',
  'w', 'J', 'j', 'M', 'd',
  'g', 'G', 'rg', 'RG', 'k', 'K',
]);

/** Strips a page's stream down to its path geometry, preserving byte-level operand text. */
function geometryOnlyStream(bytes) {
  const tokens = tokenize(bytes);
  const chunks = [];
  let operands = [];
  let insideText = false;

  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }
    if (token.value === 'BT') {
      insideText = true;
      operands = [];
      continue;
    }
    if (token.value === 'ET') {
      insideText = false;
      operands = [];
      continue;
    }
    if (!insideText && KEPT_OPERATORS.has(token.value)) {
      const start = operands.length > 0 ? operands[0].start : token.start;
      chunks.push(bytes.subarray(start, token.end));
    }
    operands = [];
  }

  const text = chunks.map((chunk) => Buffer.from(chunk).toString('latin1')).join('\n');
  return new Uint8Array(Buffer.from(`${text}\n`, 'latin1'));
}

async function buildFixture(sourcePath, pageIndex, destinationPath) {
  const source = await PDFDocument.load(fs.readFileSync(sourcePath), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const sourcePage = source.getPage(pageIndex);
  const stream = geometryOnlyStream(getPageContentBytes(sourcePage));
  const { width, height } = sourcePage.getSize();

  const output = await PDFDocument.create();
  const page = output.addPage([width, height]);
  // An empty `/Resources` is deliberate: nothing in the reduced stream names a
  // font, an ExtGState or an XObject, so there is nothing left to reference.
  page.node.set(PDFName.of('Resources'), output.context.obj({}));
  const dict = PDFDict.withContext(output.context);
  dict.set(PDFName.of('Length'), PDFNumber.of(stream.length));
  page.node.set(
    PDFName.of('Contents'),
    output.context.register(PDFRawStream.of(dict, stream)),
  );

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, await output.save({ useObjectStreams: false }));
  return { width, height, bytes: stream.length };
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing --${name} <path to the blank source form>`);
  }
  return process.argv[index + 1].replace(/^~/, process.env.HOME || '~');
}

const targets = [
  { flag: 'itc101', pageIndex: 0, file: 'income-tax-101-page1-geometry.pdf' },
  { flag: 'health', pageIndex: 0, file: 'health-declaration-page1-geometry.pdf' },
];

for (const target of targets) {
  const destination = path.join(outputDirectory, target.file);
  const result = await buildFixture(argument(target.flag), target.pageIndex, destination);
  console.log(`${target.file}: ${result.bytes} bytes of geometry, ${result.width}x${result.height}pt`);
}
