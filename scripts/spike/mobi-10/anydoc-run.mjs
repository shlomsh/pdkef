#!/usr/bin/env node
// MOBI-10 spike: run @firecrawl/anydoc-wasm against one PDF in every output mode it exposes,
// and write the raw result of each mode to <out>/anydoc.<mode>.<json|md>.
//
// Usage: node anydoc-run.mjs --input <pdf> --out <dir>
//
// Run once per PDF, as a separate process: the wasm module has been observed to exhaust V8
// memory under sustained repeated use in one process (see report-anydoc.md).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  if (!args.input || !args.out) {
    throw new Error('usage: node anydoc-run.mjs --input <pdf> --out <dir>');
  }
  return args;
}

async function main() {
  const { input, out } = parseArgs(process.argv.slice(2));
  mkdirSync(out, { recursive: true });

  const mod = await import('@firecrawl/anydoc-wasm');
  const { default: init, initSync, toMarkdownBytes, toDocument, formatFromBytes } = mod;
  void init;

  const wasmPath = join(__dirname, 'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
  const wasmBytes = readFileSync(wasmPath);
  initSync({ module: wasmBytes });

  const bytes = new Uint8Array(readFileSync(input));

  const detectedFormat = formatFromBytes(bytes);
  console.log(`[anydoc-run] input=${input} detectedFormat=${detectedFormat}`);

  // Mode 1: markdown (the documented PDF path).
  {
    const t0 = performance.now();
    try {
      const markdown = toMarkdownBytes(bytes, 'pdf');
      const t1 = performance.now();
      writeFileSync(join(out, 'anydoc.markdown.md'), markdown);
      console.log(`[anydoc-run] markdown mode: ok, ${(t1 - t0).toFixed(1)}ms, ${markdown.length} chars`);
    } catch (err) {
      const t1 = performance.now();
      console.log(`[anydoc-run] markdown mode: THREW after ${(t1 - t0).toFixed(1)}ms code=${err.code} message=${err.message}`);
      writeFileSync(
        join(out, 'anydoc.markdown.error.json'),
        JSON.stringify({ code: err.code, message: err.message, pages: err.pages, pageCount: err.pageCount }, null, 2),
      );
    }
  }

  // Mode 2: toDocument (structured document model). README/d.ts say this is explicitly
  // unsupported for PDF ("PDF conversion produces Markdown directly and has no document-model
  // form; use toMarkdownBytes") — run it anyway to record the exact failure mode as evidence.
  {
    const t0 = performance.now();
    try {
      const document = toDocument(bytes, 'pdf');
      const t1 = performance.now();
      writeFileSync(join(out, 'anydoc.document.json'), JSON.stringify(document, null, 2));
      console.log(`[anydoc-run] toDocument mode: ok (unexpected per docs), ${(t1 - t0).toFixed(1)}ms`);
    } catch (err) {
      const t1 = performance.now();
      console.log(`[anydoc-run] toDocument mode: THREW after ${(t1 - t0).toFixed(1)}ms code=${err.code} message=${err.message}`);
      writeFileSync(
        join(out, 'anydoc.document.error.json'),
        JSON.stringify({ code: err.code, message: err.message, pages: err.pages, pageCount: err.pageCount }, null, 2),
      );
    }
  }

  console.log('[anydoc-run] done');
}

main().catch((err) => {
  console.error('[anydoc-run] fatal:', err);
  process.exit(1);
});
