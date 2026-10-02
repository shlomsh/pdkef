// Test set behind the numbers in the Compress guide pages (COMP-01).
//
// Generates scan-1/2/5/10/20/40.pdf: N-page PDFs where every page is one full-page JPEG of the
// same synthetic phone-scanned form (about 410 KB per page), each page with its own seeded grain
// and lighting. Also copies typed-1.pdf (a text-only PDF) from the compress fixtures. Output is
// deterministic (seeded noise, no metadata dates), so scan-10.pdf is always 4,194,057 bytes.
// The measured results of running these through Target Size are recorded in
// backlog/tasks/COMP-01.md. The files are 0.4 to 16 MB and are never committed.
//
// Run: node scripts/generate-compress-guide-scans.mjs [outDir]
//      (default outDir: <os tmpdir>/compress-guide-scans)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PDFDocument } from '@cantoo/pdf-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'compress-guide-scans'));
fs.mkdirSync(OUT, { recursive: true });
const W = 1700, H = 2200;
const NOISE = Number(process.env.NOISE || 4.5); // grain sigma in 0-255 levels

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const fields = ['Full name','Date of birth','National ID number','Home address','City / Postal code','Telephone','Email address','Occupation','Employer','Position applied for','Place of birth','Date of application'];
const body1 = 'I declare that the information given in this application is true and complete to the best of my knowledge. I understand that any false statement may lead to the rejection of my application or the cancellation of any appointment made on the basis of it.';
const body2 = 'I agree that the documents attached to this form may be copied and kept by the office for the purpose of processing my application, and that I may ask for them to be returned to me once the process is complete.';
function wrap(text, n) { const out = []; let line = ''; for (const w of text.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } out.push(line); return out; }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function formSvg() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f4eedf"/>`;
  s += `<g font-family="Helvetica, Arial, sans-serif" fill="#1d1b18">`;
  s += `<text x="140" y="200" font-size="68" font-weight="700">Application for Registration</text>`;
  s += `<text x="140" y="256" font-size="30" fill="#4a463f">Form A-17 / please print clearly in capital letters</text>`;
  s += `<line x1="140" y1="285" x2="1560" y2="285" stroke="#1d1b18" stroke-width="4"/>`;
  let y = 380;
  fields.forEach((f, i) => {
    const col = i % 2, x = 140 + col * 730; if (i && col === 0) y += 130;
    s += `<text x="${x}" y="${y}" font-size="28" fill="#4a463f">${esc(f)}</text>`;
    s += `<rect x="${x}" y="${y + 14}" width="680" height="60" fill="none" stroke="#1d1b18" stroke-width="2.5"/>`;
  });
  y += 230;
  s += `<text x="140" y="${y}" font-size="40" font-weight="700">Declaration</text>`;
  y += 70;
  // ~10pt at 205 dpi = 28 px
  for (const para of [body1, body2]) {
    for (const l of wrap(para, 78)) { s += `<text x="140" y="${y}" font-size="28">${esc(l)}</text>`; y += 44; }
    y += 36;
  }
  y += 160;
  s += `<line x1="140" y1="${y}" x2="800" y2="${y}" stroke="#1d1b18" stroke-width="3"/>`;
  s += `<text x="140" y="${y + 44}" font-size="26" fill="#4a463f">Signature</text>`;
  s += `<line x1="1000" y1="${y}" x2="1560" y2="${y}" stroke="#1d1b18" stroke-width="3"/>`;
  s += `<text x="1000" y="${y + 44}" font-size="26" fill="#4a463f">Date</text>`;
  s += `<path d="M180 ${y - 20} c40 -90 70 40 110 -20 s70 -60 110 0 s60 10 120 -30" fill="none" stroke="#1b2a6b" stroke-width="5" stroke-linecap="round"/>`;
  s += `</g></svg>`;
  return s;
}

const base = await sharp(Buffer.from(formSvg())).flatten({ background: '#f4eedf' }).blur(0.9).raw().toBuffer({ resolveWithObject: true });
const { data: baseRaw, info } = base;
console.log('base', info.width, info.height, info.channels);

async function pageJpeg(seed) {
  const rnd = mulberry32(seed);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732; // ~N(0,1)
  const ch = info.channels, buf = Buffer.alloc(info.width * info.height * 3);
  // low-frequency lighting: seeded tilt + vignette, like a phone photo
  const tx = (rnd() - 0.5) * 24, ty = (rnd() - 0.5) * 24;
  for (let y = 0, i = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++, i++) {
      const nx = x / info.width - 0.5, ny = y / info.height - 0.5;
      const light = tx * nx + ty * ny - 30 * (nx * nx + ny * ny);
      const g = gauss() * NOISE, gc = NOISE * 0.35;
      for (let c = 0; c < 3; c++) {
        const v = baseRaw[i * ch + c] + light + g + gauss() * gc;
        buf[i * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(buf, { raw: { width: info.width, height: info.height, channels: 3 } }).blur(0.6).jpeg({ quality: 85, chromaSubsampling: '4:2:0' }).toBuffer();
}

const record = {};
const pageCache = {};
const maxPages = 40;
for (let p = 0; p < maxPages; p++) pageCache[p] = await pageJpeg(1000 + p);
for (const n of [1, 2, 5, 10, 20, 40]) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  let jpegTotal = 0;
  for (let p = 0; p < n; p++) {
    const img = await doc.embedJpg(pageCache[p]);
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    jpegTotal += pageCache[p].length;
  }
  const bytes = await doc.save({ useObjectStreams: false });
  const f = `scan-${n}.pdf`;
  fs.writeFileSync(path.join(OUT, f), bytes);
  record[f] = { bytes: bytes.length, jpegBytesPerPage: Math.round(jpegTotal / n), pages: n };
}
fs.copyFileSync(ROOT + '/src/tools/compress/__fixtures__/text-only.pdf', path.join(OUT, 'typed-1.pdf'));
record['typed-1.pdf'] = { bytes: fs.statSync(path.join(OUT, 'typed-1.pdf')).size, pages: 1 };
fs.writeFileSync(path.join(OUT, 'set.json'), JSON.stringify(record, null, 2));
fs.writeFileSync(path.join(OUT, 'page0.jpg'), pageCache[0]);
console.log(record);
