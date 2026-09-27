// RED-01 spike checker: reports whether a corpus entry's `secret` is still
// extractable specifically UNDER the redaction box (not just somewhere on
// the page), and whether `keepText` survives page-wide - both from the
// page's content-stream text (pdfjs getTextContent) and from its
// annotations' /Contents (FreeText, form field widgets), since a FreeText
// annotation's text never appears in getTextContent().
//
// Position-awareness: pdf.js text items are converted to top-left-origin %
// rects using the same convention as make-corpus.mjs's
// itemPdfSpaceBBox()/pdfBBoxToPercent() (viewport transform, respecting
// page.rotate), so a secret word that legitimately recurs elsewhere on a
// real-world page (IRS/I-9/health-declaration forms) doesn't produce a false
// "still extractable" alarm - only text whose own box intersects the entry's
// redaction rect counts.
//
// Usage:
//   node check-extractable.mjs <pdf-path> <corpus.json-path> [file-name]
//
// With no [file-name], checks every entry in corpus.json whose `file` exists
// alongside it (the normal "run over the whole corpus" mode). With a
// [file-name], checks just that one entry. <pdf-path> is only used as the
// directory root when running over the whole corpus; for a single check you
// can pass the PDF's own path directly as <pdf-path> together with a
// corpus.json that contains a matching entry.
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Shrink the entry rect by this many percentage points on each side before
// intersecting, so a text item that merely touches the box's edge (a
// touching neighbour, not something actually under it) doesn't count.
const RECT_SHRINK_PCT = 0.2;

