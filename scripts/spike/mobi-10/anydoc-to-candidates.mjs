#!/usr/bin/env node
// MOBI-10 spike: map whatever @firecrawl/anydoc-wasm emits for a PDF into CandidateField[]
// (see scripts/spike/mobi-10/CONTRACT.md).
//
// Verdict, established by reading anydoc_wasm.d.ts and by running toDocument/toMarkdownBytes
// against itc101.pdf and health.pdf (see report-anydoc.md for the full evidence):
//
//   1. `toDocument`, the only structured/JSON output mode the package exposes, is explicitly
//      unsupported for the 'pdf' format ("PDF conversion produces Markdown directly and has no
//      document-model form"). Confirmed empirically: it throws `code: 'unsupported'` for both
//      test PDFs.
//   2. Even where the `Document`/`Block`/`Inline`/`Table`/`Cell` types in anydoc_wasm.d.ts DO
//      apply (non-PDF formats), none of them carry a bounding box, a rect, a position, or a page
//      index. There is no field anywhere in the type surface that could hold geometry.
//   3. The only PDF output mode, `toMarkdownBytes`, returns a plain string. It carries no page
//      breaks (grep for "page"/"\f"/"---" in the raw output finds nothing but Markdown table
//      rule rows) and obviously no coordinates.
//
// So there is nothing in anydoc-wasm's output, for a PDF, that locates anything on a page.
// This script therefore does not run against real output — there is nothing to parse — and
// always writes an empty CandidateField[] array, per CONTRACT.md's instruction not to fabricate
// boxes from Markdown.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
  }
  if (!args.out) {
    throw new Error('usage: node anydoc-to-candidates.mjs --out <dir>');
  }
  return args;
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  mkdirSync(out, { recursive: true });

  // CandidateField[] per CONTRACT.md — empty, see the file header for why.
  const candidates = [];

  const outPath = join(out, 'candidates.pdf-inspector.json');
  writeFileSync(outPath, JSON.stringify(candidates, null, 2));
  console.log(
    `[anydoc-to-candidates] wrote ${outPath}: 0 candidates. ` +
      `anydoc-wasm's only PDF output mode is Markdown (toDocument is unsupported for pdf, ` +
      `confirmed by throwing code='unsupported'), and neither it nor the Document/Block/Inline ` +
      `type surface carries any bounding box, rect, position, or page-index field. ` +
      `Nothing in this library's output locates anything on a page.`,
  );
}

main();
