// RED-01 spike: measures the Delete tool's content-stream parser
// (`extractPageObjects` + `deleteObjectsFromPdf`) used as a whole-object
// redaction engine, instead of its designed job (deleting one clicked
// object). For each corpus entry, every object whose bbox intersects the
// entry's rect is deleted; the result is checked with check-extractable.mjs.
//
// Usage: node spikes/red-01/engine-ours.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import { extractPageObjects } from '../../src/editor/adapters/pdf/pdfObjects.js';
import { deleteObjectsFromPdf } from '../../src/editor/adapters/pdf/deleteObjects.js';
import { createPageGeometry, visiblePageBox, pagePercentToPdfPoint } from '../../src/editor/geometry/coords.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus');
const CORPUS_JSON = path.join(CORPUS_DIR, 'corpus.json');
const OUT_DIR = path.join(__dirname, 'out', 'ours');
const RESULTS_MD = path.join(__dirname, 'results-ours.md');
const CHECKER = path.join(__dirname, 'check-extractable.mjs');

fs.mkdirSync(OUT_DIR, { recursive: true });

// pdf-lib exposes CropBox/MediaBox/Rotate on the page but not /UserUnit;
// read it the same way src/editor/adapters/pdf/sign.js's pageUserUnit does.
function pageUserUnit(page) {
  try {
    const value = page.node.getInheritableAttribute(PDFName.of('UserUnit'));
    const number = page.doc.context.lookupMaybe(value, PDFNumber)?.asNumber();
    return Number.isFinite(number) && number > 0 ? number : 1;
  } catch {
    return 1;
  }
}

// Same geometry the editor builds for a pdf-lib page (see sign.js's
// pageGeometryFromPdfLibPage): CropBox clipped to MediaBox, rotation, /UserUnit.
function pageGeometryFromPdfLibPage(page) {
  return createPageGeometry({
    cropBox: visiblePageBox(page.getMediaBox(), page.getCropBox()),
    rotation: page.getRotation().angle,
    userUnit: pageUserUnit(page),
  });
}

/** Corpus rect (top-left-origin %, viewport/rendered space) -> a PDF-space
 * axis-aligned box in the same raw content-stream space extractPageObjects
 * reports bboxes in (i.e. before /Rotate is applied for display). */
function rectPercentToPdfBox(rectPct, geometry) {
  const [leftPct, topPct, widthPct, heightPct] = rectPct;
  const a = pagePercentToPdfPoint({ x: leftPct, y: topPct }, geometry);
  const b = pagePercentToPdfPoint({ x: leftPct + widthPct, y: topPct + heightPct }, geometry);
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
  };
}

function intersects(bbox, box) {
  return bbox.x < box.maxX && bbox.x + bbox.width > box.minX && bbox.y < box.maxY && bbox.y + bbox.height > box.minY;
}

/** Counts how many times `needle` appears in the page's own reading-order text
 * (pdfjs getTextContent, same as check-extractable.mjs), so a "still
 * extractable" result can be told apart from a redaction miss: the same
 * string can legitimately recur elsewhere on the page. */
async function countOccurrences(bytes, pageNumber, needle) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((it) => it.str).join('');
  return text.split(needle).length - 1;
}

async function redactEntry(entry) {
  const srcPath = path.join(CORPUS_DIR, entry.file);
  const bytes = fs.readFileSync(srcPath);
  const occurrencesBefore = await countOccurrences(bytes, entry.page, entry.secret);
  const doc = await PDFDocument.load(bytes);
  const pageIndex = entry.page - 1;
  const page = doc.getPage(pageIndex);
  const geometry = pageGeometryFromPdfLibPage(page);
  const box = rectPercentToPdfBox(entry.rect, geometry);

  const { objects } = extractPageObjects(page, pageIndex);
  const hit = objects.filter((o) => intersects(o.bbox, box));

  const notes = [];
  if (hit.length === 0) notes.push('no objects intersected the rect');
  const kinds = new Set(hit.map((o) => o.kind));
  if (kinds.has('text')) {
    const wholeLineRemoved = hit.some((o) => o.preview && o.preview.length > entry.secret.length + 10);
    if (wholeLineRemoved) notes.push('whole BT..ET run removed (more than the secret alone)');
  }
  if (hit.length > 0 && occurrencesBefore > 1) {
    notes.push(`secret text recurs ${occurrencesBefore}x on the page; only the targeted occurrence was removed`);
  }

  const deletions = hit.map((o) => ({ pageIndex: o.pageIndex, start: o.start, end: o.end }));
  const outBlob = deletions.length
    ? await deleteObjectsFromPdf(bytes, deletions)
    : new Blob([bytes], { type: 'application/pdf' });
  const outBytes = new Uint8Array(await outBlob.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, entry.file), outBytes);

  return { objectsRemoved: hit.length, kinds: [...kinds], notes };
}

