import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { classifyPageKind, firstPageKind } from './pageKind.js';
import * as pdfObjects from '../../../editor/adapters/pdf/pdfObjects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const forms = path.join(here, 'corpus', 'scoring', 'forms');

const load = (name) => PDFDocument.load(fs.readFileSync(path.join(forms, name)), {
  ignoreEncryption: true,
  updateMetadata: false,
});
const runs = [[{ str: 'Name' }]];

describe('classifyPageKind', () => {
  it('reports each of the four kinds', () => {
    expect(classifyPageKind({ hasText: true, hasInk: false, hasImage: false })).toBe('text');
    expect(classifyPageKind({ hasText: false, hasInk: true, hasImage: false })).toBe('vector');
    expect(classifyPageKind({ hasText: false, hasInk: false, hasImage: true })).toBe('image');
    expect(classifyPageKind({ hasText: false, hasInk: false, hasImage: false })).toBe('none');
  });

  it('prefers text over vector over image', () => {
    expect(classifyPageKind({ hasText: true, hasInk: true, hasImage: true })).toBe('text');
    expect(classifyPageKind({ hasText: false, hasInk: true, hasImage: true })).toBe('vector');
  });
});

describe('firstPageKind', () => {
  it('is text when the page has text runs, without looking for images', async () => {
    const spy = vi.spyOn(pdfObjects, 'extractPageObjects');
    expect(firstPageKind(await load('irs-1040-2024.pdf'), runs)).toBe('text');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('is vector for a form with axis ink and no text runs', async () => {
    expect(firstPageKind(await load('income-tax-101-2024.pdf'), [[]])).toBe('vector');
  });

  it('is image for a scan with no text runs', async () => {
    const spy = vi.spyOn(pdfObjects, 'extractPageObjects');
    expect(firstPageKind(await load('irs-1040-1970.pdf'), [[]])).toBe('image');
    expect(spy).toHaveBeenCalledTimes(1); // proves the spy sees the call the text case lacks
    spy.mockRestore();
  });

  it('is none for a blank page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(firstPageKind(doc, undefined)).toBe('none');
  });

  it('is none for a document with no pages', async () => {
    expect(firstPageKind(await PDFDocument.create(), [])).toBe('none');
  });

  it('reads a page it cannot open as none instead of throwing into detection', () => {
    const broken = { getPageCount: () => 1, getPage: () => { throw new Error('bad page tree'); } };
    expect(firstPageKind(broken, [])).toBe('none');
  });

  it('reads a probe that throws as "not there" instead of throwing into detection', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const spy = vi.spyOn(pdfObjects, 'extractPageObjects').mockImplementation(() => { throw new Error('bad stream'); });
    try {
      expect(firstPageKind(doc, [[]])).toBe('none');
    } finally {
      spy.mockRestore();
    }
  });
});
