// RED-01 spike checker: reports whether a corpus entry's `secret` and
// `keepText` are still extractable as text anywhere on the page - both from
// the page's content-stream text (pdfjs getTextContent) and from its
// annotations' /Contents (FreeText, form field widgets), since a FreeText
// annotation's text never appears in getTextContent().
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

async function extractAllText(pdfBytes, pageNumber) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);

  const content = await page.getTextContent();
  const contentText = content.items.map((it) => it.str).join('');

  const annotations = await page.getAnnotations({ intent: 'any' });
  const annotationText = annotations
    .map((a) =>
      [a.contentsObj && a.contentsObj.str, a.fieldValue, a.buttonValue].filter((v) => typeof v === 'string').join(' '),
    )
    .join(' ');

  return { contentText, annotationText, combined: contentText + ' ' + annotationText };
}

function isPresent(haystack, needle) {
  if (!needle) return null;
  return haystack.includes(needle);
}

async function checkOne(pdfPath, entry) {
  const bytes = fs.readFileSync(pdfPath);
  const { contentText, annotationText, combined } = await extractAllText(bytes, entry.page);
  return {
    file: entry.file,
    feature: entry.feature,
    secretInContent: isPresent(contentText, entry.secret),
    secretInAnnotations: isPresent(annotationText, entry.secret),
    secretExtractable: isPresent(combined, entry.secret),
    keepTextExtractable: isPresent(combined, entry.keepText),
  };
}

function printTable(rows) {
  const cols = ['file', 'secretExtractable', 'secretInAnnotations', 'keepTextExtractable'];
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) {
    console.log(line(cols.map((c) => r[c])));
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

  const failures = rows.filter((r) => !r.secretExtractable || !r.keepTextExtractable);
  if (failures.length > 0) {
    console.log(`\n${failures.length} of ${rows.length} entries did NOT match the expected baseline (secret + keepText both present):`);
    for (const f of failures) console.log(` - ${f.file}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${rows.length} entries match the baseline: secret present, keepText present.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