async function makeStressDoc() {
  const { PDFDocument: Doc, StandardFonts, rgb } = await import('@cantoo/pdf-lib');
  const doc = await Doc.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 77; p += 1) {
    const page = doc.addPage([612, 792]);
    for (let line = 0; line < 20; line += 1) {
      page.drawText(`Line ${line} on page ${p}: the quick brown fox jumps over the lazy dog.`, {
        x: 40,
        y: 750 - line * 30,
        size: 10,
        font,
      });
    }
    page.drawRectangle({ x: 40, y: 700, width: 200, height: 20, color: rgb(1, 0.9, 0.6) });
  }
  return new Uint8Array(await doc.save());
}

async function timeStress() {
  const bytes = await makeStressDoc();
  const start = performance.now();
  const doc = await PDFDocument.load(bytes);
  const deletions = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    const page = doc.getPage(i);
    const { objects } = extractPageObjects(page, i);
    // Redact the one box-covered region per page: everything overlapping the
    // first text line's vertical band, same "whole object" selection as above.
    const target = objects.find((o) => o.kind === 'text');
    if (target) deletions.push({ pageIndex: i, start: target.start, end: target.end });
  }
  await deleteObjectsFromPdf(bytes, deletions);
  const ms = performance.now() - start;
  return { pages: doc.getPageCount(), ms };
}

async function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS_JSON, 'utf8'));
  const rows = [];
  for (const entry of corpus) {
    const srcPath = path.join(CORPUS_DIR, entry.file);
    if (!fs.existsSync(srcPath)) {
      rows.push({ file: entry.file, feature: entry.feature, objectsRemoved: 'SKIP (no file)', kinds: [], notes: ['fixture missing'] });
      continue;
    }
    try {
      const result = await redactEntry(entry);
      rows.push({ file: entry.file, feature: entry.feature, ...result });
    } catch (err) {
      rows.push({ file: entry.file, feature: entry.feature, objectsRemoved: 'ERROR', kinds: [], notes: [String(err && err.message || err)] });
    }
  }

  console.log('Redaction pass complete. Running checker over out/ours...\n');
  let checkerOutput = '';
  try {
    checkerOutput = execFileSync('node', [CHECKER, OUT_DIR, CORPUS_JSON], { encoding: 'utf8' });
  } catch (err) {
    checkerOutput = (err.stdout || '') + (err.stderr || '') + `\n(checker exited ${err.status})`;
  }
  console.log(checkerOutput);

  const timing = await timeStress();
  console.log(`\n77-page stress doc: ${timing.pages} pages, ${timing.ms.toFixed(1)}ms total (extract+delete, one object/page).`);

  writeResultsMd(rows, checkerOutput, timing);
}

function parseCheckerTable(output) {
  const lines = output.split('\n').filter((l) => l.includes('  '));
  const map = new Map();
  for (const line of lines) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length === 4 && parts[0].endsWith('.pdf')) {
      map.set(parts[0], { secretExtractable: parts[1], secretInAnnotations: parts[2], keepTextExtractable: parts[3] });
    }
  }
  return map;
}

function writeResultsMd(rows, checkerOutput, timing) {
  const checked = parseCheckerTable(checkerOutput);
  const lines = [];
  lines.push('# RED-01: Delete parser as a whole-object redaction engine');
  lines.push('');
  lines.push('Measures `extractPageObjects` + `deleteObjectsFromPdf` (the Delete tool\'s content-stream');
  lines.push('parser) used as a redaction engine: every object whose bbox intersects the corpus rect is');
  lines.push('deleted, whole-object (no glyph-level or partial-run removal).');
  lines.push('');
  lines.push('| file | feature | objects removed | secret still extractable | keepText still extractable | notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const check = checked.get(row.file);
    const secret = check ? check.secretExtractable : 'n/a';
    const keep = check ? check.keepTextExtractable : 'n/a';
    lines.push(
      `| ${row.file} | ${row.feature} | ${row.objectsRemoved}${row.kinds && row.kinds.length ? ` (${row.kinds.join(', ')})` : ''} | ${secret} | ${keep} | ${(row.notes || []).join('; ') || '-'} |`,
    );
  }
  lines.push('');
  lines.push(`77-page stress doc (20 text lines + 1 box per page): **${timing.ms.toFixed(1)}ms** total for extract+delete across ${timing.pages} pages, one object removed per page.`);
  lines.push('');
  lines.push('Raw checker output:');
  lines.push('```');
  lines.push(checkerOutput.trim());
  lines.push('```');
  fs.writeFileSync(RESULTS_MD, lines.join('\n') + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
