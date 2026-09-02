#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGE_ACCEPTANCE_MATRIX } from './language-acceptance.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(scriptDir, '..', 'docs', 'language-font-acceptance-matrix.md');
const checkOnly = process.argv.includes('--check');

export function matrixMarkdown() {
  const rows = LANGUAGE_ACCEPTANCE_MATRIX.map((row) => {
    const shaping = row.shaping.status === 'guarded' ? row.shaping.guards.join('<br>') : row.shaping.status;
    const visual = row.visual.guards.join('<br>') || 'pending';
    return `| ${row.order} | ${row.status} | ${row.languages.join(', ')} | ${row.regions.join('; ')} | ${row.families.join(', ') || '—'} | ${row.direction.toUpperCase()} | ${shaping} | ${visual} |`;
  }).join('\n');
  return `# Sign language and font acceptance matrix\n\n`
    + `Generated from [\`scripts/language-acceptance.mjs\`](../scripts/language-acceptance.mjs). Do not edit this table directly.\n\n`
    + `A shipped row means its real alphabet coverage is checked against bundled font bytes; its named Chrome guard covers shaping or records why shaping is not applicable; its sample is exercised through every real supported face for visible ink and searchable PDF text; direction and native digits are part of that sample. Export-render baseline cases add artifact-level visual coverage where listed. Typed signatures remain raster images and are outside the searchable-text claim.\n\n`
    + `| Order | State | Languages | Regional signal | Accepted fonts | Direction | Shaping evidence | Chrome visual evidence |\n`
    + `| ---: | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n`
    + `Simplified and Traditional Chinese stay separate because shared Han code points do not identify the intended regional glyph shapes; the explicit font choice is the signal. Urdu's shipped face is Naskh, not conventional Nastaliq. Planned rows do not become supported until all evidence columns are populated.\n`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const expected = matrixMarkdown();
  if (checkOnly) {
    if (readFileSync(outputPath, 'utf8') !== expected) throw new Error(`${outputPath} is stale; run npm run generate:language-acceptance`);
    console.log(`Language acceptance matrix is current (${LANGUAGE_ACCEPTANCE_MATRIX.length} rollout rows).`);
  } else {
    writeFileSync(outputPath, expected);
    console.log(`Generated language acceptance matrix with ${LANGUAGE_ACCEPTANCE_MATRIX.length} rollout rows.`);
  }
}
