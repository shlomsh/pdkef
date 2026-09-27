// Generates a 77-page doc, 20 lines/page, with one redaction box per page
// (covering one line's secret), for timing the PDFium engine's per-page
// redaction cost. Uses the repo root's @cantoo/pdf-lib (already installed
// there; not added to this spike's own package.json).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const entries = [];
  for (let p = 0; p < 77; p++) {
    const page = doc.addPage([400, 500]);
    const secretLineIndex = 10; // line to redact, mid-page
    let secretRect = null;
    for (let line = 0; line < 20; line++) {
      const y = 480 - line * 22;
      const isSecret = line === secretLineIndex;
      const text = isSecret ? `SECRET-P${p}-L${line}-XYZ` : `line ${line} on page ${p} stays`;
      page.drawText(text, { x: 20, y, size: 11, font, color: rgb(0, 0, 0) });
      if (isSecret) {
        const w = font.widthOfTextAtSize(text, 11);
        secretRect = { x: 20, y, w, text };
      }
    }
    entries.push({ page: p, secretRect });
  }
  const bytes = await doc.save();
  const outPath = path.join(__dirname, 'perf-77page.pdf');
  fs.writeFileSync(outPath, bytes);
  fs.writeFileSync(path.join(__dirname, 'perf-77page-entries.json'), JSON.stringify(entries, null, 2));
  console.log('wrote', outPath, bytes.length, 'bytes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
