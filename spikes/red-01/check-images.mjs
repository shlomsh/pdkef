// RED-01 spike checker: a pixel-level probe for raster-image redaction.
//
// The text-based check-extractable.mjs proves nothing about image content:
// it only checks a caption string. This script walks each page's operator
// list with pdfjs-dist (legacy, node build), finds every image XObject
// actually painted (OPS.paintImageXObject), decodes its pixel data via
// page.objs, and counts pixels matching a corpus entry's imageSecretColor /
// imageKeepColor exactly. On the original corpus both counts must be > 0;
// after a true redaction of the box, secretColorPixelsRemaining should drop
// to 0 while keepColorPixelsRemaining survives (for the "partial" fixture).
//
// Usage:
//   node check-images.mjs <dir> <corpus.json>
//
// <dir> is the directory containing the PDFs named by corpus.json's `file`
// entries (normally the same corpus/ directory, but also lets this be run
// against a directory of already-redacted output PDFs with the same names).
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function getPaintedImages(pdfBytes, pageNumber) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const opList = await page.getOperatorList();

  const objIds = new Set();
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === pdfjs.OPS.paintImageXObject) {
      objIds.add(opList.argsArray[i][0]);
    }
  }

  const images = [];
  for (const objId of objIds) {
    // Image data may not be registered synchronously; page.objs.get() takes
    // a callback and resolves once the image is decoded (it always is, by
    // the time getOperatorList() has returned, for these small fixtures).
    const imgData = await new Promise((resolve, reject) => {
      try {
        page.objs.get(objId, resolve);
      } catch (err) {
        reject(err);
      }
    });
    images.push(imgData);
  }
  return images;
}

/** Bytes-per-pixel for the pixel formats pdf.js hands back from page.objs. */
function bytesPerPixel(imgData) {
  return imgData.data.length / (imgData.width * imgData.height);
}

function countColorPixels(imgData, [r, g, b]) {
  const bpp = bytesPerPixel(imgData);
  if (!Number.isFinite(bpp) || bpp < 3) return 0;
  let count = 0;
  const { data } = imgData;
  for (let i = 0; i + 2 < data.length; i += bpp) {
    if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++;
  }
  return count;
}

async function checkOne(pdfPath, entry) {
  const bytes = fs.readFileSync(pdfPath);
  const images = await getPaintedImages(bytes, entry.page);
  let secretColorPixelsRemaining = 0;
  let keepColorPixelsRemaining = 0;
  for (const img of images) {
    secretColorPixelsRemaining += countColorPixels(img, entry.imageSecretColor);
    keepColorPixelsRemaining += countColorPixels(img, entry.imageKeepColor);
  }
  return {
    file: entry.file,
    feature: entry.feature,
    imageCount: images.length,
    secretColorPixelsRemaining,
    keepColorPixelsRemaining,
  };
}

function printTable(rows) {
  const cols = ['file', 'imageCount', 'secretColorPixelsRemaining', 'keepColorPixelsRemaining'];
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) {
    console.log(line(cols.map((c) => r[c])));
  }
}

async function main() {
  const [, , dirArg, corpusJsonPath] = process.argv;
  if (!dirArg || !corpusJsonPath) {
    console.error('Usage: node check-images.mjs <dir> <corpus.json>');
    process.exit(2);
  }
  const corpus = JSON.parse(fs.readFileSync(corpusJsonPath, 'utf8'));
  const entries = corpus.filter((e) => e.imageSecretColor && e.imageKeepColor);
  if (entries.length === 0) {
    console.error('No corpus entries with imageSecretColor/imageKeepColor found.');
    process.exit(1);
  }

  const rows = [];
  for (const entry of entries) {
    const pdfPath = path.join(dirArg, entry.file);
    if (!fs.existsSync(pdfPath)) {
      console.error(`Skipping ${entry.file}: not found in ${dirArg}`);
      continue;
    }
    rows.push(await checkOne(pdfPath, entry));
  }
  printTable(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
