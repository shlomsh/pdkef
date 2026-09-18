#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACE_CSS, FONT_MANIFEST } from '../src/editor/text/fontManifest.js';
import { licenseFor } from '../src/editor/text/fontLicenses.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const cssPath = join(repoRoot, 'src', 'styles', 'editorFonts.css');
const markdownPath = join(repoRoot, 'THIRD_PARTY_LICENSES.md');
const checkOnly = process.argv.includes('--check');

export function editorCssSource() {
  const sections = [
    `/* GENERATED FILE - do not hand-edit.\n+   Produced by scripts/generate-font-manifest.mjs from src/editor/text/fontManifest.js.\n+   Imported only by /sign/ so these rules do not enter unrelated pages. */`,
  ];
  for (const kind of ['handwriting', 'text']) {
    sections.push(`\n/* --- ${kind === 'handwriting' ? 'Handwriting' : 'Text'} fonts --- */`);
    for (const font of FONT_MANIFEST.filter((entry) => entry.kind === kind)) {
      for (const [face, file] of Object.entries(font.faces)) {
        const css = FACE_CSS[face];
        if (!css) throw new Error(`Unknown face key ${face} on ${font.family}`);
        sections.push(`@font-face {\n  font-family: '${font.family}';\n  font-style: ${css.style};\n  font-weight: ${css.weight};\n  src: url('/fonts/${file}') format('truetype');\n}`);
      }
    }
  }
  return `${sections.join('\n')}\n`;
}

function replaceGeneratedList(markdown, kind, lines) {
  const start = `<!-- BEGIN GENERATED ${kind.toUpperCase()} FONT LIST -->`;
  const end = `<!-- END GENERATED ${kind.toUpperCase()} FONT LIST -->`;
  const replacement = `${start}\n${lines.join('\n')}\n${end}`;
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (!pattern.test(markdown)) throw new Error(`Missing generated-list markers for ${kind} fonts in THIRD_PARTY_LICENSES.md`);
  return markdown.replace(pattern, replacement);
}

export function markdownWithGeneratedFontLists(markdown) {
  let result = markdown;
  for (const kind of ['handwriting', 'text']) {
    const lines = FONT_MANIFEST
      .filter((font) => font.kind === kind)
      .map((font) => `- ${font.family} (<${licenseFor(font.family).url}>)`);
    result = replaceGeneratedList(result, kind, lines);
  }
  return result;
}

function checkOrWrite(path, expected) {
  const current = readFileSync(path, 'utf8');
  if (current === expected) return;
  if (checkOnly) throw new Error(`${path} is stale; run npm run generate:font-manifest`);
  writeFileSync(path, expected);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const cssSource = editorCssSource();
  const markdown = readFileSync(markdownPath, 'utf8');
  const generatedMarkdown = markdownWithGeneratedFontLists(markdown);

  if (checkOnly) {
    checkOrWrite(cssPath, cssSource);
    if (markdown !== generatedMarkdown) throw new Error(`${markdownPath} is stale; run npm run generate:font-manifest`);
    console.log(`Font manifest artifacts are current (${FONT_MANIFEST.length} families).`);
  } else {
    writeFileSync(cssPath, cssSource);
    writeFileSync(markdownPath, generatedMarkdown);
    console.log(`Generated CSS and license lists for ${FONT_MANIFEST.length} families.`);
  }
}
