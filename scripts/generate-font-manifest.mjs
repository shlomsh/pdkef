#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FONT_FAMILY, FONT_MANIFEST, RETIRED_FONTS } from './font-manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const runtimePath = join(repoRoot, 'src', 'editor', 'text', 'fontManifest.js');
const cssPath = join(repoRoot, 'src', 'styles', 'editorFonts.css');
const markdownPath = join(repoRoot, 'THIRD_PARTY_LICENSES.md');
const checkOnly = process.argv.includes('--check');

const FACE_CSS = {
  normal: { weight: 400, style: 'normal' },
  bold: { weight: 700, style: 'normal' },
  italic: { weight: 400, style: 'italic' },
  boldItalic: { weight: 700, style: 'italic' },
};

export function runtimeManifestSource() {
  const runtime = FONT_MANIFEST.map(({ family, kind, styleTag, metrics, faces, acceptance }) => ({
    family, kind, styleTag, metrics, faces, ...(acceptance ? { acceptance } : {}),
  }));
  return `/**\n * GENERATED FILE - do not hand-edit.\n *\n * Produced by scripts/generate-font-manifest.mjs from scripts/font-manifest.mjs.\n+ * Run \`npm run generate:font-manifest\` after changing the canonical manifest.\n */\nexport const FONT_MANIFEST = Object.freeze(${JSON.stringify(runtime, null, 2)});\n\n`
    + `export const FONT_BY_FAMILY = Object.freeze(Object.fromEntries(FONT_MANIFEST.map((font) => [font.family, font])));\n`
    + `export const DEFAULT_FONT_FAMILY = ${JSON.stringify(DEFAULT_FONT_FAMILY)};\n`
    + `export const RETIRED_FONTS = Object.freeze(${JSON.stringify(RETIRED_FONTS, null, 2)});\n`;
}

export function editorCssSource() {
  const sections = [
    `/* GENERATED FILE - do not hand-edit.\n+   Produced by scripts/generate-font-manifest.mjs from scripts/font-manifest.mjs.\n+   Imported only by /sign/ so these rules do not enter unrelated pages. */`,
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
      .map((font) => `- ${font.family} (<${font.license.url}>)`);
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
  const runtimeSource = runtimeManifestSource();
  const cssSource = editorCssSource();
  const markdown = readFileSync(markdownPath, 'utf8');
  const generatedMarkdown = markdownWithGeneratedFontLists(markdown);

  if (checkOnly) {
    checkOrWrite(runtimePath, runtimeSource);
    checkOrWrite(cssPath, cssSource);
    if (markdown !== generatedMarkdown) throw new Error(`${markdownPath} is stale; run npm run generate:font-manifest`);
    console.log(`Font manifest artifacts are current (${FONT_MANIFEST.length} families).`);
  } else {
    writeFileSync(runtimePath, runtimeSource);
    writeFileSync(cssPath, cssSource);
    writeFileSync(markdownPath, generatedMarkdown);
    console.log(`Generated runtime catalogue, CSS, and license lists for ${FONT_MANIFEST.length} families.`);
  }
}
