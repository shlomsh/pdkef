#!/usr/bin/env node
// pdf.js 6.x decodes CCITT fax, JBIG2 (scanned/faxed PDFs) and ICC color
// profiles through WASM modules it does not bundle a same-origin URL for by
// default - with no `wasmUrl`, those images fail to decode and pdf.js drops
// them from the page silently (see src/lib/pdfjsWasm.js). This script copies
// the installed pdfjs-dist's wasm assets into public/pdfjs-dist-wasm/ so
// every `getDocument()` call can point `wasmUrl` at a real, same-origin
// directory, the same treatment pdf.worker.min.mjs already gets.
//
// Runs from package.json's `postinstall`, so it's ready before `npm run dev`
// too. Re-run manually (`npm run sync:pdfjs-wasm`) after changing the
// pdfjs-dist version without a full reinstall.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const sourceDir = join(repoRoot, 'node_modules', 'pdfjs-dist', 'wasm');
const targetDir = join(repoRoot, 'public', 'pdfjs-dist-wasm');

// Every filename pdf.worker.mjs concatenates onto `wasmUrl` (JBig2CCITTFaxImage,
// JpxImage, the ICC qcms lookup, and their non-wasm JS fallbacks). Keep this in
// sync with `grep -n "_filename\|_noWasmFilename\|qcms_bg.wasm\|quickjs-eval" node_modules/pdfjs-dist/build/pdf.worker.mjs`.
const FILES = [
  'jbig2.wasm',
  'jbig2_nowasm_fallback.js',
  'openjpeg.wasm',
  'openjpeg_nowasm_fallback.js',
  'qcms_bg.wasm',
  'quickjs-eval.wasm',
  'quickjs-eval.js',
];

mkdirSync(targetDir, { recursive: true });

for (const name of FILES) {
  const source = join(sourceDir, name);
  if (!existsSync(source)) {
    throw new Error(
      `scripts/sync-pdfjs-wasm.mjs: pdfjs-dist is missing wasm/${name}. It ` +
        'likely renamed or dropped a codec asset on upgrade - update FILES ' +
        'here (and re-check src/lib/pdfjsWasm.js) before shipping.',
    );
  }
  copyFileSync(source, join(targetDir, name));
}

console.log(`Synced ${FILES.length} pdf.js wasm assets to public/pdfjs-dist-wasm/`);