function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Axis-aligned bbox (in PDF user space) of a pdf.js text item's glyph box. */
function itemPdfSpaceBBox(item) {
  const [a, b, c, d, e, f] = item.transform;
  const abLen = Math.hypot(a, b) || 1;
  const cdLen = Math.hypot(c, d) || 1;
  const ux = a / abLen;
  const uy = b / abLen;
  const vx = c / cdLen;
  const vy = d / cdLen;
  const w = item.width;
  const h = item.height || cdLen || 1;
  const corner = (u, v) => ({ x: e + ux * u + vx * v, y: f + uy * u + vy * v });
  const corners = [corner(0, 0), corner(w, 0), corner(0, h), corner(w, h)];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** PDF-space bbox -> top-left-origin % of the rendered (post-rotation) page. */
function pdfBBoxToPercent(bbox, viewport) {
  const [a, b, c, d, e, f] = viewport.transform;
  const corners = [
    applyMatrix([a, b, c, d, e, f], bbox.minX, bbox.minY),
    applyMatrix([a, b, c, d, e, f], bbox.maxX, bbox.minY),
    applyMatrix([a, b, c, d, e, f], bbox.minX, bbox.maxY),
    applyMatrix([a, b, c, d, e, f], bbox.maxX, bbox.maxY),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(Math.min(...xs), 0, viewport.width);
  const top = clamp(Math.min(...ys), 0, viewport.height);
  const right = clamp(Math.max(...xs), 0, viewport.width);
  const bottom = clamp(Math.max(...ys), 0, viewport.height);
  return {
    left: (left / viewport.width) * 100,
    top: (top / viewport.height) * 100,
    width: ((right - left) / viewport.width) * 100,
    height: ((bottom - top) / viewport.height) * 100,
  };
}

function shrinkRect(rect, pct) {
  const [left, top, width, height] = rect;
  const w = Math.max(0, width - 2 * pct);
  const h = Math.max(0, height - 2 * pct);
  return { left: left + pct, top: top + pct, width: w, height: h };
}

function rectsIntersect(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

async function loadPage(pdfBytes, pageNumber) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  return pdf.getPage(pageNumber);
}

async function extractItemsWithBoxes(page) {
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  return content.items.map((it) => ({
    str: it.str,
    rect: pdfBBoxToPercent(itemPdfSpaceBBox(it), viewport),
  }));
}

async function extractAnnotationText(page) {
  const annotations = await page.getAnnotations({ intent: 'any' });
  return annotations
    .map((a) =>
      [a.contentsObj && a.contentsObj.str, a.fieldValue, a.buttonValue].filter((v) => typeof v === 'string').join(' '),
    )
    .join(' ');
}

function isPresent(haystack, needle) {
  if (!needle) return null;
  return haystack.includes(needle);
}

/**
 * Position-aware check: does the secret still read out from text whose own
 * box intersects the (shrunk) entry rect? Two ways in:
 *  - the concatenation of intersecting items, in item order, contains the
 *    secret outright (a secret split across adjacent runs but still fully
 *    inside the box), or
 *  - any single intersecting item's string is itself a substring (length
 *    >= 2) of the secret (a fragment of the secret sitting under the box,
 *    even if the box also catches unrelated neighbouring text).
 */
function checkSecretUnderBox(items, entryRect, secret) {
  if (!secret) return { secretUnderBox: null, offendingStrings: [] };
  const shrunk = shrinkRect(entryRect, RECT_SHRINK_PCT);
  const intersecting = items.filter((it) => rectsIntersect(it.rect, shrunk));
  const concatenated = intersecting.map((it) => it.str).join('');
  const offendingStrings = [];
  for (const it of intersecting) {
    if (it.str.length >= 2 && secret.includes(it.str)) {
      offendingStrings.push(it.str);
    }
  }
  const concatenatedMatch = concatenated.includes(secret);
  if (concatenatedMatch && offendingStrings.length === 0) {
    offendingStrings.push(concatenated);
  }
  return { secretUnderBox: concatenatedMatch || offendingStrings.length > 0, offendingStrings };
}

async function checkOne(pdfPath, entry) {
  const bytes = fs.readFileSync(pdfPath);
  const page = await loadPage(bytes, entry.page);
  const items = await extractItemsWithBoxes(page);
  const contentText = items.map((it) => it.str).join('');
  const annotationText = await extractAnnotationText(page);
  const combined = contentText + ' ' + annotationText;

  const { secretUnderBox, offendingStrings } = checkSecretUnderBox(items, entry.rect, entry.secret);

  return {
    file: entry.file,
    feature: entry.feature,
    secretUnderBox,
    secretAnywhere: isPresent(combined, entry.secret),
    keepTextIntact: isPresent(combined, entry.keepText),
    offendingStrings,
  };
}

function printTable(rows) {
  const cols = ['file', 'secretUnderBox', 'secretAnywhere', 'keepTextIntact'];
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) {
    console.log(line(cols.map((c) => r[c])));
    if (r.offendingStrings && r.offendingStrings.length > 0) {
      console.log(`    offending: ${JSON.stringify(r.offendingStrings)}`);
    }
  }
}

async function main() {
  const [, , pdfPathArg, corpusJsonPath, fileNameArg] = process.argv;
  if (!pdfPathArg || !corpusJsonPath) {
    console.error('Usage: node check-extractable.mjs <pdf-path-or-corpus-dir> <corpus.json> [file-name]');
    process.exit(2);
  }
  const corpus = JSON.parse(fs.readFileSync(corpusJsonPath, 'utf8'));

  if (fileNameArg) {
    const entry = corpus.find((e) => e.file === fileNameArg);
    if (!entry) throw new Error(`No corpus entry for ${fileNameArg}`);
    const result = await checkOne(pdfPathArg, entry);
    printTable([result]);
    return;
  }

  // Whole-corpus mode: pdfPathArg is the directory the PDFs live in.
  const dir = pdfPathArg;
  const rows = [];
  for (const entry of corpus) {
    const filePath = path.join(dir, entry.file);
    if (!fs.existsSync(filePath)) continue;
    rows.push(await checkOne(filePath, entry));
  }
  printTable(rows);

  const failures = rows.filter((r) => !r.secretUnderBox || !r.keepTextIntact);
  if (failures.length > 0) {
    console.log(`\n${failures.length} of ${rows.length} entries did NOT match the expected baseline (secret under box + keepText intact):`);
    for (const f of failures) console.log(` - ${f.file}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${rows.length} entries match the baseline: secret under box, keepText intact.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
