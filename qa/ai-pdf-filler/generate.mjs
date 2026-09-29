/**
 * Writes the four AI-04 trial fixtures, their expected fields and review previews:
 *   node qa/ai-pdf-filler/generate.mjs   (any working directory)
 * The only module that writes files. lib/ modules return bytes/objects and only read fixed repo
 * assets (fonts from public/fonts, pdf.js data from node_modules).
 * Outputs (deterministic): fixtures/<name>.pdf, expected/<name>.json, previews/<name>-expected.jpg.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FORMS, VARIANTS } from './forms.mjs';
import { drawFlatForm } from './lib/draw-form.mjs';
import { buildScanPdf } from './lib/scan.mjs';
import { verifyFixture } from './lib/verify.mjs';
import { buildExpected } from './lib/expected.mjs';
import { renderPreview } from './lib/preview.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(ROOT, '../..');
const OUT = { fixtures: 'fixtures', expected: 'expected', previews: 'previews' };
const JSON_INDENT = 1;

function write(dir, file, content) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const target = path.join(ROOT, dir, file);
  fs.writeFileSync(target, content);
  return path.relative(REPO_ROOT, target);
}

async function generateVariant(variant) {
  const form = FORMS[variant.form];
  const flatBytes = await drawFlatForm(form);
  const scanResult = variant.scan ? await buildScanPdf(flatBytes, variant.scan, `Synthetic scanned test form (${variant.name})`) : null;
  const bytes = scanResult ? scanResult.bytes : flatBytes;

  const held = await verifyFixture(bytes, scanResult ? 'scan' : 'flat');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const fixturePath = path.relative(REPO_ROOT, path.join(ROOT, OUT.fixtures, `${variant.name}.pdf`));
  const expected = buildExpected({ variant, form, sha256, fixturePath, scanResult });

  const written = [
    write(OUT.fixtures, `${variant.name}.pdf`, bytes),
    write(OUT.expected, `${variant.name}.json`, `${JSON.stringify(expected, null, JSON_INDENT)}\n`),
    write(OUT.previews, `${variant.name}-expected.jpg`, await renderPreview(bytes, expected)),
  ];
  console.log(`${variant.name}: ${expected.targets.length} targets, sha256 ${sha256.slice(0, 12)}`);
  console.log(`  verified: ${held.join('; ')}`);
  for (const file of written) console.log(`  wrote ${file}`);
}

// lib/text.mjs imports Sign's .ts export helpers directly, which needs Node's built-in type stripping.
if (!process.features.typescript) {
  throw new Error(`generate.mjs needs Node >= 22.18 (type stripping); this is ${process.version}.`);
}
for (const variant of VARIANTS) await generateVariant(variant);
