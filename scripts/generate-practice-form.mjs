import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PDFDocument, StandardFonts, rgb,
  rectangle, fillAndStroke, setFillingRgbColor, setStrokingRgbColor, setLineWidth,
} from '@cantoo/pdf-lib';
import {
  PAGE_SIZE, DOCUMENT_META, PALETTE_TOKENS, HEADER, SECTIONS, DECLARATION_TEXT, FOOTER,
  FIELDS, fieldLayout,
} from './practice-form-content.mjs';

/**
 * Renders the app's own practice form (SNG-10 v2) from `practice-form-content.mjs`'s layout, and
 * derives its scored-corpus ground truth from that same layout - one source, two outputs, so they
 * can never drift apart. `buildPracticeForm()` has no side effects; this module only writes files
 * when run directly (`node scripts/generate-practice-form.mjs`, or `npm run generate:practice-form`).
 *
 * v2 is flat: no `/AcroForm`, no widgets. Every box, comb cell and checkbox is drawn with the raw
 * `re` path-construction operator (`rectangle()` + `fillAndStroke()`), never `@cantoo/pdf-lib`'s
 * own `page.drawRectangle()` - that method builds every rectangle as an SVG path (`m`/`l`/`h`) and
 * never emits `re` at all (see `src/tools/sign/fields/corpus/README.md`, "pdf-lib never emits the
 * re operator"). `findCheckboxes` (`src/tools/sign/fields/formGrid.js`) reads only `ink.rects`,
 * which only a real `re` populates, so a path-drawn checkbox would be invisible to it - not a
 * hypothetical, the corpus's own "known gap" row pins exactly that limitation. Drawing every
 * rectangle with `re` is also simply what a real form producer's own rectangles look like on the
 * wire (the corpus's `paintedRect` spec kind exists for the same reason).
 *
 * Output is byte-deterministic: a fixed `CreationDate`/`ModificationDate` and `Producer`/`Creator`
 * are set explicitly after `PDFDocument.create()` (which otherwise stamps the wall-clock time), and
 * `pdf.save()` is called with `updateFieldAppearances: false` - the default `true` would call
 * `getOrCreateForm()` internally and silently add an empty `/AcroForm` to the catalog even though
 * this document never creates a field, which is exactly the thing v2 exists to not have.
 *
 * SNG-10 v2's brand pass (2026-09-25): colour is never a literal here. `practice-form-content.mjs`'s
 * `PALETTE_TOKENS` names which `src/styles/global.css` `:root` custom property each drawing role
 * uses; `readColorTokens()`/`resolvePalette()` below read that file at generation time and resolve
 * those names to real `#rrggbb` hex, failing loudly if a token is missing or is anything other than
 * a literal hex colour (a `var()`/`rgba()`/`color-mix()` value this generator cannot evaluate). The
 * header also embeds the app's own logo - `practice-form-logo.png`, a 96x96 derivative of
 * `src/assets/logo.png` committed next to this script (that 512x512 master would bloat the PDF for
 * a mark drawn at ~20pt). It was made once, by hand, with macOS's built-in `sips`:
 * `sips -Z 96 src/assets/logo.png --out scripts/practice-form-logo.png`. Re-run that if the logo
 * itself ever changes; there is no build step that regenerates it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PDF = path.resolve(here, '../public/images/redaction-guide/sample.pdf');
const OUTPUT_PREVIEW = path.resolve(here, '../public/images/redaction-guide/sample-preview.jpg');
const OUTPUT_TRUTH = path.resolve(
  here, '../src/tools/sign/fields/corpus/scoring/ground-truth/practice-form-page1.json',
);
const GLOBAL_CSS_PATH = path.resolve(here, '../src/styles/global.css');
const LOGO_PATH = path.resolve(here, './practice-form-logo.png');

/** Fixed so two builds, run on different days, hash identically. */
const FIXED_DATE = new Date('2026-09-25T00:00:00Z');
const PRODUCER = 'PDkef practice form generator';

