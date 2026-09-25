import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { buildPracticeForm } from './generate-practice-form.mjs';
import { fieldLayout } from './practice-form-content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.resolve(here, '../public/images/redaction-guide/sample.pdf');
const TRUTH_JSON = path.resolve(
  here, '../src/tools/sign/fields/corpus/scoring/ground-truth/practice-form-page1.json',
);

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

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
