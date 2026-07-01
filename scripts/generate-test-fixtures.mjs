import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../src/lib/__fixtures__');

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// Helper to generate a single-page PDF with a specific digit
async function generateSinglePagePdf(digit) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([200, 200]);
  const { width, height } = page.getSize();
  const text = String(digit);
  const fontSize = 48;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);
  
  page.drawText(text, {
    x: width / 2 - textWidth / 2,
    y: height / 2 - textHeight / 2 + 5, // slightly adjust for baseline
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  return await doc.save();
}

// Helper to generate the 5-page PDF with digits "11", "12", "13", "14", "15"
async function generateFivePagePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const texts = ['11', '12', '13', '14', '15'];

  for (const text of texts) {
    const page = doc.addPage([200, 200]);
    const { width, height } = page.getSize();
    const fontSize = 48;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2 - textHeight / 2 + 5,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  return await doc.save();
}

async function verifyPdf(filePath, expectedPages, expectedTexts) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  // In Node.js, we don't need a worker for basic parsing if we read the data directly,
  // but to avoid pdf.js complaining or blocking, we set up workerSrc or run in-thread.
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  if (pdf.numPages !== expectedPages) {
    throw new Error(`Sanity check failed for ${path.basename(filePath)}: expected ${expectedPages} pages, got ${pdf.numPages}`);
  }

  for (let i = 1; i <= expectedPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const extractedText = textContent.items.map(item => item.str).join('').trim();
    const expected = expectedTexts[i - 1];

    if (extractedText !== expected) {
      throw new Error(`Sanity check failed for ${path.basename(filePath)} page ${i}: expected text "${expected}", got "${extractedText}"`);
    }
  }

  console.log(`✓ Verified ${path.basename(filePath)}: ${expectedPages} pages, correct text content.`);
  await loadingTask.destroy();
}

async function main() {
  console.log('Generating PDF fixtures...');

  const fixtures = [
    { name: 'num-1.pdf', bytes: await generateSinglePagePdf(1), pages: 1, texts: ['1'] },
    { name: 'num-2.pdf', bytes: await generateSinglePagePdf(2), pages: 1, texts: ['2'] },
    { name: 'num-3.pdf', bytes: await generateSinglePagePdf(3), pages: 1, texts: ['3'] },
    { name: 'num-4.pdf', bytes: await generateSinglePagePdf(4), pages: 1, texts: ['4'] },
    { name: 'num-5.pdf', bytes: await generateFivePagePdf(), pages: 5, texts: ['11', '12', '13', '14', '15'] },
  ];

  for (const fixture of fixtures) {
    const destPath = path.join(FIXTURES_DIR, fixture.name);
    fs.writeFileSync(destPath, fixture.bytes);
    console.log(`Saved ${fixture.name} (${(fixture.bytes.length / 1024).toFixed(2)} KB)`);
    
    // Run verification
    await verifyPdf(destPath, fixture.pages, fixture.texts);
  }

  console.log('All PDF fixtures generated and verified successfully!');
}

main().catch(err => {
  console.error('Error generating fixtures:', err);
  process.exit(1);
});
