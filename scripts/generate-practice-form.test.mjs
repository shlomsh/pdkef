import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { buildPracticeForm, readColorTokens, resolvePalette } from './generate-practice-form.mjs';
import { fieldLayout, PALETTE_TOKENS } from './practice-form-content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.resolve(here, '../public/images/redaction-guide/sample.pdf');
const TRUTH_JSON = path.resolve(
  here, '../src/tools/sign/fields/corpus/scoring/ground-truth/practice-form-page1.json',
);

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const GLOBAL_CSS_PATH = path.resolve(here, '../src/styles/global.css');

describe('generate-practice-form palette (SNG-10 v2 brand pass)', () => {
  it("resolves every PALETTE_TOKENS role from global.css's own :root block", () => {
    const cssText = fs.readFileSync(GLOBAL_CSS_PATH, 'utf8');
    const palette = resolvePalette(cssText);
    Object.keys(PALETTE_TOKENS).forEach((role) => {
      expect(palette).toHaveProperty(role);
      expect(palette[role]).toHaveLength(3);
      palette[role].forEach((component) => {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      });
    });
  });

  it('reads a literal #rrggbb token out of a fabricated :root block', () => {
    const cssText = ':root {\n  --color-text: #0b4c4c;\n}\n';
    expect(readColorTokens(cssText, ['--color-text'])).toEqual({ '--color-text': '#0b4c4c' });
  });

  it('throws when a requested token is missing from :root', () => {
    const cssText = ':root {\n  --color-text: #0b4c4c;\n}\n';
    expect(() => readColorTokens(cssText, ['--color-muted'])).toThrow(/--color-muted/);
  });

  it('throws when a token is not a literal #rrggbb hex (var()/rgba()/color-mix() indirection)', () => {
    const cssText = ':root {\n  --color-primary: rgba(0, 121, 121, 0.35);\n}\n';
    expect(() => readColorTokens(cssText, ['--color-primary'])).toThrow(/--color-primary/);
  });

  it('throws when the stylesheet has no top-level :root block at all', () => {
    expect(() => readColorTokens('.foo { color: red; }', ['--color-text'])).toThrow(/:root/);
  });
});

describe('generate-practice-form', () => {
  it('is byte-deterministic across two builds', async () => {
    const a = await buildPracticeForm();
    const b = await buildPracticeForm();
    expect(sha256(a.pdfBytes)).toBe(sha256(b.pdfBytes));
  });

  it('matches the committed sample.pdf, so an edit without regenerating fails here', async () => {
    const { pdfBytes } = await buildPracticeForm();
    const committed = fs.readFileSync(SAMPLE_PDF);
    expect(sha256(pdfBytes)).toBe(sha256(committed));
  });

  it('matches the committed ground truth exactly', async () => {
    const { truth } = await buildPracticeForm();
    const committed = JSON.parse(fs.readFileSync(TRUTH_JSON, 'utf8'));
    expect(truth).toEqual(committed);
  });

  it('has no AcroForm and no widget annotations', async () => {
    const { pdfBytes } = await buildPracticeForm();
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.catalog.get(PDFName.of('AcroForm'))).toBeUndefined();
    const annots = doc.getPage(0).node.Annots();
    expect(annots === undefined || annots.size() === 0).toBe(true);
  });

  it('truth targets are exactly the layout\'s own fields, one target each', async () => {
    const { truth } = await buildPracticeForm();
    const layoutIds = fieldLayout().map((field) => field.id).sort();
    const truthIds = truth.targets.map((target) => target.id).sort();
    expect(truthIds).toEqual(layoutIds);
    expect(truth.targets).toHaveLength(fieldLayout().length);
  });
});