/**
 * Reads every requested `--custom-property` out of `cssText`'s first top-level `:root { ... }`
 * block. Strict on purpose: throws if there is no `:root` block, or if a requested token is absent
 * or is not a literal `#rrggbb` hex colour, rather than silently drawing the wrong ink. Pure (no
 * filesystem access) so it can be unit-tested against a fabricated stylesheet.
 */
export function readColorTokens(cssText, tokenNames) {
  const rootMatch = cssText.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!rootMatch) {
    throw new Error("practice-form palette: no top-level ':root { ... }' block found in global.css");
  }
  const rootBody = rootMatch[1];
  const resolved = {};
  for (const tokenName of tokenNames) {
    const tokenPattern = new RegExp(`${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
    const match = rootBody.match(tokenPattern);
    if (!match) {
      throw new Error(
        `practice-form palette: ${tokenName} is missing from global.css's :root, or is not a `
        + 'literal #rrggbb hex colour (var()/rgba()/color-mix() cannot be resolved here)',
      );
    }
    resolved[tokenName] = match[1].toLowerCase();
  }
  return resolved;
}

/** `#rrggbb` to an `[r, g, b]` triple in the 0-1 range `rgb()` (`@cantoo/pdf-lib`) expects. */
function hexToRgb01(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** Resolves every `PALETTE_TOKENS` role to a drawable `[r, g, b]` triple from a global.css source. */
export function resolvePalette(cssText) {
  const hexByToken = readColorTokens(cssText, Object.values(PALETTE_TOKENS));
  return Object.fromEntries(
    Object.entries(PALETTE_TOKENS).map(([role, tokenName]) => [role, hexToRgb01(hexByToken[tokenName])]),
  );
}

const PALETTE = resolvePalette(fs.readFileSync(GLOBAL_CSS_PATH, 'utf8'));

const colorOf = (key) => rgb(...PALETTE[key]);
const round4 = (value) => +value.toFixed(4);

/** A top-down rect (`y` measured from the page's own top edge) to pdf-lib's bottom-left convention. */
function bottomUp(pageHeight, rect) {
  return {
    x: rect.x, y: pageHeight - rect.y - rect.height, width: rect.width, height: rect.height,
  };
}

/**
 * Draws a filled and stroked rectangle with the raw `re` operator. See the module doc comment for
 * why this, and not `page.drawRectangle()`, is what every field box, comb cell and checkbox in this
 * form uses.
 */
function drawInkRect(page, {
  x, y, width, height, fillColor, borderColor, borderWidth = 0.8,
}) {
  page.pushOperators(
    setLineWidth(borderWidth),
    setStrokingRgbColor(...borderColor),
    setFillingRgbColor(...fillColor),
    rectangle(x, y, width, height),
    fillAndStroke(),
  );
}

/** Manual letter-spacing (pdf-lib's `drawText` has none): each glyph placed by its own measured
 * width plus a fixed tracking gap, centered on the page. */
function drawLetterSpacedCentered(page, text, {
  y, font, size, color, tracking, pageWidth,
}) {
  const chars = [...text];
  const widths = chars.map((char) => font.widthOfTextAtSize(char, size));
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + tracking * (chars.length - 1);
  let x = (pageWidth - totalWidth) / 2;
  chars.forEach((char, index) => {
    page.drawText(char, {
      x, y, size, font, color,
    });
    x += widths[index] + tracking;
  });
}

/** The brand row's logo square, in points - drawn at app-bar scale, not the 512x512 master's own
 * size (see the module doc comment for why `practice-form-logo.png` is a small derivative). */
const HEADER_LOGO_SIZE = 20;
/** Distance from the page's own top edge to the top of the logo/wordmark row. */
const HEADER_TOP = 28;

function drawHeader(page, pageHeight, font, bold, logoImage) {
  const logoY = pageHeight - HEADER_TOP - HEADER_LOGO_SIZE;
  page.drawImage(logoImage, {
    x: 48, y: logoY, width: HEADER_LOGO_SIZE, height: HEADER_LOGO_SIZE,
  });

  // Optically centered against the logo square rather than baseline-aligned to its bottom edge.
  const wordmarkSize = 13;
  const wordmarkY = logoY + (HEADER_LOGO_SIZE - wordmarkSize) / 2 + 2;
  const wordmarkX = 48 + HEADER_LOGO_SIZE + 8;
  page.drawText(HEADER.wordmark, {
    x: wordmarkX, y: wordmarkY, size: wordmarkSize, font: bold, color: colorOf('ink'),
  });

  const taglineSize = 9.5;
  const taglineX = wordmarkX + bold.widthOfTextAtSize(HEADER.wordmark, wordmarkSize) + 9;
  page.drawText(HEADER.tagline, {
    x: taglineX, y: wordmarkY, size: taglineSize, font, color: colorOf('muted'),
  });

  drawLetterSpacedCentered(page, HEADER.title, {
    y: pageHeight - 70, font: bold, size: 13, color: colorOf('ink'), tracking: 1.6, pageWidth: PAGE_SIZE[0],
  });
}

function drawSections(page, pageHeight, bold) {
  for (const section of SECTIONS) {
    page.drawText(section.heading, {
      x: 48, y: pageHeight - section.y, size: 11, font: bold, color: colorOf('ink'),
    });
  }
}

/** A field label, 9pt muted, its baseline 4pt above the field's own box (top-down). */
function drawFieldLabel(page, pageHeight, font, text, rect) {
  page.drawText(text, {
    x: rect.x, y: pageHeight - (rect.y - 4), size: 9, font, color: colorOf('muted'),
  });
}

/**
 * Comb cells are the one shape drawn with `page.drawRectangle()` (a path, not `re`) rather than
 * `drawInkRect`. `formGrid.js`'s comb reader calls `horizontalRules(ink)` with no
 * `includeRectSides` option, so a rect's own top/bottom never fold in as rules there (only
 * `formCells.js` opts into that) - a raw `re` cell would read as having no ruled top or bottom at
 * all, and `findRunsFromWalls`'s `requireCompactBoxes` pass drops any run that is not `boxed`. A
 * path-drawn rectangle has no such gap: each of its four sides is a real line segment, so it lands
 * directly in `ink.verticals`/`ink.horizontals` and reads as boxed either way. Measured, not assumed:
 * switching this one shape to `re` while proving out the rest of this form took comb recall from
 * 100% to 0%.
 */
function drawComb(page, box, cells) {
  const cellWidth = box.width / cells;
  for (let cell = 0; cell < cells; cell += 1) {
    page.drawRectangle({
      x: box.x + cell * cellWidth,
      y: box.y,
      width: cellWidth,
      height: box.height,
      color: colorOf('fieldFill'),
      borderColor: colorOf('stroke'),
      borderWidth: 0.8,
    });
  }
}

function drawCheckbox(page, font, box, label) {
  drawInkRect(page, {
    ...box, fillColor: PALETTE.fieldFill, borderColor: PALETTE.stroke, borderWidth: 0.8,
  });
  page.drawText(label, {
    x: box.x + box.width + 8, y: box.y + 2, size: 10.5, font, color: colorOf('ink'),
  });
}

/** A signature or date line: a single stroked rule, its caption directly below it, left-aligned
 * with the line's own start. No box - the rule and the caption are the whole field. */
function drawLineField(page, pageHeight, font, field) {
  const { line } = field;
  const y = pageHeight - line.y;
  page.drawLine({
    start: { x: line.x0, y }, end: { x: line.x1, y }, thickness: 0.8, color: colorOf('stroke'),
  });
  page.drawText(field.label, {
    x: line.x0, y: y - 13, size: 9, font, color: colorOf('muted'),
  });
}

function drawFields(page, pageHeight, font) {
  for (const field of FIELDS) {
    if (field.line) {
      drawLineField(page, pageHeight, font, field);
      continue;
    }
    const box = bottomUp(pageHeight, field.rect);
    if (field.kind === 'checkbox') {
      drawCheckbox(page, font, box, field.label);
      continue;
    }
    drawFieldLabel(page, pageHeight, font, field.label, field.rect);
    if (field.kind === 'comb') drawComb(page, box, field.cells);
    else {
      drawInkRect(page, {
        ...box, fillColor: PALETTE.fieldFill, borderColor: PALETTE.stroke, borderWidth: 0.8,
      });
    }
  }
}

function drawDeclaration(page, pageHeight, font) {
  const startY = pageHeight - 560;
  DECLARATION_TEXT.forEach((line, index) => {
    page.drawText(line, {
      x: 48, y: startY - index * 13, size: 9.5, font, color: colorOf('ink'),
    });
  });
}

function drawFooter(page, pageWidth, font) {
  const ruleY = 34;
  page.drawLine({
    start: { x: 48, y: ruleY }, end: { x: pageWidth - 48, y: ruleY }, thickness: 0.6, color: colorOf('rule'),
  });
  page.drawText(FOOTER.disclaimer, {
    x: 48, y: 19, size: 8.5, font, color: colorOf('muted'),
  });
  const pageNumberWidth = font.widthOfTextAtSize(FOOTER.pageNumber, 8.5);
  page.drawText(FOOTER.pageNumber, {
    x: pageWidth - 48 - pageNumberWidth, y: 19, size: 8.5, font, color: colorOf('muted'),
  });
}

/** Every field's own truth target, straight from the layout: the bounds are the field's own
 * defined rect (page fractions, top-down - the same convention `rect.y` already uses), exact by
 * construction rather than eyeballed. */
function buildTruth(pdfBytes, pageWidth, pageHeight) {
  const combCells = Object.fromEntries(FIELDS.filter((f) => f.kind === 'comb').map((f) => [f.id, f.cells]));
  const targets = fieldLayout().map(({
    id, kind, label, rect,
  }) => ({
    id,
    kind,
    bounds: {
      x: round4(rect.x / pageWidth),
      y: round4(rect.y / pageHeight),
      width: round4(rect.width / pageWidth),
      height: round4(rect.height / pageHeight),
    },
    label,
    notes: "from the form's own layout (scripts/practice-form-content.mjs): the field's own defined "
      + 'rect, exact by construction',
    ...(id in combCells ? { cells: combCells[id] } : {}),
  }));
  return {
    form: 'pdkef-practice-form',
    sha256: crypto.createHash('sha256').update(pdfBytes).digest('hex'),
    sourceUrl: 'in-repo: public/images/redaction-guide/sample.pdf',
    pageIndex: 0,
    pageSize: { width: pageWidth, height: pageHeight },
    render: null,
    notes: 'v2, a flat vector form: no AcroForm, no widgets. Every target comes straight from the '
      + "form's own layout (scripts/practice-form-content.mjs) rather than an eyeballed annotation - "
      + "the bounds are the field's own defined rect, exact by construction, and a line field's "
      + '(signature, the date beside it) is the writing area above its drawn line, per '
      + "lineWritableRect's own convention. Generated by scripts/generate-practice-form.mjs; "
      + 'regenerate rather than hand-edit.',
    targets,
  };
}

/** Builds the practice form and its ground truth. No side effects - see the module doc comment. */
export async function buildPracticeForm() {
  const [pageWidth, pageHeight] = PAGE_SIZE;
  const pdf = await PDFDocument.create();
  pdf.setTitle(DOCUMENT_META.title);
  pdf.setAuthor(DOCUMENT_META.author);
  pdf.setSubject(DOCUMENT_META.subject);
  pdf.setKeywords(DOCUMENT_META.keywords);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await pdf.embedPng(fs.readFileSync(LOGO_PATH));
  const page = pdf.addPage(PAGE_SIZE);

  drawHeader(page, pageHeight, font, bold, logoImage);
  drawSections(page, pageHeight, bold);
  drawFields(page, pageHeight, font);
  drawDeclaration(page, pageHeight, font);
  drawFooter(page, pageWidth, font);

  // updateFieldAppearances: false - see the module doc comment. This document never creates a
  // form field, and the default would silently give it an empty /AcroForm anyway.
  const pdfBytes = await pdf.save({ updateFieldAppearances: false });
  const truth = buildTruth(pdfBytes, pageWidth, pageHeight);
  return { pdfBytes, truth };
}

/**
 * Renders `sample-preview.jpg`, the static first-page thumbnail `SAMPLE_PREVIEW_SRC`
 * (`src/site-lib/sampleDocument.ts`) shows in the empty recent-documents slot before any real
 * draft preview exists (`RecentFiles.tsx`'s `.preview` box, `width="64" height="84"`,
 * `object-fit: cover`). That box crops to its own portrait shape regardless of the source image's
 * pixel size, so nothing here needs to match it exactly - only decode to a real, undistorted crop
 * of the page's own top.
 *
 * There is no `canvas` package in this repo to rasterise a PDF page in plain Node, and shelling out
 * to `pdftoppm` would add an undeclared system dependency this generator has never needed. What the
 * repo already has is `@playwright/test` (every e2e spec runs on it) and `pdfjs-dist` (a runtime
 * dependency, the same renderer every tool page uses) - so this drives real pdf.js, in a real
 * Chromium tab, the same rendering path the product itself uses, and lets Chromium's own JPEG
 * encoder do the format conversion (`locator.screenshot({ type: 'jpeg' })`), no extra dependency
 * either way. A throwaway static server hands the tab pdf.js's own build and the freshly-built PDF
 * bytes, since a `file://` navigation to a PDF makes Chromium download it rather than render it, and
 * an ES module import needs a real origin to resolve against.
 *
 * `PREVIEW_TARGET_WIDTH` (168px, so ~238px tall at this page's A4 ratio) was picked by measuring
 * against the old landscape thumbnail's 5636 bytes at quality 80: close enough in size to not move
 * `test:weight`'s budget, sharp enough for the box's retina range. Re-run `npm run
 * generate:practice-form` to regenerate both the PDF and this thumbnail together whenever the form's
 * layout changes; there is no separate command to remember.
 */
const PREVIEW_TARGET_WIDTH = 168;

async function renderPreviewJpeg(pdfBytes) {
  const { chromium } = await import('@playwright/test');
  const pdfjsDir = path.resolve(here, '../node_modules/pdfjs-dist/build');
  const mimeTypes = { '.mjs': 'text/javascript', '.pdf': 'application/pdf', '.html': 'text/html' };
  // A bare `<canvas>` plus a module script: the script is what does the rendering, once the tab has
  // navigated here and can resolve the absolute `/pdfjs/...` imports below against a real origin
  // (an ES module import cannot resolve against `about:blank`, which `page.setContent()` stays on).
  const html = `<!doctype html><canvas id="preview"></canvas><script type="module">
    const pdfjsLib = await import('/pdfjs/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    // getDocument() takes a same-origin fetch's bytes rather than the '/sample.pdf' URL directly:
    // passed as a bare string it is read as a *document id*, not a location, and pdf.js rejects it
    // for carrying none of \`data\`/\`range\`/\`url\`.
    const pdfResponse = await fetch('/sample.pdf');
    const doc = await pdfjsLib.getDocument({ data: await pdfResponse.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: ${PREVIEW_TARGET_WIDTH} / baseViewport.width });
    const canvas = document.getElementById('preview');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    window.__rendered = true;
  </script>`;

  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
      res.end(html);
      return;
    }
    if (req.url === '/sample.pdf') {
      res.writeHead(200, { 'Content-Type': mimeTypes['.pdf'] });
      res.end(pdfBytes);
      return;
    }
    if (req.url.startsWith('/pdfjs/')) {
      const filePath = path.join(pdfjsDir, req.url.slice('/pdfjs/'.length));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => window.__rendered === true);
    return await page.locator('#preview').screenshot({ type: 'jpeg', quality: 80 });
  } finally {
    await browser.close();
    server.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { pdfBytes, truth } = await buildPracticeForm();
  fs.writeFileSync(OUTPUT_PDF, pdfBytes);
  fs.writeFileSync(OUTPUT_TRUTH, `${JSON.stringify(truth, null, 1)}\n`);
  console.log(`Wrote ${OUTPUT_PDF}`);
  console.log(`Wrote ${OUTPUT_TRUTH}`);
  const previewBytes = await renderPreviewJpeg(pdfBytes);
  fs.writeFileSync(OUTPUT_PREVIEW, previewBytes);
  console.log(`Wrote ${OUTPUT_PREVIEW}`);
}
