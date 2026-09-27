import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const [file, n='25'] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const page = await doc.getPage(1);
const c = await page.getTextContent();
for (const it of c.items.slice(0, +n)) console.log(JSON.stringify({ s: it.str, dir: it.dir, t: it.transform.map(v=>+v.toFixed(2)), w: +it.width.toFixed(2), f: it.fontName }));
